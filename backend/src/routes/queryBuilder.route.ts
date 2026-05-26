import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { injectAccountIdFilter, validateSql } from '../utils/sqlGuard';
import { runQuery } from '../services/sql.service';
import { compileQueryPlan, QueryPlan } from '../services/queryBuilder.service';

type ResultRow = Record<string, unknown>;

const FilterValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.number(), z.boolean()])),
]);

const QueryPlanSchema = z.object({
  table: z.string().nullable(),
  joins: z.array(z.object({
    table: z.string(),
    leftCol: z.string(),
    rightCol: z.string(),
    joinType: z.enum(['INNER', 'LEFT', 'RIGHT', 'FULL']).default('INNER'),
    custom: z.boolean().optional(),
  })).default([]),
  columns: z.array(z.object({
    table: z.string(),
    column: z.string(),
    alias: z.string().optional(),
    aggregate: z.enum(['none', 'COUNT', 'SUM', 'AVG', 'MAX', 'MIN']),
  })).default([]),
  filters: z.array(z.object({
    table: z.string(),
    column: z.string(),
    operator: z.enum(['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IN']),
    value: FilterValueSchema,
  })).default([]),
  groupBy: z.array(z.string()).default([]),
  orderBy: z.array(z.object({
    alias: z.string(),
    direction: z.enum(['ASC', 'DESC']),
  })).default([]),
  limit: z.number().int().positive().default(1000),
// satisfies omitted: .default() fields make input types optional which conflicts with QueryPlan's required fields
}) as z.ZodType<QueryPlan, z.ZodTypeDef, unknown>;

const QueryBuilderRequestSchema = z.object({
  plan: QueryPlanSchema,
  accountId: z.coerce.number().int().positive(),
  previewLimit: z.number().int().positive().max(5000).default(50),
});

const router = Router();

function applyAccountFilter(sql: string, accountId: number) {
  const filteredSql = injectAccountIdFilter(sql, String(accountId));
  const validation = validateSql(filteredSql);

  if (!validation.safe || !validation.sanitizedSql) {
    throw new Error(validation.reason || 'Injected SQL failed validation.');
  }

  return validation.sanitizedSql;
}

function normalizePlan(plan: QueryPlan, limit: number): QueryPlan {
  return {
    ...plan,
    limit: Math.max(1, Math.min(limit, Math.floor(plan.limit || limit))),
  };
}

function isNumericValue(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  if (typeof value === 'string') {
    return value.trim() !== '' && Number.isFinite(Number(value));
  }

  return false;
}

function isDateLikeKey(key: string) {
  return /(date|time|on|created|updated|month|year|day)$/i.test(key);
}

function inferChartConfig(plan: QueryPlan, rows: ResultRow[]) {
  const firstRow = rows[0] || {};
  const rowKeys = Object.keys(firstRow);
  const selectedAliases = plan.columns.map((column) => column.alias || (column.aggregate === 'none' ? `${column.table}_${column.column}` : column.aggregate === 'COUNT' ? `count_${column.table}` : `${column.aggregate.toLowerCase()}_${column.table}_${column.column}`));
  const groupByAliases = plan.groupBy.map((groupBy) => groupBy.includes('.') ? groupBy.replace('.', '_') : groupBy);

  const xAxis = groupByAliases[0]
    || selectedAliases.find((alias) => rowKeys.includes(alias) && plan.columns.some((column) => (column.alias || `${column.table}_${column.column}`) === alias && column.aggregate === 'none'))
    || rowKeys[0]
    || 'x';

  const numericKeys = rowKeys.filter((key) => key !== xAxis && isNumericValue(firstRow[key]));
  const metricAliases = selectedAliases.filter((alias) => alias !== xAxis && rowKeys.includes(alias) && isNumericValue(firstRow[alias]));
  const seriesKeys = metricAliases.length > 1 ? metricAliases : numericKeys.filter((key) => key !== metricAliases[0]);
  const yAxis = metricAliases[0] || numericKeys[0] || selectedAliases.find((alias) => alias !== xAxis) || rowKeys[1] || xAxis;

  return {
    xAxis: isDateLikeKey(xAxis) ? xAxis : xAxis,
    yAxis,
    seriesKeys,
  };
}

async function runQueryBuilder(plan: QueryPlan, accountId: number, previewLimit: number, includeChartConfig: boolean) {
  const normalizedPlan = normalizePlan(plan, previewLimit);
  const compiledSql = compileQueryPlan(normalizedPlan);
  const validatedSql = validateSql(compiledSql);

  if (!validatedSql.safe || !validatedSql.sanitizedSql) {
    throw new Error(validatedSql.reason || 'Compiled SQL failed validation.');
  }

  const executableSql = applyAccountFilter(validatedSql.sanitizedSql, accountId);
  const result = await runQuery(executableSql, [], {
    accountId: String(accountId),
    originalSql: compiledSql,
    correctedSql: executableSql,
    retryCount: 0,
    userPrompt: 'query-builder',
  });

  const response: {
    data: ResultRow[];
    rowCount: number;
    sql: string;
    executionTimeMs: number;
    chartConfig?: { xAxis: string; yAxis: string; seriesKeys: string[] };
  } = {
    data: result.data as ResultRow[],
    rowCount: result.rowCount,
    sql: executableSql,
    executionTimeMs: result.executionTimeMs,
  };

  if (includeChartConfig) {
    response.chartConfig = inferChartConfig(normalizedPlan, response.data);
  }

  return response;
}

router.post('/preview', async (req: Request, res: Response) => {
  try {
    const payload = QueryBuilderRequestSchema.omit({ previewLimit: true }).extend({ previewLimit: z.number().int().positive().max(50).default(50) }).parse(req.body);
    const result = await runQueryBuilder(payload.plan, payload.accountId, payload.previewLimit, false);
    return res.json(result);
  } catch (error: any) {
    const message = error?.issues?.[0]?.message || error?.message || 'Unable to preview query.';
    const status = error?.issues || /accountId/i.test(message) || /table/i.test(message) || /column/i.test(message) || /validation/i.test(message) ? 400 : 500;
    return res.status(status).json({ success: false, message });
  }
});

router.post('/execute', async (req: Request, res: Response) => {
  try {
    const payload = QueryBuilderRequestSchema.omit({ previewLimit: true }).extend({ previewLimit: z.number().int().positive().max(5000).default(5000) }).parse(req.body);
    const result = await runQueryBuilder(payload.plan, payload.accountId, payload.previewLimit, true);
    return res.json(result);
  } catch (error: any) {
    const message = error?.issues?.[0]?.message || error?.message || 'Unable to execute query.';
    const status = error?.issues || /accountId/i.test(message) || /table/i.test(message) || /column/i.test(message) || /validation/i.test(message) ? 400 : 500;
    return res.status(status).json({ success: false, message });
  }
});

export default router;
