import { SCHEMA_TABLES } from '../utils/dataModel';

export type AggregateFunction = 'none' | 'COUNT' | 'SUM' | 'AVG' | 'MAX' | 'MIN';

export interface JoinStep {
  table: string;
  leftCol: string;
  rightCol: string;
}

export interface ColumnStep {
  table: string;
  column: string;
  alias?: string;
  aggregate: AggregateFunction;
}

export interface FilterStep {
  table: string;
  column: string;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IN';
  value: string | number | boolean | Array<string | number | boolean>;
}

export interface OrderByStep {
  alias: string;
  direction: 'ASC' | 'DESC';
}

export interface QueryPlan {
  table: string | null;
  joins: JoinStep[];
  columns: ColumnStep[];
  filters: FilterStep[];
  groupBy: string[];
  orderBy: OrderByStep[];
  limit: number;
}

interface ParsedRelation {
  leftTable: string;
  leftColumn: string;
  rightTable: string;
  rightColumn: string;
}

const TABLE_LOOKUP = new Map(SCHEMA_TABLES.map((table) => [table.name, table] as const));
const RELATION_LOOKUP = buildRelationLookup();

function normalizeName(value: string) {
  return value.toLowerCase().trim();
}

function quoteIdentifier(value: string) {
  return `\`${String(value).replace(/`/g, '``')}\``;
}

function escapeSqlString(value: string) {
  return value.replace(/'/g, "''");
}

function isKnownTable(tableName: string) {
  return TABLE_LOOKUP.has(tableName);
}

function getTable(tableName: string) {
  const table = TABLE_LOOKUP.get(tableName);
  if (!table) {
    throw new Error(`Unknown table: ${tableName}`);
  }

  return table;
}

function isKnownColumn(tableName: string, columnName: string) {
  const table = getTable(tableName);
  return table.columns.some((column) => normalizeName(column) === normalizeName(columnName));
}

function parseRelation(relation: string): ParsedRelation | null {
  const match = relation.match(/^([^.]+)\.([^\s]+)\s*->\s*([^.]+)\.([^\s]+)$/);

  if (!match) {
    return null;
  }

  return {
    leftTable: normalizeName(match[1]),
    leftColumn: normalizeName(match[2]),
    rightTable: normalizeName(match[3]),
    rightColumn: normalizeName(match[4]),
  };
}

function relationKey(a: string, b: string) {
  return [normalizeName(a), normalizeName(b)].sort().join('|');
}

function buildRelationLookup() {
  const lookup = new Map<string, ParsedRelation>();

  for (const table of SCHEMA_TABLES) {
    for (const relation of table.relations || []) {
      const parsed = parseRelation(relation);
      if (!parsed) {
        continue;
      }

      lookup.set(relationKey(parsed.leftTable, parsed.rightTable), parsed);
      lookup.set(relationKey(parsed.rightTable, parsed.leftTable), {
        leftTable: parsed.rightTable,
        leftColumn: parsed.rightColumn,
        rightTable: parsed.leftTable,
        rightColumn: parsed.leftColumn,
      });
    }
  }

  return lookup;
}

function isDateLikeColumn(columnName: string) {
  return /(date|time|on|created|updated|from|to|month|year|day)$/i.test(columnName) || /(posting|joining|stage)/i.test(columnName);
}

function isNumericValue(value: string | number | boolean | Array<string | number | boolean>) {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  if (typeof value === 'boolean') {
    return true;
  }

  if (typeof value === 'string') {
    return /^-?\d+(?:\.\d+)?$/.test(value.trim());
  }

  return false;
}

function normalizeFilterValue(value: string | number | boolean): string | number | boolean {
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  const trimmed = value.trim();
  if (/^-?\d+$/.test(trimmed)) {
    return Number(trimmed);
  }

  if (/^-?\d+\.\d+$/.test(trimmed)) {
    return Number(trimmed);
  }

  if (trimmed.toLowerCase() === 'true') {
    return true;
  }

  if (trimmed.toLowerCase() === 'false') {
    return false;
  }

  return trimmed;
}

function formatLiteral(value: string | number | boolean, columnName: string) {
  const normalized = normalizeFilterValue(value);

  if (typeof normalized === 'boolean') {
    return normalized ? '1' : '0';
  }

  if (typeof normalized === 'number') {
    if (isDateLikeColumn(columnName)) {
      return `FROM_UNIXTIME(${normalized})`;
    }

    return String(normalized);
  }

  if (isDateLikeColumn(columnName) && isNumericValue(normalized)) {
    return `FROM_UNIXTIME(${normalized})`;
  }

  return `'${escapeSqlString(normalized)}'`;
}

function formatColumnReference(tableName: string, columnName: string) {
  return `${quoteIdentifier(tableName)}.${quoteIdentifier(columnName)}`;
}

function defaultColumnAlias(tableName: string, columnName: string) {
  return `${normalizeName(tableName)}_${normalizeName(columnName)}`;
}

function defaultAggregateAlias(step: ColumnStep) {
  if (step.aggregate === 'COUNT') {
    return `count_${normalizeName(step.table)}`;
  }

  return `${normalizeName(step.aggregate)}_${normalizeName(step.table)}_${normalizeName(step.column)}`;
}

function resolveJoinRelation(baseTable: string, joinStep: JoinStep) {
  const relation = RELATION_LOOKUP.get(relationKey(baseTable, joinStep.table));

  if (!relation) {
    throw new Error(`No relation found between ${baseTable} and ${joinStep.table}.`);
  }

  const baseTableName = normalizeName(baseTable);
  const joinTableName = normalizeName(joinStep.table);
  const expectedMatch =
    (normalizeName(relation.leftTable) === baseTableName && normalizeName(relation.rightTable) === joinTableName && normalizeName(relation.leftColumn) === normalizeName(joinStep.leftCol) && normalizeName(relation.rightColumn) === normalizeName(joinStep.rightCol)) ||
    (normalizeName(relation.leftTable) === joinTableName && normalizeName(relation.rightTable) === baseTableName && normalizeName(relation.leftColumn) === normalizeName(joinStep.leftCol) && normalizeName(relation.rightColumn) === normalizeName(joinStep.rightCol));

  if (!expectedMatch) {
    const fallbackRelation = RELATION_LOOKUP.get(relationKey(joinStep.table, baseTable));
    if (!fallbackRelation) {
      throw new Error(`Join columns do not match schema relation for ${baseTable} and ${joinStep.table}.`);
    }
  }

  return relation;
}

function buildSelectExpression(step: ColumnStep) {
  if (!isKnownTable(step.table)) {
    throw new Error(`Unknown table in select column: ${step.table}`);
  }

  if (!isKnownColumn(step.table, step.column)) {
    throw new Error(`Unknown column ${step.table}.${step.column}`);
  }

  const columnReference = formatColumnReference(step.table, step.column);

  if (step.aggregate === 'none') {
    return `${columnReference} AS ${quoteIdentifier(step.alias || defaultColumnAlias(step.table, step.column))}`;
  }

  if (step.aggregate === 'COUNT') {
    return `COUNT(*) AS ${quoteIdentifier(step.alias || defaultAggregateAlias(step))}`;
  }

  return `${step.aggregate}(${columnReference}) AS ${quoteIdentifier(step.alias || defaultAggregateAlias(step))}`;
}

function buildJoinClause(baseTable: string, joinStep: JoinStep) {
  if (!isKnownTable(joinStep.table)) {
    throw new Error(`Unknown join table: ${joinStep.table}`);
  }

  if (!isKnownColumn(baseTable, joinStep.leftCol)) {
    throw new Error(`Unknown join column ${baseTable}.${joinStep.leftCol}`);
  }

  if (!isKnownColumn(joinStep.table, joinStep.rightCol)) {
    throw new Error(`Unknown join column ${joinStep.table}.${joinStep.rightCol}`);
  }

  resolveJoinRelation(baseTable, joinStep);

  return `INNER JOIN ${quoteIdentifier(joinStep.table)} ON ${formatColumnReference(baseTable, joinStep.leftCol)} = ${formatColumnReference(joinStep.table, joinStep.rightCol)}`;
}

function buildFilterExpression(filter: FilterStep) {
  if (!isKnownTable(filter.table)) {
    throw new Error(`Unknown table in filter: ${filter.table}`);
  }

  if (!isKnownColumn(filter.table, filter.column)) {
    throw new Error(`Unknown filter column ${filter.table}.${filter.column}`);
  }

  const columnReference = formatColumnReference(filter.table, filter.column);

  if (filter.operator === 'IN') {
    const values = Array.isArray(filter.value) ? filter.value : String(filter.value).split(',').map((item) => item.trim()).filter(Boolean);

    if (values.length === 0) {
      throw new Error(`Filter IN value list is empty for ${filter.table}.${filter.column}`);
    }

    const list = values
      .map((value) => {
        const normalized = normalizeFilterValue(value);
        if (typeof normalized === 'boolean') {
          return normalized ? '1' : '0';
        }

        if (typeof normalized === 'number') {
          return isDateLikeColumn(filter.column) ? `FROM_UNIXTIME(${normalized})` : String(normalized);
        }

        if (isDateLikeColumn(filter.column) && isNumericValue(normalized)) {
          return `FROM_UNIXTIME(${normalized})`;
        }

        return `'${escapeSqlString(normalized)}'`;
      })
      .join(', ');

    return `${columnReference} IN (${list})`;
  }

  const literal = formatLiteral(filter.value as string | number | boolean, filter.column);
  const leftSide = isDateLikeColumn(filter.column) && !literal.startsWith('FROM_UNIXTIME(') ? `FROM_UNIXTIME(${columnReference})` : columnReference;

  return `${leftSide} ${filter.operator} ${literal}`;
}

function buildGroupByExpressions(plan: QueryPlan) {
  const explicitGroupBy = plan.groupBy.filter(Boolean).map((value) => value.trim());

  const rawSelectedColumns = plan.columns
    .filter((column) => column.aggregate === 'none')
    .map((column) => formatColumnReference(column.table, column.column));

  const hasAggregates = plan.columns.some((column) => column.aggregate !== 'none');

  if (!hasAggregates) {
    return explicitGroupBy.length > 0 ? explicitGroupBy : rawSelectedColumns;
  }

  const combined = [...explicitGroupBy, ...rawSelectedColumns];
  const uniqueGroupBy: string[] = [];
  const seen = new Set<string>();

  for (const expression of combined) {
    const key = canonicalGroupByKey(expression);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueGroupBy.push(expression);
  }

  return uniqueGroupBy;
}

function buildOrderByExpressions(plan: QueryPlan) {
  return plan.orderBy
    .filter((item) => item.alias.trim().length > 0)
    .map((item) => `${quoteIdentifier(item.alias.trim())} ${item.direction}`);
}

function canonicalGroupByKey(value: string) {
  return value.replace(/`/g, '').replace(/\s+/g, '').toLowerCase();
}

export function compileQueryPlan(plan: QueryPlan): string {
  if (!plan.table) {
    throw new Error('A base table is required.');
  }

  if (!isKnownTable(plan.table)) {
    throw new Error(`Unknown base table: ${plan.table}`);
  }

  if (!Array.isArray(plan.columns) || plan.columns.length === 0) {
    throw new Error('At least one column must be selected.');
  }

  const selectExpressions = plan.columns.map(buildSelectExpression);
  const joinClauses = plan.joins.map((joinStep) => buildJoinClause(plan.table as string, joinStep));
  const filterExpressions = plan.filters.map(buildFilterExpression);
  const groupByExpressions = buildGroupByExpressions(plan);
  const orderByExpressions = buildOrderByExpressions(plan);
  const limit = Math.max(1, Math.min(5000, Math.floor(plan.limit || 1000)));

  const queryParts = [
    `SELECT ${selectExpressions.join(', ')}`,
    `FROM ${quoteIdentifier(plan.table)}`,
    ...joinClauses,
  ];

  if (filterExpressions.length > 0) {
    queryParts.push(`WHERE ${filterExpressions.join(' AND ')}`);
  }

  if (groupByExpressions.length > 0) {
    queryParts.push(`GROUP BY ${groupByExpressions.join(', ')}`);
  }

  if (orderByExpressions.length > 0) {
    queryParts.push(`ORDER BY ${orderByExpressions.join(', ')}`);
  }

  queryParts.push(`LIMIT ${limit}`);

  return queryParts.join(' ');
}
