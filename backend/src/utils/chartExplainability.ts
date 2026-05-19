import { SEMANTIC_METRICS } from './semanticMetrics';

interface ExplainabilityInput {
  title?: string | null;
  prompt?: string | null;
  sql?: string | null;
  reasoning?: string | null;
  chartType?: string | null;
  chartConfig?: {
    xAxis?: string;
    yAxis?: string;
    seriesKeys?: string[];
  } | null;
}

function normalize(value?: string | null) {
  return (value || '').toLowerCase();
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function inferMetricLineage(input: ExplainabilityInput) {
  const searchableText = normalize([
    input.title,
    input.prompt,
    input.sql,
    input.reasoning,
    input.chartConfig?.xAxis,
    input.chartConfig?.yAxis,
    ...(input.chartConfig?.seriesKeys || []),
  ].filter(Boolean).join(' '));

  return SEMANTIC_METRICS
    .map((metric) => {
      const nameTokens = metric.name.toLowerCase().split(/\s+/).filter((token) => token.length > 2);
      const promptMatches = nameTokens.filter((token) => searchableText.includes(token));
      const sqlMatches = [
        searchableText.includes(metric.primaryTable.toLowerCase()) ? metric.primaryTable : '',
        ...metric.dimensions.filter((dimension) => searchableText.includes(dimension.toLowerCase())),
      ].filter(Boolean);
      const score = promptMatches.length + sqlMatches.length;

      if (score === 0) {
        return null;
      }

      return {
        metricId: metric.id,
        name: metric.name,
        description: metric.description,
        matchedBy: unique([...promptMatches, ...sqlMatches]),
      };
    })
    .filter(Boolean);
}

export function estimateQueryConfidence(input: ExplainabilityInput) {
  const factors: string[] = [];
  let score = 40;
  const sql = input.sql || '';

  if (/^\s*select\b/i.test(sql)) {
    score += 15;
    factors.push('Read-only SELECT query');
  }

  if (/\blimit\b/i.test(sql)) {
    score += 8;
    factors.push('Result size is bounded');
  }

  if (/\bgroup\s+by\b/i.test(sql) || input.chartType === 'table') {
    score += 10;
    factors.push(input.chartType === 'table' ? 'Table summary does not require chart aggregation' : 'Query includes explicit grouping');
  }

  if (input.chartConfig?.xAxis && input.chartConfig?.yAxis) {
    score += 10;
    factors.push('Chart axes are mapped');
  }

  if (input.reasoning) {
    score += 7;
    factors.push('LLM provided chart reasoning');
  }

  const lineage = inferMetricLineage(input);

  if (lineage.length > 0) {
    score += 10;
    factors.push('Matched semantic metric definitions');
  } else {
    factors.push('No semantic metric match found');
  }

  return {
    score: Math.max(0, Math.min(score, 98)),
    factors,
  };
}

export function buildAiExplanation(input: ExplainabilityInput) {
  const metricLineage = inferMetricLineage(input);
  const axisText = input.chartConfig?.xAxis && input.chartConfig?.yAxis
    ? `It maps ${input.chartConfig.yAxis} by ${input.chartConfig.xAxis}`
    : 'It returns a tabular analytics result';
  const metricText = metricLineage.length
    ? ` using ${metricLineage.map((metric) => metric?.name).join(', ')} definitions`
    : '';
  const reasoningText = input.reasoning ? ` The model reasoning was: ${input.reasoning}` : '';

  return `${axisText}${metricText}.${reasoningText}`.trim();
}

export function buildChartExplainability(input: ExplainabilityInput) {
  return {
    aiExplanation: buildAiExplanation(input),
    queryConfidence: estimateQueryConfidence(input),
    metricLineage: inferMetricLineage(input),
  };
}
