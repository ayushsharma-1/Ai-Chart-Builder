const ALLOWED_TABLES = new Set(['tblcandidate', 'tblassignjobcandidate', 'tbldeals', 'tbljob']);

const MAX_ROWS = 10000;
export const QUERY_TIMEOUT_MS = 10000;

export interface SqlGuardResult {
  safe: boolean;
  reason?: string;
  sanitizedSql?: string;
}

export interface ReservedAliasNormalizationResult {
  sql: string;
  aliasMap: Record<string, string>;
  rewrittenAliases: string[];
}

const FORBIDDEN_STATEMENTS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'DROP',
  'TRUNCATE',
  'ALTER',
  'CREATE',
  'RENAME',
  'MERGE',
  'CALL',
  'EXEC',
  'EXECUTE',
  'GRANT',
  'REVOKE',
  'LOCK',
  'UNLOCK',
  'FLUSH',
  'RESET',
  'PURGE',
  'OPTIMIZE',
  'REPAIR',
  'ANALYZE TABLE',
  'PREPARE',
  'DEALLOCATE PREPARE',
];

const FORBIDDEN_FUNCTIONS = [
  'LOAD_FILE',
  'SLEEP',
  'BENCHMARK',
  'GET_LOCK',
  'RELEASE_LOCK',
  'IS_FREE_LOCK',
  'IS_USED_LOCK',
  'MASTER_POS_WAIT',
  'PROCEDURE ANALYSE',
  'CURRENT_USER',
  'SESSION_USER',
  'SYSTEM_USER',
  'USER',
  'DATABASE',
  'VERSION',
];

const FORBIDDEN_SYSTEM_REFERENCES = ['@@datadir', '@@basedir', '@@secure_file_priv', '@@global', '@@session'];
const FORBIDDEN_OUTPUT_CLAUSES = ['INTO OUTFILE', 'INTO DUMPFILE'];
const FORBIDDEN_COLUMNS = ['emailid', 'contactnumber', 'formatted_contact_number'];
const RESERVED_ALIAS_REWRITE_MAP = new Map([
  ['rank', 'row_rank'],
  ['group', 'group_name'],
  ['order', 'sort_order'],
]);
const RESERVED_ALIAS_BLOCKLIST = new Set(['rank', 'group', 'order', 'key', 'index', 'table', 'rows']);
const CLAUSE_KEYWORDS = new Set([
  'where',
  'group',
  'having',
  'order',
  'limit',
  'on',
  'join',
  'inner',
  'left',
  'right',
  'full',
  'cross',
  'using',
  'union',
  'from',
  'select',
  'as',
]);

function startsWithSelect(sql: string) {
  return /^\s*SELECT\b/i.test(sql);
}

function tokenize(sql: string) {
  return sql.toUpperCase().match(/[A-Z_]+/g) || [];
}

function containsTokenSequence(tokens: string[], phrase: string) {
  const expected = phrase.toUpperCase().split(/\s+/).filter(Boolean);

  if (expected.length === 0 || tokens.length < expected.length) {
    return false;
  }

  for (let index = 0; index <= tokens.length - expected.length; index += 1) {
    let matched = true;

    for (let offset = 0; offset < expected.length; offset += 1) {
      if (tokens[index + offset] !== expected[offset]) {
        matched = false;
        break;
      }
    }

    if (matched) {
      return true;
    }
  }

  return false;
}

function containsForbiddenStatement(sql: string) {
  const tokens = tokenize(sql);

  return FORBIDDEN_STATEMENTS.find((statement) => containsTokenSequence(tokens, statement));
}

function containsForbiddenFunction(sql: string) {
  const normalized = sql.toUpperCase().replace(/\s+/g, ' ');

  return FORBIDDEN_FUNCTIONS.find((fn) => normalized.includes(`${fn.toUpperCase()}(`));
}

function containsForbiddenSystemReference(sql: string) {
  return FORBIDDEN_SYSTEM_REFERENCES.find((ref) => sql.toUpperCase().includes(ref.toUpperCase()));
}

function containsForbiddenOutputClause(sql: string) {
  const normalized = sql.toUpperCase().replace(/\s+/g, ' ');

  return FORBIDDEN_OUTPUT_CLAUSES.find((clause) => normalized.includes(clause.toUpperCase()));
}

function extractTableNames(sql: string) {
  const tableRegex = /\bFROM\s+([\w.]+)|\bJOIN\s+([\w.]+)/gi;
  const tables: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = tableRegex.exec(sql)) !== null) {
    const tableName = (match[1] || match[2] || '').toLowerCase().split('.').pop() || '';
    if (tableName) {
      tables.push(tableName);
    }
  }

  return tables;
}

function hasComments(sql: string) {
  return /--|\/\*|\*\/|#/m.test(sql);
}

function extractSelectClause(sql: string): string {
  const match = /select([\s\S]*?)from/i.exec(sql);
  return match ? match[1] : '';
}

export function normalizeReservedAliases(sql: string): ReservedAliasNormalizationResult {
  const aliasCandidates = new Set<string>();

  for (const branch of splitUnionAllBranches(sql)) {
    const selectClause = extractSelectClause(branch);

    for (const alias of extractAliasesFromSelectClause(selectClause)) {
      aliasCandidates.add(alias);
    }

    for (const alias of extractTableAliases(branch)) {
      aliasCandidates.add(alias);
    }
  }

  const aliasMap: Record<string, string> = {};
  for (const alias of aliasCandidates) {
    const replacement = RESERVED_ALIAS_REWRITE_MAP.get(alias);
    if (replacement) {
      aliasMap[alias] = replacement;
    }
  }

  if (Object.keys(aliasMap).length === 0) {
    return { sql, aliasMap, rewrittenAliases: [] };
  }

  const rewrittenAliases = new Set<string>();
  const rewrittenSql = rewriteAliasesOutsideQuotes(sql, aliasMap, rewrittenAliases);

  return {
    sql: rewrittenSql,
    aliasMap,
    rewrittenAliases: [...rewrittenAliases],
  };
}

export function validateSql(sql: string): SqlGuardResult {
  const trimmed = sql.trim().replace(/;\s*$/, '');

  if (!startsWithSelect(trimmed)) {
    return { safe: false, reason: 'Only SELECT queries are allowed.' };
  }

  const forbiddenStatement = containsForbiddenStatement(trimmed);
  if (forbiddenStatement) {
    return { safe: false, reason: `Query contains forbidden statement: ${forbiddenStatement}` };
  }

  const forbiddenOutputClause = containsForbiddenOutputClause(trimmed);
  if (forbiddenOutputClause) {
    return { safe: false, reason: `Query contains forbidden clause: ${forbiddenOutputClause}` };
  }

  const forbiddenFunction = containsForbiddenFunction(trimmed);
  if (forbiddenFunction) {
    return { safe: false, reason: `Query contains forbidden function: ${forbiddenFunction}` };
  }

  const forbiddenSystemReference = containsForbiddenSystemReference(trimmed);
  if (forbiddenSystemReference) {
    return { safe: false, reason: 'Query contains a disallowed system reference.' };
  }

  if (hasComments(trimmed)) {
    return { safe: false, reason: 'SQL comments are not allowed.' };
  }

  const normalized = normalizeReservedAliases(trimmed);
  const reservedAliasUsage = findReservedAliasUsage(normalized.sql);
  if (reservedAliasUsage.length > 0) {
    return {
      safe: false,
      reason: `Query uses reserved aliases that are not allowed: ${reservedAliasUsage.join(', ')}.`,
    };
  }

  for (const forbiddenColumn of FORBIDDEN_COLUMNS) {
    if (new RegExp(String.raw`\b${forbiddenColumn}\b`, 'i').test(normalized.sql)) {
      return { safe: false, reason: `Column '${forbiddenColumn}' cannot be included in results.` };
    }
  }

  for (const tableName of extractTableNames(normalized.sql)) {
    if (!ALLOWED_TABLES.has(tableName)) {
      return { safe: false, reason: 'Query references a data source that is not available.' };
    }
  }

  if (normalized.sql.includes(';')) {
    return { safe: false, reason: 'Stacked queries are not allowed.' };
  }

  let sanitizedSql = normalized.sql;
  if (!/\bLIMIT\b/i.test(sanitizedSql)) {
    sanitizedSql += ` LIMIT ${MAX_ROWS}`;
  }

  return { safe: true, sanitizedSql };
}

function findReservedAliasUsage(sql: string): string[] {
  const usages = new Set<string>();

  for (const branch of splitUnionAllBranches(sql)) {
    const selectClause = extractSelectClause(branch);

    for (const alias of extractAliasesFromSelectClause(selectClause)) {
      if (RESERVED_ALIAS_BLOCKLIST.has(alias)) {
        usages.add(alias);
      }
    }

    for (const alias of extractTableAliases(branch)) {
      if (RESERVED_ALIAS_BLOCKLIST.has(alias)) {
        usages.add(alias);
      }
    }
  }

  return [...usages];
}

function extractAliasesFromSelectClause(selectClause: string): string[] {
  const aliases: string[] = [];

  for (const item of splitTopLevelCommaSeparated(selectClause)) {
    const trimmedItem = item.trim();
    if (!trimmedItem || !/\s/.test(trimmedItem)) {
      continue;
    }

    const explicitMatch =
      /\bAS\s+([A-Za-z_][\w$]*)\s*$/i.exec(trimmedItem) ||
      /\bAS\s+`([A-Za-z_][\w$]*)`\s*$/i.exec(trimmedItem) ||
      /\bAS\s+"([A-Za-z_][\w$]*)"\s*$/i.exec(trimmedItem);

    if (explicitMatch?.[1]) {
      aliases.push(explicitMatch[1].toLowerCase());
      continue;
    }

    const implicitMatch =
      /([A-Za-z_][\w$]*)\s*$/i.exec(trimmedItem) ||
      /`([A-Za-z_][\w$]*)`\s*$/i.exec(trimmedItem) ||
      /"([A-Za-z_][\w$]*)"\s*$/i.exec(trimmedItem);

    if (implicitMatch?.[1]) {
      aliases.push(implicitMatch[1].toLowerCase());
    }
  }

  return aliases;
}

function extractTableAliases(sql: string): string[] {
  const aliases: string[] = [];
  const tableAliasRegex = /\b(?:FROM|JOIN)\s+(?:\([\s\S]*?\)|(?:[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*))(?:\s+AS)?\s+([A-Za-z_][\w$]*)\b/gi;
  let match: RegExpExecArray | null;

  while ((match = tableAliasRegex.exec(sql)) !== null) {
    const alias = (match[1] || '').toLowerCase();
    if (alias && !CLAUSE_KEYWORDS.has(alias)) {
      aliases.push(alias);
    }
  }

  return aliases;
}

function splitTopLevelCommaSeparated(input: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  let index = 0;

  while (index < input.length) {
    const char = input[index];

    if (char === '\'' || char === '"' || char === '`') {
      const quoted = readQuotedSection(input, index, char);
      current += quoted.text;
      index = quoted.nextIndex;
      continue;
    }

    if (char === '(') {
      depth += 1;
      current += char;
      index += 1;
      continue;
    }

    if (char === ')') {
      depth = Math.max(0, depth - 1);
      current += char;
      index += 1;
      continue;
    }

    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      index += 1;
      continue;
    }

    current += char;
    index += 1;
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

function splitUnionAllBranches(sql: string): string[] {
  const branches: string[] = [];
  const parts = sql.split(/\bUNION\s+ALL\b/i);
  for (const part of parts) {
    const trimmed = part.trim().replace(/^\(+/, '').replace(/\)+$/, '');
    if (trimmed) {
      branches.push(trimmed);
    }
  }

  return branches.length > 0 ? branches : [sql];
}

function rewriteAliasesOutsideQuotes(sql: string, aliasMap: Record<string, string>, rewrittenAliases: Set<string>): string {
  let result = '';
  let index = 0;

  while (index < sql.length) {
    const char = sql[index];

    if (char === '\'' || char === '"' || char === '`') {
      const quoted = readQuotedSection(sql, index, char);
      result += quoted.text;
      index = quoted.nextIndex;
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      const start = index;
      index += 1;

      while (index < sql.length && /[A-Za-z0-9_$]/.test(sql[index])) {
        index += 1;
      }

      const token = sql.slice(start, index);
      const lowerToken = token.toLowerCase();
      const replacement = aliasMap[lowerToken];

      if (replacement && !isClauseKeywordToken(sql, start, index, lowerToken) && !isFunctionCall(sql, index) && getPreviousNonWhitespaceChar(sql, start) !== '.') {
        rewrittenAliases.add(lowerToken);
        result += replacement;
        continue;
      }

      result += token;
      continue;
    }

    result += char;
    index += 1;
  }

  return result;
}

function readQuotedSection(sql: string, startIndex: number, quote: string): { text: string; nextIndex: number } {
  let index = startIndex + 1;

  while (index < sql.length) {
    if (sql[index] === '\\' && quote !== '`') {
      index += 2;
      continue;
    }

    if (sql[index] === quote) {
      if (quote === '`' || sql[index + 1] !== quote) {
        index += 1;
        break;
      }

      index += 2;
      continue;
    }

    index += 1;
  }

  return {
    text: sql.slice(startIndex, index),
    nextIndex: index,
  };
}

function getPreviousNonWhitespaceChar(sql: string, index: number): string | null {
  for (let position = index - 1; position >= 0; position -= 1) {
    const char = sql[position];
    if (!/\s/.test(char)) {
      return char;
    }
  }

  return null;
}

function getNextNonWhitespaceChar(sql: string, index: number): string | null {
  for (let position = index; position < sql.length; position += 1) {
    const char = sql[position];
    if (!/\s/.test(char)) {
      return char;
    }
  }

  return null;
}

function getNextWord(sql: string, index: number): string | null {
  let position = index;

  while (position < sql.length && /\s/.test(sql[position])) {
    position += 1;
  }

  const start = position;

  while (position < sql.length && /[A-Za-z_]/.test(sql[position])) {
    position += 1;
  }

  if (position === start) {
    return null;
  }

  return sql.slice(start, position).toLowerCase();
}

function isFunctionCall(sql: string, index: number): boolean {
  return getNextNonWhitespaceChar(sql, index) === '(';
}

function isClauseKeywordToken(sql: string, _startIndex: number, endIndex: number, lowerToken: string): boolean {
  if (lowerToken !== 'group' && lowerToken !== 'order') {
    return false;
  }

  return getNextWord(sql, endIndex) === 'by';
}