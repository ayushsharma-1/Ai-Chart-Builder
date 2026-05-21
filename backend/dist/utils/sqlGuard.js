"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QUERY_TIMEOUT_MS = void 0;
exports.extractTableNames = extractTableNames;
exports.validateSql = validateSql;
exports.normalizeReservedAliases = normalizeReservedAliases;
exports.rewriteSemanticAliases = rewriteSemanticAliases;
exports.checkReservedAliasUsage = checkReservedAliasUsage;
exports.getColumnRefsFromSql = getColumnRefsFromSql;
exports.validateSqlForOnlyFullGroupBy = validateSqlForOnlyFullGroupBy;
exports.rewriteGroupByAliases = rewriteGroupByAliases;
exports.stripAggregatesFromGroupBy = stripAggregatesFromGroupBy;
exports.hasNestedAggregates = hasNestedAggregates;
const node_sql_parser_1 = require("node-sql-parser");
const parser = new node_sql_parser_1.Parser();
const ALLOWED_TABLES = new Set([
    'tblcandidate',
    'tblassignjobcandidate',
    'tbldeals',
    'tbljob',
]);
const MAX_ROWS = 10000;
exports.QUERY_TIMEOUT_MS = 10000;
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
const FORBIDDEN_PII_COLUMNS = ['emailid', 'contactnumber', 'formatted_contact_number'];
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
function normalizeName(value) {
    return typeof value === 'string' ? value.toLowerCase() : '';
}
function normalizeTableName(value) {
    return normalizeName(value).split('.').pop() || '';
}
function collectNodes(node, targetType, results = []) {
    if (!node || typeof node !== 'object')
        return results;
    if (node.type === targetType)
        results.push(node);
    for (const key of Object.keys(node)) {
        const child = node[key];
        if (Array.isArray(child)) {
            child.forEach((item) => collectNodes(item, targetType, results));
        }
        else if (child && typeof child === 'object') {
            collectNodes(child, targetType, results);
        }
    }
    return results;
}
function collectFunctions(node, results = []) {
    if (!node || typeof node !== 'object')
        return results;
    if (node.type === 'function' || node.type === 'aggr_func')
        results.push(node);
    for (const key of Object.keys(node)) {
        const child = node[key];
        if (Array.isArray(child)) {
            child.forEach((item) => collectFunctions(item, results));
        }
        else if (child && typeof child === 'object') {
            collectFunctions(child, results);
        }
    }
    return results;
}
function collectColumnRefs(node, results = []) {
    if (!node || typeof node !== 'object')
        return results;
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
        }
        else if (child && typeof child === 'object') {
            collectColumnRefs(child, results);
        }
    }
    return results;
}
function extractTableNames(sql) {
    const cteNames = new Set();
    const cteRegex = /\bWITH\b[\s\S]*?(\w+)\s+AS\s*\(/gi;
    let cteMatch;
    while ((cteMatch = cteRegex.exec(sql)) !== null) {
        if (cteMatch[1]) {
            cteNames.add(cteMatch[1].toLowerCase());
        }
    }
    const tableRegex = /\bFROM\s+([\w.]+)|\bJOIN\s+([\w.]+)/gi;
    const tables = [];
    let match;
    while ((match = tableRegex.exec(sql)) !== null) {
        const tableName = (match[1] || match[2] || '').toLowerCase().split('.').pop() || '';
        if (tableName && !cteNames.has(tableName)) {
            tables.push(tableName);
        }
    }
    return tables;
}
function collectCteNames(ast) {
    const withClause = ast?.with;
    if (!withClause)
        return [];
    const items = Array.isArray(withClause) ? withClause : [withClause];
    const names = [];
    for (const item of items) {
        const rawName = item?.name?.value ?? item?.name ?? item?.alias ?? item?.cte?.name;
        const normalized = normalizeName(rawName);
        if (normalized)
            names.push(normalized);
    }
    return names;
}
function collectTableNames(ast, scopeCteNames = new Set()) {
    const names = [];
    const addFromItems = (fromItems) => {
        if (!Array.isArray(fromItems))
            return;
        for (const item of fromItems) {
            const tableName = normalizeTableName(item?.table);
            if (tableName && !scopeCteNames.has(tableName)) {
                names.push(tableName);
            }
            const nestedSelect = item?.expr?.ast || (item?.expr?.type === 'select' ? item.expr : null);
            if (nestedSelect) {
                names.push(...collectTableNames(nestedSelect, scopeCteNames));
            }
        }
    };
    const fromItems = Array.isArray(ast.from) ? ast.from : ast.from ? [ast.from] : [];
    addFromItems(fromItems);
    return names;
}
function getGroupByExpressions(groupBy) {
    if (!groupBy)
        return [];
    if (Array.isArray(groupBy))
        return groupBy;
    if (Array.isArray(groupBy.columns))
        return groupBy.columns;
    if (groupBy.columns)
        return [groupBy.columns];
    return [groupBy];
}
function expressionContainsAggregate(expr) {
    if (!expr || typeof expr !== 'object')
        return false;
    if (expr.type === 'aggr_func')
        return true;
    for (const key of Object.keys(expr)) {
        const child = expr[key];
        if (Array.isArray(child)) {
            if (child.some((item) => expressionContainsAggregate(item)))
                return true;
        }
        else if (child && typeof child === 'object') {
            if (expressionContainsAggregate(child))
                return true;
        }
    }
    return false;
}
function rewriteIdentifiers(node, aliasMap, rewrittenAliases) {
    if (!node || typeof node !== 'object')
        return;
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
        }
        else if (child && typeof child === 'object') {
            rewriteIdentifiers(child, aliasMap, rewrittenAliases);
        }
    }
}
function collectAliasCandidates(ast) {
    const candidates = new Set();
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
function collectBlockedAliasUsage(ast) {
    const blocked = new Set();
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
function preParseChecks(sql) {
    const upper = sql.toUpperCase();
    if (!/^\s*(WITH\b|SELECT\b)/i.test(sql)) {
        return 'Only SELECT queries are allowed.';
    }
    for (const clause of FORBIDDEN_OUTPUT_CLAUSES) {
        if (upper.includes(clause))
            return 'Only SELECT queries are allowed.';
    }
    for (const ref of FORBIDDEN_SYSTEM_REFS) {
        if (upper.includes(ref.toUpperCase()))
            return 'Query contains a disallowed reference.';
    }
    if (/--|\/\*|\*\//.test(sql))
        return 'SQL comments are not allowed.';
    const withoutTrail = sql.trim().replace(/;\s*$/, '');
    if (withoutTrail.includes(';'))
        return 'Only single SELECT queries are allowed.';
    return null;
}
function validateAst(ast, sql) {
    const tableNames = extractTableNames(sql);
    for (const tableName of tableNames) {
        if (!ALLOWED_TABLES.has(tableName)) {
            return 'Query references a data source that is not available.';
        }
    }
    const selectColumns = collectColumnRefs({ columns: ast.columns });
    for (const ref of selectColumns) {
        if (FORBIDDEN_PII_COLUMNS.includes(ref.column)) {
            return 'Query requests restricted data fields.';
        }
    }
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
    const subqueryNodes = collectNodes(ast, 'select');
    for (const sub of subqueryNodes) {
        if (sub === ast)
            continue;
        const subError = validateAst(sub, sql);
        if (subError)
            return subError;
    }
    return null;
}
function validateSql(sql) {
    const trimmed = sql.trim().replace(/;\s*$/, '');
    const preError = preParseChecks(trimmed);
    if (preError)
        return { safe: false, reason: preError };
    let ast;
    try {
        const result = parser.astify(trimmed, { database: 'MySQL' });
        ast = Array.isArray(result) ? result[0] : result;
    }
    catch (parseError) {
        console.warn('[sqlGuard] AST parse failed:', parseError?.message || parseError);
        return { safe: false, reason: 'Query contains invalid SQL syntax.' };
    }
    if (ast?.type?.toLowerCase() !== 'select') {
        return { safe: false, reason: 'Only SELECT queries are allowed.' };
    }
    const astError = validateAst(ast, trimmed);
    if (astError)
        return { safe: false, reason: astError };
    let sanitizedSql = trimmed;
    if (!ast.limit) {
        sanitizedSql += ` LIMIT ${MAX_ROWS}`;
    }
    return { safe: true, sanitizedSql };
}
function normalizeReservedAliases(sql) {
    let ast;
    try {
        const result = parser.astify(sql.trim().replace(/;\s*$/, ''), { database: 'MySQL' });
        ast = Array.isArray(result) ? result[0] : result;
    }
    catch {
        return { sql, aliasMap: {}, rewrittenAliases: [] };
    }
    if (!ast?.columns && !ast?.from) {
        return { sql, aliasMap: {}, rewrittenAliases: [] };
    }
    const aliasMap = {};
    for (const alias of collectAliasCandidates(ast)) {
        const replacement = RESERVED_ALIAS_REWRITE_MAP.get(alias);
        if (replacement) {
            aliasMap[alias] = replacement;
        }
    }
    if (Object.keys(aliasMap).length === 0) {
        return { sql, aliasMap, rewrittenAliases: [] };
    }
    const rewrittenAliases = new Set();
    rewriteIdentifiers(ast, aliasMap, rewrittenAliases);
    try {
        const rewrittenSql = parser.sqlify(ast, { database: 'MySQL' });
        return { sql: rewrittenSql, aliasMap, rewrittenAliases: [...rewrittenAliases] };
    }
    catch {
        return { sql, aliasMap, rewrittenAliases: [] };
    }
}
function rewriteSemanticAliases(sql, semanticAliasPlan) {
    let ast;
    try {
        const result = parser.astify(sql.trim().replace(/;\s*$/, ''), { database: 'MySQL' });
        ast = Array.isArray(result) ? result[0] : result;
    }
    catch {
        return { sql, rewrittenAliases: [] };
    }
    if (!ast) {
        return { sql, rewrittenAliases: [] };
    }
    const aliasMap = {};
    for (const selectNode of [ast, ...collectNodes(ast, 'select').filter((node) => node !== ast)]) {
        for (const fromItem of selectNode?.from || []) {
            const tableName = normalizeTableName(fromItem?.table);
            const desiredAlias = semanticAliasPlan[tableName];
            if (!desiredAlias)
                continue;
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
    const rewrittenAliases = new Set();
    rewriteIdentifiers(ast, aliasMap, rewrittenAliases);
    try {
        const rewrittenSql = parser.sqlify(ast, { database: 'MySQL' });
        return { sql: rewrittenSql, rewrittenAliases: [...rewrittenAliases] };
    }
    catch {
        return { sql, rewrittenAliases: [] };
    }
}
function checkReservedAliasUsage(sql) {
    let ast;
    try {
        const result = parser.astify(sql.trim().replace(/;\s*$/, ''), { database: 'MySQL' });
        ast = Array.isArray(result) ? result[0] : result;
    }
    catch {
        return [];
    }
    if (!ast)
        return [];
    return collectBlockedAliasUsage(ast);
}
function getColumnRefsFromSql(sql) {
    const trimmed = String(sql || '').trim().replace(/;\s*$/, '');
    let ast;
    try {
        const result = parser.astify(trimmed, { database: 'MySQL' });
        ast = Array.isArray(result) ? result[0] : result;
    }
    catch {
        return [];
    }
    return collectColumnRefs(ast, []);
}
function validateSqlForOnlyFullGroupBy(sql) {
    if (!sql || typeof sql !== 'string')
        return null;
    let ast;
    try {
        const result = parser.astify(sql.trim().replace(/;\s*$/, ''), { database: 'MySQL' });
        ast = Array.isArray(result) ? result[0] : result;
    }
    catch {
        return null;
    }
    const selectNodes = [ast, ...collectNodes(ast, 'select').filter((n) => n !== ast)];
    for (const selectNode of selectNodes) {
        const columns = selectNode?.columns || [];
        const groupByExprs = getGroupByExpressions(selectNode?.groupby || selectNode?.groupBy || null);
        // Detect aggregates in select list
        let hasAggregateInSelect = false;
        let nonAggregateCount = 0;
        for (const col of columns) {
            const expr = col?.expr ?? col;
            if (expressionContainsAggregate(expr)) {
                hasAggregateInSelect = true;
            }
            else {
                nonAggregateCount += 1;
            }
        }
        if (hasAggregateInSelect && (!groupByExprs || groupByExprs.length === 0)) {
            if (nonAggregateCount > 0) {
                return 'Aggregates present but no GROUP BY — non-aggregated fields detected.';
            }
        }
        // GROUP BY must not contain aggregates
        for (const g of groupByExprs) {
            if (expressionContainsAggregate(g)) {
                return 'GROUP BY clause cannot contain aggregate functions (COUNT, SUM, AVG, MIN, MAX). Remove the aggregate expression from the GROUP BY clause.';
            }
        }
        // GROUP BY must not reference SELECT aliases (unqualified alias usage)
        const selectAliases = new Set();
        for (const col of columns) {
            const asName = normalizeName(col?.as);
            if (asName)
                selectAliases.add(asName);
        }
        for (const g of groupByExprs) {
            if (g?.type === 'column_ref' && !g.table && g.column) {
                const colName = normalizeName(g.column);
                if (selectAliases.has(colName)) {
                    return `GROUP BY references SELECT alias '${colName}'. Use the full expression instead: repeat the source expression from SELECT.`;
                }
            }
        }
    }
    return null;
}
function rewriteGroupByAliases(sql) {
    let ast;
    try {
        const result = parser.astify(sql.trim().replace(/;\s*$/, ''), { database: 'MySQL' });
        ast = Array.isArray(result) ? result[0] : result;
    }
    catch {
        return sql;
    }
    const selectNodes = [ast, ...collectNodes(ast, 'select').filter((n) => n !== ast)];
    for (const selectNode of selectNodes) {
        const aliasMap = {};
        for (const col of selectNode?.columns || []) {
            const alias = normalizeName(col?.as);
            if (alias && col?.expr) {
                aliasMap[alias] = col.expr;
            }
        }
        if (!Object.keys(aliasMap).length)
            continue;
        const groupBy = selectNode?.groupby || selectNode?.groupBy;
        if (!groupBy)
            continue;
        const exprs = getGroupByExpressions(groupBy);
        const rewritten = exprs.map((g) => {
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
        }
        else if (groupBy && groupBy.columns) {
            selectNode.groupby.columns = rewritten;
        }
        else {
            selectNode.groupby = rewritten;
        }
    }
    try {
        return parser.sqlify(ast, { database: 'MySQL' });
    }
    catch {
        return sql;
    }
}
function stripAggregatesFromGroupBy(sql) {
    let ast;
    try {
        const result = parser.astify(sql.trim().replace(/;\s*$/, ''), { database: 'MySQL' });
        ast = Array.isArray(result) ? result[0] : result;
    }
    catch {
        return sql;
    }
    const selectNodes = [ast, ...collectNodes(ast, 'select').filter((n) => n !== ast)];
    for (const selectNode of selectNodes) {
        const groupBy = selectNode?.groupby || selectNode?.groupBy;
        if (!groupBy)
            continue;
        const exprs = getGroupByExpressions(groupBy);
        const filtered = exprs.filter((g) => !expressionContainsAggregate(g));
        if (filtered.length === 0) {
            delete selectNode.groupby;
        }
        else if (Array.isArray(groupBy)) {
            selectNode.groupby = filtered;
        }
        else if (groupBy && groupBy.columns) {
            selectNode.groupby.columns = filtered;
        }
        else {
            selectNode.groupby = filtered;
        }
    }
    try {
        return parser.sqlify(ast, { database: 'MySQL' });
    }
    catch {
        return sql;
    }
}
function hasNestedAggregates(sql) {
    if (!sql || typeof sql !== 'string')
        return false;
    let ast;
    try {
        const result = parser.astify(sql.trim().replace(/;\s*$/, ''), { database: 'MySQL' });
        ast = Array.isArray(result) ? result[0] : result;
    }
    catch {
        return false;
    }
    const aggrFuncs = collectFunctions(ast).filter((f) => f.type === 'aggr_func');
    for (const f of aggrFuncs) {
        for (const key of Object.keys(f)) {
            const child = f[key];
            if (child && typeof child === 'object') {
                const innerFuncs = collectFunctions(child);
                if (innerFuncs.some((ifn) => ifn.type === 'aggr_func'))
                    return true;
            }
        }
    }
    return false;
}
