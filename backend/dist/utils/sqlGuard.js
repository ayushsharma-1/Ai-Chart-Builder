"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QUERY_TIMEOUT_MS = void 0;
exports.normalizeReservedAliases = normalizeReservedAliases;
exports.validateSql = validateSql;
const dataModel_1 = require("./dataModel");
const ALLOWED_TABLES = new Set(['tblcandidate', 'tblassignjobcandidate', 'tbldeals', 'tbljob']);
const MAX_ROWS = 10000;
exports.QUERY_TIMEOUT_MS = 10000;
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
function startsWithSelect(sql) {
    return /^\s*SELECT\b/i.test(sql);
}
function tokenize(sql) {
    return sql.toUpperCase().match(/[A-Z_]+/g) || [];
}
function containsTokenSequence(tokens, phrase) {
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
function containsForbiddenStatement(sql) {
    const tokens = tokenize(sql);
    return FORBIDDEN_STATEMENTS.find((statement) => containsTokenSequence(tokens, statement));
}
function containsForbiddenFunction(sql) {
    const normalized = sql.toUpperCase().replace(/\s+/g, ' ');
    return FORBIDDEN_FUNCTIONS.find((fn) => normalized.includes(`${fn.toUpperCase()}(`));
}
function containsForbiddenSystemReference(sql) {
    return FORBIDDEN_SYSTEM_REFERENCES.find((ref) => sql.toUpperCase().includes(ref.toUpperCase()));
}
function containsForbiddenOutputClause(sql) {
    const normalized = sql.toUpperCase().replace(/\s+/g, ' ');
    return FORBIDDEN_OUTPUT_CLAUSES.find((clause) => normalized.includes(clause.toUpperCase()));
}
function extractTableNames(sql) {
    const tableRegex = /\b(?:FROM|JOIN)\s+([\w.]+)/gi;
    const tables = [];
    let match;
    while ((match = tableRegex.exec(sql)) !== null) {
        const tableName = (match[1] || '').toLowerCase().split('.').pop() || '';
        if (tableName) {
            tables.push(tableName);
        }
    }
    return tables;
}
function findInvalidQualifiedColumnReference(sql) {
    for (const branch of splitUnionAllBranches(sql)) {
        const aliasMap = extractTableAliasMap(branch);
        const qualifiedReferences = extractQualifiedColumnReferences(branch);
        for (const reference of qualifiedReferences) {
            const resolvedTable = aliasMap[reference.identifier.toLowerCase()] || reference.identifier.toLowerCase();
            const allowedColumns = dataModel_1.SCHEMA_COLUMN_MAP.get(resolvedTable);
            if (!allowedColumns) {
                continue;
            }
            if (!allowedColumns.has(reference.column.toLowerCase())) {
                return `Column '${reference.column}' does not exist on table '${resolvedTable}'.`;
            }
        }
    }
    return null;
}
function extractTableAliasMap(sql) {
    const aliasMap = {};
    const tableAliasRegex = /\b(?:FROM|JOIN)\s+((?:\w+(?:\.\w+)*)|(?:\([^)]*\)))\s+(?:AS\s+)?(\w+)\b/gi;
    let match;
    while ((match = tableAliasRegex.exec(sql)) !== null) {
        const tableName = (match[1] || '').toLowerCase().split('.').pop() || '';
        const alias = (match[2] || '').toLowerCase();
        if (tableName && alias && !CLAUSE_KEYWORDS.has(alias)) {
            aliasMap[alias] = tableName;
        }
    }
    return aliasMap;
}
function extractQualifiedColumnReferences(sql) {
    const references = [];
    const regex = /\b(\w+)\.(\w+)\b/g;
    let match;
    while ((match = regex.exec(sql)) !== null) {
        references.push({ identifier: match[1], column: match[2] });
    }
    return references;
}
function extractGroupByClause(sql) {
    const match = /\bGROUP\s+BY\b([\s\S]*?)(?=\bHAVING\b|\bORDER\s+BY\b|\bLIMIT\b|\bUNION\b|$)/i.exec(sql);
    return match ? match[1] : null;
}
function hasAggregateInGroupBy(sql) {
    for (const branch of splitUnionAllBranches(sql)) {
        const clause = extractGroupByClause(branch);
        if (!clause)
            continue;
        if (/\b(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(clause)) {
            return true;
        }
    }
    return false;
}
function hasComments(sql) {
    return /--|\/\*|\*\/|#/m.test(sql);
}
function extractSelectClause(sql) {
    const match = /select([\s\S]*?)from/i.exec(sql);
    return match ? match[1] : '';
}
function normalizeReservedAliases(sql) {
    const aliasCandidates = new Set();
    for (const branch of splitUnionAllBranches(sql)) {
        const selectClause = extractSelectClause(branch);
        for (const alias of extractAliasesFromSelectClause(selectClause)) {
            aliasCandidates.add(alias);
        }
        for (const alias of extractTableAliases(branch)) {
            aliasCandidates.add(alias);
        }
    }
    const aliasMap = {};
    for (const alias of aliasCandidates) {
        const replacement = RESERVED_ALIAS_REWRITE_MAP.get(alias);
        if (replacement) {
            aliasMap[alias] = replacement;
        }
    }
    if (Object.keys(aliasMap).length === 0) {
        return { sql, aliasMap, rewrittenAliases: [] };
    }
    const rewrittenAliases = new Set();
    const rewrittenSql = rewriteAliasesOutsideQuotes(sql, aliasMap, rewrittenAliases);
    return {
        sql: rewrittenSql,
        aliasMap,
        rewrittenAliases: [...rewrittenAliases],
    };
}
function validateSql(sql) {
    const trimmed = sql.trim().replace(/;\s*$/, '');
    return validateSqlCore(trimmed, normalizeReservedAliases(trimmed).sql);
}
function validateSqlCore(trimmed, normalizedSql) {
    if (!startsWithSelect(trimmed)) {
        return { safe: false, reason: 'Only SELECT queries are allowed.' };
    }
    const validationReason = validateSqlRules(trimmed, normalizedSql);
    if (validationReason) {
        return { safe: false, reason: validationReason };
    }
    return { safe: true, sanitizedSql: appendLimitIfMissing(normalizedSql) };
}
function validateSqlRules(trimmed, normalizedSql) {
    const forbiddenStatement = containsForbiddenStatement(trimmed);
    if (forbiddenStatement) {
        return `Query contains forbidden statement: ${forbiddenStatement}`;
    }
    const forbiddenOutputClause = containsForbiddenOutputClause(trimmed);
    if (forbiddenOutputClause) {
        return `Query contains forbidden clause: ${forbiddenOutputClause}`;
    }
    const forbiddenFunction = containsForbiddenFunction(trimmed);
    if (forbiddenFunction) {
        return `Query contains forbidden function: ${forbiddenFunction}`;
    }
    if (containsForbiddenSystemReference(trimmed)) {
        return 'Query contains a disallowed system reference.';
    }
    if (hasComments(trimmed)) {
        return 'SQL comments are not allowed.';
    }
    const reservedAliasUsage = findReservedAliasUsage(normalizedSql);
    if (reservedAliasUsage.length > 0) {
        return `Query uses reserved aliases that are not allowed: ${reservedAliasUsage.join(', ')}.`;
    }
    for (const forbiddenColumn of FORBIDDEN_COLUMNS) {
        if (new RegExp(String.raw `\b${forbiddenColumn}\b`, 'i').test(normalizedSql)) {
            return `Column '${forbiddenColumn}' cannot be included in results.`;
        }
    }
    for (const tableName of extractTableNames(normalizedSql)) {
        if (!ALLOWED_TABLES.has(tableName)) {
            return 'Query references a data source that is not available.';
        }
    }
    const invalidQualifiedColumn = findInvalidQualifiedColumnReference(normalizedSql);
    if (invalidQualifiedColumn) {
        return invalidQualifiedColumn;
    }
    if (hasAggregateInGroupBy(normalizedSql)) {
        return 'GROUP BY clause must not contain aggregate functions (COUNT, SUM, AVG, MIN, MAX). Remove aggregate expressions from GROUP BY.';
    }
    if (normalizedSql.includes(';')) {
        return 'Stacked queries are not allowed.';
    }
    return null;
}
function appendLimitIfMissing(sql) {
    if (/\bLIMIT\b/i.test(sql)) {
        return sql;
    }
    return `${sql} LIMIT ${MAX_ROWS}`;
}
function findReservedAliasUsage(sql) {
    const usages = new Set();
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
function extractAliasesFromSelectClause(selectClause) {
    const aliases = [];
    for (const item of splitTopLevelCommaSeparated(selectClause)) {
        const trimmedItem = item.trim();
        if (!trimmedItem || !/\s/.test(trimmedItem)) {
            continue;
        }
        const explicitMatch = /\bAS\s+(\w+)\s*$/i.exec(trimmedItem) ||
            /\bAS\s+`(\w+)`\s*$/i.exec(trimmedItem) ||
            /\bAS\s+"(\w+)"\s*$/i.exec(trimmedItem);
        if (explicitMatch?.[1]) {
            aliases.push(explicitMatch[1].toLowerCase());
            continue;
        }
        const implicitMatch = /(\w+)\s*$/i.exec(trimmedItem) ||
            /`(\w+)`\s*$/i.exec(trimmedItem) ||
            /"(\w+)"\s*$/i.exec(trimmedItem);
        if (implicitMatch?.[1]) {
            aliases.push(implicitMatch[1].toLowerCase());
        }
    }
    return aliases;
}
function extractTableAliases(sql) {
    const aliases = [];
    const tableAliasRegex = /\b(?:FROM|JOIN)\s+(?:\([\s\S]*?\)|(?:\w+(?:\.\w+)*))(?:\s+AS)?\s+(\w+)\b/gi;
    let match;
    while ((match = tableAliasRegex.exec(sql)) !== null) {
        const alias = (match[1] || '').toLowerCase();
        if (alias && !CLAUSE_KEYWORDS.has(alias)) {
            aliases.push(alias);
        }
    }
    return aliases;
}
function splitTopLevelCommaSeparated(input) {
    const parts = [];
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
function splitUnionAllBranches(sql) {
    const branches = [];
    const parts = sql.split(/\bUNION\s+ALL\b/i);
    for (const part of parts) {
        const trimmed = part.trim().replace(/^\(+/, '').replace(/\)+$/, '');
        if (trimmed) {
            branches.push(trimmed);
        }
    }
    return branches.length > 0 ? branches : [sql];
}
function rewriteAliasesOutsideQuotes(sql, aliasMap, rewrittenAliases) {
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
function readQuotedSection(sql, startIndex, quote) {
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
function getPreviousNonWhitespaceChar(sql, index) {
    for (let position = index - 1; position >= 0; position -= 1) {
        const char = sql[position];
        if (!/\s/.test(char)) {
            return char;
        }
    }
    return null;
}
function getNextNonWhitespaceChar(sql, index) {
    for (let position = index; position < sql.length; position += 1) {
        const char = sql[position];
        if (!/\s/.test(char)) {
            return char;
        }
    }
    return null;
}
function getNextWord(sql, index) {
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
function isFunctionCall(sql, index) {
    return getNextNonWhitespaceChar(sql, index) === '(';
}
function isClauseKeywordToken(sql, _startIndex, endIndex, lowerToken) {
    if (lowerToken !== 'group' && lowerToken !== 'order') {
        return false;
    }
    return getNextWord(sql, endIndex) === 'by';
}
