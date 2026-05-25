import groq from '../config/groq';
import { validateSql } from '../utils/sqlGuard';
import {
  FROZEN_COLUMN_CORRECTIONS,
  FROZEN_SQL_RULES,
  FROZEN_DISTINCT_RULES,
  FROZEN_WINDOW_FUNCTION_RULES,
} from '../utils/promptTokens';
import { logAICall } from '../utils/aiMetricsLogger';

const FIX_SYSTEM_PROMPT = `
You are a MySQL 8 SQL repair specialist.
You will receive a broken SQL query and the exact MySQL error it produced.
Your job is to return ONLY the corrected SQL — no explanation, no markdown.
Just the fixed SELECT statement.

DATABASE: recruitcrm_normlized
ALLOWED TABLES: tblcandidate, tblassignjobcandidate, tbldeals, tbljob

COMMON ERROR PATTERNS AND FIXES:
1. "Unknown column 'deal.deleted'" -> tbldeals has NO deleted column, use archived = 0
2. "Unknown column 'job.jobid'" -> tbljob primary key is 'id' not 'jobid'
3. "Unknown column 'deal.companyname'" -> tbldeals has no companyname, use relatedcompany (int)
4. "Unknown column 'deal.billingamount'" -> tbldeals has no billingamount, use dealvalue
5. "Unknown column 'job.companyname'" -> tbljob has no companyname, use companyid (int)
6. "Unknown column 'job.category'" -> correct column is job_category
7. "Unknown column 'assignment.placementdate'" -> correct column is joiningdate
8. "Unknown column 'job.ownerid'" -> ownerid exists but alias must be tbljob.ownerid
9. "Unknown column 'job.source'" -> tbljob has no source column. Use sourceid (int) joined to the source lookup table if available, or use tblassignjobcandidate.companyname as a grouping dimension instead. Never guess jobsource.
10. ONLY_FULL_GROUP_BY / PARTITION BY errors -> remove window functions and rewrite with flat subqueries
11. Nested aggregates -> wrap inner aggregation in subquery/CTE first

Respond with ONLY the corrected SQL SELECT statement. No markdown. No explanation.
`.trim();

const VALIDATION_FIX_SYSTEM_PROMPT = [
  'You are a MySQL 8 SQL repair specialist.',
  'You will receive a broken SQL query and validation issues from the AST gate.',
  'Return ONLY the corrected SQL SELECT statement. No explanation, no markdown.',
  '',
  FROZEN_SQL_RULES,
  FROZEN_DISTINCT_RULES,
  FROZEN_WINDOW_FUNCTION_RULES,
  FROZEN_COLUMN_CORRECTIONS,
].join('\n\n').trim();

export interface RunFixAgentInput {
  sql: string;
  mode: 'validation' | 'execution';
  validationIssues?: string[];
  mysqlError?: string;
  sessionId?: string;
  userPrompt?: string;
}

export async function runFixAgent(input: RunFixAgentInput): Promise<{ fixedSql: string | null; fixed: boolean }> {
  const start = Date.now();
  let usage: any;
  let success = false;
  let errorMessage: string | undefined;

  const systemPrompt = input.mode === 'validation' ? VALIDATION_FIX_SYSTEM_PROMPT : FIX_SYSTEM_PROMPT;
  const userMessage = input.mode === 'validation'
    ? [
        `BROKEN SQL:\n${input.sql}`,
        `VALIDATION ISSUES:\n${(input.validationIssues || []).join('\n') || 'Unknown validation failure'}`,
        'Return ONLY the corrected SQL.',
      ].join('\n\n')
    : [
        `BROKEN SQL:\n${input.sql}`,
        `MYSQL ERROR:\n${input.mysqlError || 'Unknown MySQL error'}`,
        'Return ONLY the corrected SQL.',
      ].join('\n\n');

  try {
    const completion = await groq.chat.completions.create({
      model: 'openai/gpt-oss-120b',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0,
      max_tokens: 800,
    });

    usage = completion.usage;
    const raw = completion.choices[0]?.message?.content?.trim() || '';
    const cleaned = raw.replace(/^```sql\s*/i, '').replace(/```$/, '').trim();

    const guard = validateSql(cleaned);
    if (!guard.safe || !guard.sanitizedSql) {
      console.warn('[FixAgent] Fixed SQL failed guard:', guard.reason);
      return { fixedSql: null, fixed: false };
    }

    success = true;
    console.info('[FixAgent] Successfully fixed SQL');
    return { fixedSql: guard.sanitizedSql, fixed: true };
  } catch (err: any) {
    errorMessage = err?.message || String(err);
    console.error('[FixAgent] Failed:', errorMessage);
    return { fixedSql: null, fixed: false };
  } finally {
    logAICall({
      callType: 'fix_agent',
      model: 'openai/gpt-oss-120b',
      userPrompt: input.userPrompt,
      success,
      errorMessage,
      latencyMs: Date.now() - start,
      usage,
      sessionId: input.sessionId,
      errorDetails: {
        mode: input.mode,
        reason: input.mode === 'validation' ? (input.validationIssues || []).join(' | ') || undefined : input.mysqlError,
      },
    });
  }
}