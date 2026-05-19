"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QUERY_TIMEOUT_MS = void 0;
exports.validateSql = validateSql;
const FORBIDDEN_KEYWORDS = [
    'INSERT',
    'UPDATE',
    'DELETE',
    'DROP',
    'TRUNCATE',
    'ALTER',
    'CREATE',
    'REPLACE',
    'MERGE',
    'CALL',
    'EXEC',
    'EXECUTE',
    'GRANT',
    'REVOKE',
    'LOCK',
    'UNLOCK',
    'LOAD',
    'OUTFILE',
    'DUMPFILE',
    'INTO OUTFILE',
];
const ALLOWED_TABLES = new Set(['tblcandidate', 'tblassignjobcandidate', 'tbldeals', 'tbljob']);
const MAX_ROWS = 10000;
exports.QUERY_TIMEOUT_MS = 10000;
function validateSql(sql) {
    const trimmed = sql.trim();
    const normalized = trimmed.toUpperCase();
    if (!normalized.startsWith('SELECT')) {
        return { safe: false, reason: 'Only SELECT queries are allowed.' };
    }
    for (const keyword of FORBIDDEN_KEYWORDS) {
        const regex = new RegExp(String.raw `\b${keyword}\b`, 'i');
        if (regex.test(trimmed)) {
            return { safe: false, reason: `Query contains forbidden keyword: ${keyword}` };
        }
    }
    if (trimmed.includes(';') && trimmed.indexOf(';') !== trimmed.length - 1) {
        return { safe: false, reason: 'Stacked queries are not allowed.' };
    }
    if (trimmed.includes('--') || trimmed.includes('/*') || trimmed.includes('*/') || trimmed.includes('#')) {
        return { safe: false, reason: 'SQL comments are not allowed.' };
    }
    // Block PII anywhere in the query text, including SELECT lists and projections.
    for (const forbiddenColumn of ['emailid', 'contactnumber', 'formatted_contact_number']) {
        if (new RegExp(String.raw `\b${forbiddenColumn}\b`, 'i').test(trimmed)) {
            return { safe: false, reason: `Column '${forbiddenColumn}' cannot be included in results.` };
        }
    }
    const tableRegex = /\bFROM\s+([\w.]+)|\bJOIN\s+([\w.]+)/gi;
    let match;
    while ((match = tableRegex.exec(trimmed)) !== null) {
        const tableName = (match[1] || match[2] || '').toLowerCase().split('.').pop() || '';
        if (!ALLOWED_TABLES.has(tableName)) {
            return { safe: false, reason: `Table '${tableName}' is not accessible.` };
        }
    }
    let sanitizedSql = trimmed.replace(/;$/, '');
    if (!normalized.includes('LIMIT')) {
        sanitizedSql += ` LIMIT ${MAX_ROWS}`;
    }
    return { safe: true, sanitizedSql };
}
