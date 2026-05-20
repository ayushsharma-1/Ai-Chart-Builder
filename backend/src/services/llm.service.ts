import groq from '../config/groq';

// Simple validator to detect alias usage in GROUP BY and basic aggregate/group mismatches.
export function validateSqlForOnlyFullGroupBy(sql: string): string | null {
  if (!sql || typeof sql !== 'string') return null;

  const branches = splitUnionAllBranches(sql);
  for (const branch of branches) {
    const branchError = validateSingleSelectBranch(branch);
    if (branchError) return branchError;
  }

  return null;
}

function splitUnionAllBranches(sql: string): string[] {
  const branches: string[] = [];
  const parts = sql.split(/\bUNION\s+ALL\b/i);
  for (const part of parts) {
    const trimmed = part.trim().replace(/^\(+/, '').replace(/\)+$/, '');
    if (trimmed) branches.push(trimmed);
  }
  return branches.length > 0 ? branches : [sql];
}

function validateSingleSelectBranch(sql: string): string | null {
  const hasAggregate = /\b(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(sql);
  const selectClause = extractSelectClause(sql);
  const groupBy = extractGroupByClause(sql);
  const aliases = findAliases(selectClause);

  if (hasAggregate && !groupBy.trim()) {
    const selectPieces = selectClause
      .replace(/\b(COUNT|SUM|AVG|MIN|MAX)\s*\([\s\S]*?\)/gi, '')
      .split(',')
      .map((piece) => piece.trim())
      .filter(Boolean);

    if (selectPieces.length > 1) {
      return 'Aggregates present but no GROUP BY — non-aggregated fields detected.';
    }
  }

  if (groupBy && /\b(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(groupBy)) {
    return 'GROUP BY clause cannot contain aggregate functions (COUNT, SUM, AVG, MIN, MAX). Remove the aggregate expression from the GROUP BY clause.';
  }

  if (aliases.length && groupBy) {
    for (const alias of aliases) {
      const re = new RegExp(String.raw`\b${alias}\b`, 'i');
      if (re.test(groupBy)) {
        return `GROUP BY references SELECT alias '${alias}'. Use the full expression instead: repeat the source expression from SELECT.`;
      }
    }
  }

  return null;
}

interface InsightChartInput {
  id: string;
  title: string;
  chartType: string;
  rowCount: number;
  xAxis?: string;
  yAxis?: string;
  sampleRows: unknown[];
}

export async function generateDashboardInsights(reportTitle: string, charts: InsightChartInput[]) {
  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content: [
          'You are an analytics narrator. Summarize dashboard-level insights from chart metadata and row samples.',
          'Do not invent numbers not present in the input. If evidence is thin, say what changed qualitatively.',
          'Return only valid JSON with shape {"summary":"...","insights":[{"type":"trend|anomaly|change|metric","title":"...","detail":"...","severity":"info|warning|success","chartId":"..."}]}.',
        ].join(' '),
      },
      { role: 'user', content: JSON.stringify({ reportTitle, charts }) },
    ],
    temperature: 0.2,
    max_tokens: 900,
    response_format: { type: 'json_object' },
  });

  const raw = completion.choices[0]?.message?.content;

  if (!raw) {
    throw new Error('LLM returned empty insight response');
  }

  return JSON.parse(raw) as {
    summary: string;
    insights: Array<{
      type: 'trend' | 'anomaly' | 'change' | 'metric';
      title: string;
      detail: string;
      severity: 'info' | 'warning' | 'success';
      chartId?: string;
    }>;
  };
}

export async function generateSqlExplanation(sql: string, chartTitle: string): Promise<string> {
  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content: [
          'You are a data analyst explaining SQL queries to non-technical business users.',
          'Explain what this SQL query does in 2-3 plain English sentences.',
          'Focus on what data is being retrieved, what time range is applied, and what grouping or aggregation is happening.',
          'Do not mention SQL syntax. Do not say "the query". Start directly with what the data shows.',
        ].join(' '),
      },
      {
        role: 'user',
        content: `Chart title: "${chartTitle}"\nSQL: ${sql}`,
      },
    ],
    temperature: 0.3,
    max_tokens: 200,
  });

  return completion.choices[0]?.message?.content || 'No explanation available.';
}

// Helper utilities for SQL validation
function extractSelectClause(s: string): string {
  const m = /select([\s\S]*?)from/i.exec(s);
  return m ? m[1] : '';
}

function extractGroupByClause(s: string): string {
  const m = /group\s+by\s+([\s\S]*?)(order\s+by|limit|$)/i.exec(s);
  return m ? m[1] : '';
}

function findAliases(selectClause: string): string[] {
  const re = /\bAS\s+((?!\d)\w+)/gi;
  const out: string[] = [];
  let am;
  while ((am = re.exec(selectClause)) !== null) {
    if (am[1]) out.push(am[1]);
  }
  return out;
}
