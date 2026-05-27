import { Parser, Select } from 'node-sql-parser';

const parser = new Parser();

const ALLOWED_TABLES = new Set([
  'tblcandidate',
  'tblassignjobcandidate',
  'tbldeals',
  'tbljob',
]);

const MAX_ROWS = 10000;
export const QUERY_TIMEOUT_MS = 10000;

export interface SqlGuardResult {
  safe: boolean;
  reason?: string;
  sanitizedSql?: string;
  transformations?: string[];
}

export interface ReservedAliasNormalizationResult {
  sql: string;
  aliasMap: Record<string, string>;
  rewrittenAliases: string[];
}

export interface SemanticAliasRewriteResult {
  sql: string;
  rewrittenAliases: string[];
}

const FORBIDDEN_OUTPUT_CLAUSES = ['INTO OUTFILE', 'INTO DUMPFILE'];
const FORBIDDEN_SYSTEM_REFS = [
  '@@datadir',
  '@@basedir',
  '@@secure_file_priv',
  '@@global',
  '@@session',
  'information_schema',
  'performance_schema',
  'mysql.user',
  'mysql.db',
];


const FORBIDDEN_FUNCTION_NAMES = new Set([
  'LOAD_FILE',
  'SLEEP',
  'BENCHMARK',
  'GET_LOCK',
  'RELEASE_LOCK',
  'IS_FREE_LOCK',
  'IS_USED_LOCK',
  'MASTER_POS_WAIT',
  'CURRENT_USER',
  'SESSION_USER',
  'SYSTEM_USER',
]);

const RESERVED_ALIAS_REWRITE_MAP = new Map([
  ['rank', 'row_rank'],
  ['group', 'group_name'],
  ['order', 'sort_order'],
]);

const RESERVED_ALIAS_BLOCKLIST = new Set([
  'rank',
  'group',
  'order',
  'key',
  'index',
  'table',
  'rows',
]);

function normalizeName(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function normalizeTableName(value: unknown): string {
  return normalizeName(value).split('.').pop() || '';
}

function collectNodes(node: any, targetType: string, results: any[] = []): any[] {
  if (!node || typeof node !== 'object') return results;

  if (node.type === targetType) results.push(node);

  for (const key of Object.keys(node)) {
    const child = node[key];
    if (Array.isArray(child)) {
      child.forEach((item) => collectNodes(item, targetType, results));
    } else if (child && typeof child === 'object') {
      collectNodes(child, targetType, results);
    }
  }

  return results;
}

function collectFunctions(node: any, results: any[] = []): any[] {
  if (!node || typeof node !== 'object') return results;

  if (node.type === 'function' || node.type === 'aggr_func') results.push(node);

  for (const key of Object.keys(node)) {
    const child = node[key];
    if (Array.isArray(child)) {
      child.forEach((item) => collectFunctions(item, results));
    } else if (child && typeof child === 'object') {
      collectFunctions(child, results);
    }
  }

  return results;
}

function collectColumnRefs(node: any, results: Array<{ table: string | null; column: string }> = []): typeof results {
  if (!node || typeof node !== 'object') return results;

  if (node.type === 'column_ref') {
    results.push({
      table: node.table ? normalizeName(node.table) : null,
      column: node.column ? normalizeName(node.column) : '',
    });
    return results;
  }

  for (const key of Object.keys(node)) {
    const child = node[key];
    if (Array.isArray(child)) {
      child.forEach((item) => collectColumnRefs(item, results));
    } else if (child && typeof child === 'object') {
      collectColumnRefs(child, results);
    }
  }

  return results;
}

export function extractTableNames(sql: string): string[] {
  const cteNames = new Set<string>();
  const cteRegex = /\bWITH\b[\s\S]*?(\w+)\s+AS\s*\(/gi;
  let cteMatch: RegExpExecArray | null;

  while ((cteMatch = cteRegex.exec(sql)) !== null) {
    if (cteMatch[1]) {
      cteNames.add(cteMatch[1].toLowerCase());
    }
  }

  const tableRegex = /\bFROM\s+([\w.]+)|\bJOIN\s+([\w.]+)/gi;
  const tables: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = tableRegex.exec(sql)) !== null) {
    const tableName = (match[1] || match[2] || '').toLowerCase().split('.').pop() || '';
    if (tableName && !cteNames.has(tableName)) {
      tables.push(tableName);
    }
  }

  return tables;
}

function collectCteNames(ast: any): string[] {
  const withClause = ast?.with;
  if (!withClause) return [];

  const items = Array.isArray(withClause) ? withClause : [withClause];
  const names: string[] = [];

  for (const item of items) {
    const rawName = item?.name?.value ?? item?.name ?? item?.alias ?? item?.cte?.name;
    const normalized = normalizeName(rawName);
    if (normalized) names.push(normalized);
  }

  return names;
}

function collectTableNames(ast: Select, scopeCteNames: Set<string> = new Set()): string[] {
  const names: string[] = [];

  const addFromItems = (fromItems: any[]) => {
    if (!Array.isArray(fromItems)) return;

    for (const item of fromItems) {
      const tableName = normalizeTableName(item?.table);
      if (tableName && !scopeCteNames.has(tableName)) {
        names.push(tableName);
      }

      const nestedSelect = item?.expr?.ast || (item?.expr?.type === 'select' ? item.expr : null);
      if (nestedSelect) {
        names.push(...collectTableNames(nestedSelect as Select, scopeCteNames));
      }
    }
  };

  let fromItems: any[] = [];
  if (Array.isArray(ast.from)) {
    fromItems = ast.from;
  } else if (ast.from) {
    fromItems = [ast.from];
  }
  addFromItems(fromItems);

  return names;
}

function getGroupByExpressions(groupBy: any): any[] {
  if (!groupBy) return [];
  if (Array.isArray(groupBy)) return groupBy;
  if (Array.isArray(groupBy.columns)) return groupBy.columns;
  if (groupBy.columns) return [groupBy.columns];
  return [groupBy];
}

function expressionContainsAggregate(expr: any): boolean {
  if (!expr || typeof expr !== 'object') return false;

  if (expr.type === 'aggr_func') return true;

  for (const key of Object.keys(expr)) {
    const child = expr[key];
    if (Array.isArray(child)) {
      if (child.some((item) => expressionContainsAggregate(item))) return true;
    } else if (child && typeof child === 'object') {
      if (expressionContainsAggregate(child)) return true;
    }
  }

  return false;
}

function rewriteIdentifiers(node: any, aliasMap: Record<string, string>, rewrittenAliases: Set<string>): void {
  if (!node || typeof node !== 'object') return;

  if (node.type === 'column_ref') {
    if (node.table) {
      const tableKey = normalizeName(node.table);
      const tableReplacement = aliasMap[tableKey];
      if (tableReplacement) {
        rewrittenAliases.add(tableKey);
        node.table = tableReplacement;
      }
    }

    if (node.column) {
      const columnKey = normalizeName(node.column);
      const columnReplacement = aliasMap[columnKey];
      if (columnReplacement) {
        rewrittenAliases.add(columnKey);
        node.column = columnReplacement;
      }
    }
  }

  if (Array.isArray(node.columns)) {
    for (const column of node.columns) {
      if (column?.as) {
        const aliasKey = normalizeName(column.as);
        const replacement = aliasMap[aliasKey];
        if (replacement) {
          rewrittenAliases.add(aliasKey);
          column.as = replacement;
        }
      }
    }
  }

  if (Array.isArray(node.from)) {
    for (const fromItem of node.from) {
      if (fromItem?.as) {
        const aliasKey = normalizeName(fromItem.as);
        const replacement = aliasMap[aliasKey];
        if (replacement) {
          rewrittenAliases.add(aliasKey);
          fromItem.as = replacement;
        }
      }
    }
  }

  for (const key of Object.keys(node)) {
    const child = node[key];
    if (Array.isArray(child)) {
      child.forEach((item) => rewriteIdentifiers(item, aliasMap, rewrittenAliases));
    } else if (child && typeof child === 'object') {
      rewriteIdentifiers(child, aliasMap, rewrittenAliases);
    }
  }
}

function collectAliasCandidates(ast: any): string[] {
  const candidates = new Set<string>();

  for (const selectNode of [ast, ...collectNodes(ast, 'select').filter((node) => node !== ast)]) {
    for (const column of selectNode?.columns || []) {
      const alias = normalizeName(column?.as);
      if (alias && RESERVED_ALIAS_REWRITE_MAP.has(alias)) {
        candidates.add(alias);
      }
    }

    for (const fromItem of selectNode?.from || []) {
      const alias = normalizeName(fromItem?.as);
      if (alias && RESERVED_ALIAS_REWRITE_MAP.has(alias)) {
        candidates.add(alias);
      }
    }
  }

  return [...candidates];
}

function collectBlockedAliasUsage(ast: any): string[] {
  const blocked = new Set<string>();

  for (const selectNode of [ast, ...collectNodes(ast, 'select').filter((node) => node !== ast)]) {
    for (const column of selectNode?.columns || []) {
      const alias = normalizeName(column?.as);
      if (alias && RESERVED_ALIAS_BLOCKLIST.has(alias)) {
        blocked.add(alias);
      }
    }

    for (const fromItem of selectNode?.from || []) {
      const alias = normalizeName(fromItem?.as);
      if (alias && RESERVED_ALIAS_BLOCKLIST.has(alias)) {
        blocked.add(alias);
      }
    }
  }

  return [...blocked];
}

function preParseChecks(sql: string): string | null {
  const upper = sql.toUpperCase();

  if (!/^\s*(WITH\b|SELECT\b)/i.test(sql)) {
    return 'Only SELECT queries are allowed.';
  }

  for (const clause of FORBIDDEN_OUTPUT_CLAUSES) {
    if (upper.includes(clause)) return 'Only SELECT queries are allowed.';
  }

  for (const ref of FORBIDDEN_SYSTEM_REFS) {
    if (upper.includes(ref.toUpperCase())) return 'Query contains a disallowed reference.';
  }

  if (/--|\/\*|\*\//.test(sql)) return 'SQL comments are not allowed.';

  const withoutTrail = sql.trim().replace(/;\s*$/, '');
  if (withoutTrail.includes(';')) return 'Only single SELECT queries are allowed.';

  return null;
}

function validateAst(ast: Select, scopeCteNames: Set<string> = new Set()): string | null {
  const tableNames = collectTableNames(ast, scopeCteNames);
  for (const tableName of tableNames) {
    if (!ALLOWED_TABLES.has(tableName)) {
      return 'Query references a data source that is not available.';
    }
  }

  const selectColumns = collectColumnRefs({ columns: ast.columns });

  const allFunctions = collectFunctions(ast);
  for (const fn of allFunctions) {
    const fnName = normalizeName(fn.name).toUpperCase();
    if (FORBIDDEN_FUNCTION_NAMES.has(fnName)) {
      return 'Query contains a disallowed function.';
    }
  }

  const groupByExpressions = getGroupByExpressions(ast.groupby);
  for (const groupExpr of groupByExpressions) {
    if (expressionContainsAggregate(groupExpr)) {
      return 'GROUP BY clause cannot contain aggregate functions. Use HAVING for aggregate conditions.';
    }
  }

  const selectAliases = new Set<string>();
  for (const column of ast.columns || []) {
    const alias = normalizeName(column?.as);
    if (alias) selectAliases.add(alias);
  }

  for (const groupExpr of groupByExpressions) {
    if (groupExpr?.type === 'column_ref' && !groupExpr.table && groupExpr.column) {
      const alias = normalizeName(groupExpr.column);
      if (selectAliases.has(alias)) {
        return `GROUP BY references SELECT alias '${alias}'. Use the full expression instead: repeat the source expression from SELECT.`;
      }
    }
  }

  const nextScopeCteNames = new Set(scopeCteNames);
  for (const cteName of collectCteNames(ast)) {
    nextScopeCteNames.add(cteName);
  }

  const subqueryNodes = collectNodes(ast, 'select');
  for (const sub of subqueryNodes) {
    if (sub === ast) continue;
    const subError = validateAst(sub as Select, nextScopeCteNames);
    if (subError) return subError;
  }

  return null;
}

export function validateSql(sql: string): SqlGuardResult {
  const trimmed = sql.trim().replace(/;\s*$/, '');

  const preError = preParseChecks(trimmed);
  if (preError) return { safe: false, reason: preError };

  let ast: any;
  try {
    const result = parser.astify(trimmed, { database: 'MySQL' });
    ast = Array.isArray(result) ? result[0] : result;
  } catch (parseError: any) {
    console.warn('[sqlGuard] AST parse failed:', parseError?.message || parseError);
    return { safe: false, reason: 'Query contains invalid SQL syntax.' };
  }

  if (ast?.type?.toLowerCase() !== 'select') {
    return { safe: false, reason: 'Only SELECT queries are allowed.' };
  }

  const astError = validateAst(ast as Select);
  if (astError) {
    // Try a targeted auto-fix for common GROUP BY issues by stripping
    // aggregate expressions from GROUP BY clauses. This operates per-scope
    // and will be revalidated against the AST to ensure safety.
    if (/GROUP BY clause cannot contain aggregate|GROUP BY references SELECT alias/i.test(astError)) {
      const candidate = stripAggregatesFromGroupBy(trimmed);
      if (candidate !== trimmed) {
        try {
          const result = parser.astify(candidate, { database: 'MySQL' });
          const candAst = Array.isArray(result) ? result[0] : result;
          const candError = validateAst(candAst as Select);
          if (!candError) {
            let sanitizedSql = candidate;
            if (!(candAst as any).limit) sanitizedSql += ` LIMIT ${MAX_ROWS}`;
            const transformations: string[] = ['strip_aggregates_from_groupby'];
            if (sanitizedSql !== candidate) transformations.push('add_limit');
            return { safe: true, sanitizedSql, transformations };
          }
        } catch {
          // fallthrough to returning original validation failure
        }
      }
    }

    return { safe: false, reason: astError };
  }

  let sanitizedSql = trimmed;
  const transformations: string[] = [];
  if (!ast.limit) {
    sanitizedSql += ` LIMIT ${MAX_ROWS}`;
    transformations.push('add_limit');
  }

  return { safe: true, sanitizedSql, transformations: transformations.length ? transformations : undefined };
}

function sanitizeAccountId(accountId: string): number {
  const digits = String(accountId || '').replace(/\D/g, '');

  if (!digits) {
    throw new Error('Invalid accountId.');
  }

  const parsed = Number.parseInt(digits, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error('Invalid accountId.');
  }

  return parsed;
}

function buildAccountIdCondition(tableAlias: string, accountId: number) {
  return {
    type: 'binary_expr',
    operator: '=',
    left: {
      type: 'column_ref',
      table: tableAlias,
      column: 'accountid',
    },
    right: {
      type: 'number',
      value: accountId,
    },
  };
}

function collectTableNodes(node: any, results: any[] = []): any[] {
  if (!node || typeof node !== 'object') {
    return results;
  }

  if (node.type === 'select') {
    return results;
  }

  if (node.type === 'table' || typeof node.table === 'string') {
    results.push(node);
  }

  for (const key of Object.keys(node)) {
    const child = node[key];
    if (Array.isArray(child)) {
      child.forEach((item) => collectTableNodes(item, results));
    } else if (child && typeof child === 'object') {
      collectTableNodes(child, results);
    }
  }

  return results;
}

function injectAccountIdIntoSelect(selectNode: any, accountId: number): void {
  const tableNodes = collectTableNodes(selectNode?.from || []);
  const seenAliases = new Set<string>();
  let whereClause = selectNode.where;

  const injectionTrace = {
    tableNodes: tableNodes.map((tableNode) => ({
      table: tableNode?.table,
      alias: tableNode?.as || null,
      join: tableNode?.join || null,
    })),
    injectedTables: [] as Array<{ tableName: string; alias: string; accountId: number }>,
    skippedTables: [] as Array<{ tableName: string; reason: string }>,
    duplicateAliases: [] as Array<{ tableName: string; alias: string }>,
  };

  for (const tableNode of tableNodes) {
    const tableName = normalizeTableName(tableNode?.table);
    if (!ALLOWED_TABLES.has(tableName)) {
      injectionTrace.skippedTables.push({ tableName, reason: 'not in allowed tables' });
      continue;
    }

    const alias = normalizeName(tableNode?.as) || tableName;
    const aliasKey = `${tableName}:${alias}`;
    if (seenAliases.has(aliasKey)) {
      injectionTrace.duplicateAliases.push({ tableName, alias });
      continue;
    }

    seenAliases.add(aliasKey);
    const condition = buildAccountIdCondition(alias, accountId);
    injectionTrace.injectedTables.push({ tableName, alias, accountId });
    whereClause = whereClause
      ? {
          type: 'binary_expr',
          operator: 'AND',
          left: whereClause,
          right: condition,
        }
      : condition;
  }

  if (whereClause) {
    selectNode.where = whereClause;
  }

  console.info('[SQL] AccountId injection trace:', injectionTrace);
}

export function injectAccountIdFilter(sql: string, accountId: string): string {
  const sanitizedAccountId = sanitizeAccountId(accountId);
  const trimmed = sql.trim().replace(/;\s*$/, '');

  console.info('[SQL] AccountId injection start:', {
    accountId: sanitizedAccountId,
    sqlPreview: trimmed.slice(0, 300),
  });

  let ast: any;
  try {
    const result = parser.astify(trimmed, { database: 'MySQL' });
    ast = Array.isArray(result) ? result[0] : result;
  } catch (error: any) {
    throw new Error(`Unable to inject account filter: ${error?.message || 'invalid SQL'}`);
  }

  if (!ast) {
    throw new Error('Unable to inject account filter into empty SQL.');
  }

  const selectNodes = [ast, ...collectNodes(ast, 'select').filter((node) => node !== ast)];

  for (const selectNode of selectNodes) {
    injectAccountIdIntoSelect(selectNode, sanitizedAccountId);
  }

  let rewrittenSql: string;
  try {
    rewrittenSql = parser.sqlify(ast, { database: 'MySQL' });
  } catch (error: any) {
    throw new Error(`Unable to reconstruct SQL after account filter injection: ${error?.message || 'sqlify failed'}`);
  }

  console.info('[SQL] AccountId injection result:', {
    accountId: sanitizedAccountId,
    rootWherePresent: Boolean(ast?.where),
    executedSqlPreview: rewrittenSql.slice(0, 500),
  });

  const postValidation = validateSql(rewrittenSql);
  if (!postValidation.safe || !postValidation.sanitizedSql) {
    throw new Error(postValidation.reason || 'Injected SQL failed validation.');
  }

  return postValidation.sanitizedSql;
}

export function normalizeReservedAliases(sql: string): ReservedAliasNormalizationResult {
  let ast: any;
  try {
    const result = parser.astify(sql.trim().replace(/;\s*$/, ''), { database: 'MySQL' });
    ast = Array.isArray(result) ? result[0] : result;
  } catch {
    return { sql, aliasMap: {}, rewrittenAliases: [] };
  }

  if (!ast?.columns && !ast?.from) {
    return { sql, aliasMap: {}, rewrittenAliases: [] };
  }

  const aliasMap: Record<string, string> = {};
  for (const alias of collectAliasCandidates(ast)) {
    const replacement = RESERVED_ALIAS_REWRITE_MAP.get(alias);
    if (replacement) {
      aliasMap[alias] = replacement;
    }
  }

  if (Object.keys(aliasMap).length === 0) {
    return { sql, aliasMap, rewrittenAliases: [] };
  }

  const rewrittenAliases = new Set<string>();
  rewriteIdentifiers(ast, aliasMap, rewrittenAliases);

  try {
    const rewrittenSql = parser.sqlify(ast, { database: 'MySQL' });
    return { sql: rewrittenSql, aliasMap, rewrittenAliases: [...rewrittenAliases] };
  } catch {
    return { sql, aliasMap, rewrittenAliases: [] };
  }
}

export function rewriteSemanticAliases(sql: string, semanticAliasPlan: Record<string, string>): SemanticAliasRewriteResult {
  let ast: any;
  try {
    const result = parser.astify(sql.trim().replace(/;\s*$/, ''), { database: 'MySQL' });
    ast = Array.isArray(result) ? result[0] : result;
  } catch {
    return { sql, rewrittenAliases: [] };
  }

  if (!ast) {
    return { sql, rewrittenAliases: [] };
  }

  const aliasMap: Record<string, string> = {};

  for (const selectNode of [ast, ...collectNodes(ast, 'select').filter((node) => node !== ast)]) {
    for (const fromItem of selectNode?.from || []) {
      const tableName = normalizeTableName(fromItem?.table);
      const desiredAlias = semanticAliasPlan[tableName];
      if (!desiredAlias) continue;

      const currentAlias = normalizeName(fromItem?.as) || tableName;
      if (currentAlias && currentAlias !== desiredAlias.toLowerCase()) {
        aliasMap[currentAlias] = desiredAlias;
        fromItem.as = desiredAlias;
      }
    }
  }

  if (Object.keys(aliasMap).length === 0) {
    return { sql, rewrittenAliases: [] };
  }

  const rewrittenAliases = new Set<string>();
  rewriteIdentifiers(ast, aliasMap, rewrittenAliases);

  try {
    const rewrittenSql = parser.sqlify(ast, { database: 'MySQL' });
    return { sql: rewrittenSql, rewrittenAliases: [...rewrittenAliases] };
  } catch {
    return { sql, rewrittenAliases: [] };
  }
}

export function checkReservedAliasUsage(sql: string): string[] {
  let ast: any;
  try {
    const result = parser.astify(sql.trim().replace(/;\s*$/, ''), { database: 'MySQL' });
    ast = Array.isArray(result) ? result[0] : result;
  } catch {
    return [];
  }

  if (!ast) return [];

  return collectBlockedAliasUsage(ast);
}

export function getColumnRefsFromSql(sql: string): Array<{ table: string | null; column: string }> {
  const trimmed = String(sql || '').trim().replace(/;\s*$/, '');
  let ast: any;
  try {
    const result = parser.astify(trimmed, { database: 'MySQL' });
    ast = Array.isArray(result) ? result[0] : result;
  } catch {
    return [];
  }

  return collectColumnRefs(ast, []);
}

// Note: `validateSqlForOnlyFullGroupBy` removed — group-by checks and
// targeted fixes are folded into `validateSql()` which validates each
// select scope independently and returns optional `transformations[]`.

export function rewriteGroupByAliases(sql: string): string {
  let ast: any;
  try {
    const result = parser.astify(sql.trim().replace(/;\s*$/, ''), { database: 'MySQL' });
    ast = Array.isArray(result) ? result[0] : result;
  } catch {
    return sql;
  }

  const selectNodes = [ast, ...collectNodes(ast, 'select').filter((n) => n !== ast)];

  for (const selectNode of selectNodes) {
    const aliasMap: Record<string, any> = {};
    for (const col of selectNode?.columns || []) {
      const alias = normalizeName(col?.as);
      if (alias && col?.expr) {
        aliasMap[alias] = col.expr;
      }
    }

    if (!Object.keys(aliasMap).length) continue;

    const groupBy = selectNode?.groupby || selectNode?.groupBy;
    if (!groupBy) continue;

    const exprs = getGroupByExpressions(groupBy);
    const rewritten = exprs.map((g: any) => {
      if (g?.type === 'column_ref' && !g.table && g.column) {
        const name = normalizeName(g.column);
        if (aliasMap[name]) {
          // clone the alias expression
          return JSON.parse(JSON.stringify(aliasMap[name]));
        }
      }
      return g;
    });

    // assign back
    if (Array.isArray(groupBy)) {
      selectNode.groupby = rewritten;
    } else if (groupBy && groupBy.columns) {
      selectNode.groupby.columns = rewritten;
    } else {
      selectNode.groupby = rewritten;
    }
  }

  try {
    return parser.sqlify(ast, { database: 'MySQL' });
  } catch {
    return sql;
  }
}

export function stripAggregatesFromGroupBy(sql: string): string {
  let ast: any;
  try {
    const result = parser.astify(sql.trim().replace(/;\s*$/, ''), { database: 'MySQL' });
    ast = Array.isArray(result) ? result[0] : result;
  } catch {
    return sql;
  }

  const selectNodes = [ast, ...collectNodes(ast, 'select').filter((n) => n !== ast)];

  for (const selectNode of selectNodes) {
    const groupBy = selectNode?.groupby || selectNode?.groupBy;
    if (!groupBy) continue;

    const exprs = getGroupByExpressions(groupBy);
    const filtered = exprs.filter((g: any) => !expressionContainsAggregate(g));

    if (filtered.length === 0) {
      delete selectNode.groupby;
    } else if (Array.isArray(groupBy)) {
      selectNode.groupby = filtered;
    } else if (groupBy && groupBy.columns) {
      selectNode.groupby.columns = filtered;
    } else {
      selectNode.groupby = filtered;
    }
  }

  try {
    return parser.sqlify(ast, { database: 'MySQL' });
  } catch {
    return sql;
  }
}

export function hasNestedAggregates(sql: string): boolean {
  if (!sql || typeof sql !== 'string') return false;

  let ast: any;
  try {
    const result = parser.astify(sql.trim().replace(/;\s*$/, ''), { database: 'MySQL' });
    ast = Array.isArray(result) ? result[0] : result;
  } catch {
    return false;
  }

  const aggrFuncs = collectFunctions(ast).filter((f) => f.type === 'aggr_func');
  for (const f of aggrFuncs) {
    for (const key of Object.keys(f)) {
      const child = f[key];
      if (child && typeof child === 'object') {
        const innerFuncs = collectFunctions(child);
        if (innerFuncs.some((ifn) => ifn.type === 'aggr_func')) return true;
      }
    }
  }

  return false;
}