"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runQuery = runQuery;
const db_1 = __importDefault(require("../config/db"));
const aiMetricsLogger_1 = require("../utils/aiMetricsLogger");
const sqlGuard_1 = require("../utils/sqlGuard");
const queryCache = new Map();
function buildCacheKey(sql, params) {
    return `${sql}::${JSON.stringify(params)}`;
}
function serializeError(error) {
    return {
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
        code: error?.code,
        errno: error?.errno,
        sqlState: error?.sqlState,
        sqlMessage: error?.sqlMessage,
        fatal: error?.fatal,
    };
}
function classifySqlError(error) {
    const msg = String(error?.message || '').toLowerCase();
    const code = String(error?.code || '').toLowerCase();
    if (/unknown column/i.test(msg) || /column .* doesn't exist/i.test(msg) || /unknown column/.test(code))
        return 'UNKNOWN_COLUMN';
    if (/group .* by/i.test(msg) || /only_full_group_by/i.test(msg))
        return 'INVALID_GROUP_BY';
    if (/aggregate/i.test(msg) && /nested/i.test(msg))
        return 'INVALID_AGGREGATE';
    if (/window/i.test(msg) || /over\s*\(/i.test(msg))
        return 'INVALID_WINDOW_FUNCTION';
    if (/unknown table/i.test(msg) || /no such table/i.test(msg))
        return 'UNKNOWN_TABLE';
    if (/unknown/i.test(msg) && /alias/i.test(msg))
        return 'INVALID_ALIAS';
    if (/order by/i.test(msg) && /unknown/i.test(msg))
        return 'INVALID_ORDER_BY';
    if (/syntax/i.test(msg) || /you have an error in your sql syntax/i.test(msg))
        return 'SYNTAX_ERROR';
    if (/timeout/i.test(msg) || /max_execution_time/i.test(msg))
        return 'PERFORMANCE_TIMEOUT';
    return 'UNKNOWN_ERROR';
}
async function runQuery(sql, params = [], options = {}) {
    const guard = (0, sqlGuard_1.validateSql)(sql);
    const start = Date.now();
    if (!guard.safe || !guard.sanitizedSql) {
        const errorMessage = `Query blocked: ${guard.reason || 'unknown reason'}`;
        console.error('[SQL] Query blocked before execution', {
            sql,
            sanitizedSql: guard.sanitizedSql,
            params,
            reason: guard.reason || 'unknown reason',
        });
        (0, aiMetricsLogger_1.logAICall)({
            callType: 'sql_execution',
            model: 'mysql2',
            sessionId: options.sessionId,
            userPrompt: options.userPrompt,
            success: false,
            errorMessage,
            errorDetails: {
                message: errorMessage,
                reason: guard.reason || 'unknown reason',
            },
            query: {
                sql,
                sanitizedSql: guard.sanitizedSql,
                params,
                cacheKey: null,
                stage: 'validation',
            },
            latencyMs: Date.now() - start,
        });
        throw new Error(errorMessage);
    }
    const ttlSeconds = options.ttlSeconds ?? 0;
    const staleWhileRevalidateSeconds = options.staleWhileRevalidateSeconds ?? 0;
    const cacheKey = ttlSeconds > 0 ? options.cacheKey || buildCacheKey(guard.sanitizedSql, params) : null;
    const cached = cacheKey ? queryCache.get(cacheKey) : null;
    const now = Date.now();
    if (cached) {
        const ageSeconds = (now - cached.createdAt) / 1000;
        if (ageSeconds <= ttlSeconds) {
            return {
                data: cached.data,
                rowCount: cached.rowCount,
                executionTimeMs: 0,
                cacheStatus: 'hit',
            };
        }
        if (ageSeconds <= ttlSeconds + staleWhileRevalidateSeconds) {
            void runQuery(sql, params, { ...options, staleWhileRevalidateSeconds: 0 }).catch((error) => {
                console.error('[SQL] Background cache refresh failed', error?.message || error);
            });
            return {
                data: cached.data,
                rowCount: cached.rowCount,
                executionTimeMs: 0,
                cacheStatus: 'stale',
            };
        }
    }
    const connection = await db_1.default.getConnection();
    try {
        console.info('[SQL] Executing query:', guard.sanitizedSql);
        await connection.query(`SET SESSION MAX_EXECUTION_TIME=${sqlGuard_1.QUERY_TIMEOUT_MS}`);
        const [rows] = await connection.query(guard.sanitizedSql, params);
        const data = rows;
        const executionTimeMs = Date.now() - start;
        console.info('[SQL] Query completed', {
            rowCount: data.length,
            executionTimeMs,
        });
        if (cacheKey) {
            queryCache.set(cacheKey, {
                data,
                rowCount: data.length,
                createdAt: Date.now(),
            });
        }
        return {
            data,
            rowCount: data.length,
            executionTimeMs,
            cacheStatus: cacheKey ? 'miss' : undefined,
        };
    }
    catch (error) {
        console.error('[SQL] Query failed', {
            sql,
            sanitizedSql: guard.sanitizedSql,
            params,
            cacheKey,
            executionTimeMs: Date.now() - start,
            error: serializeError(error),
        });
        (0, aiMetricsLogger_1.logAICall)({
            callType: 'sql_execution',
            model: 'mysql2',
            sessionId: options.sessionId,
            userPrompt: options.userPrompt,
            success: false,
            errorMessage: error?.message || 'Query execution failed',
            errorDetails: {
                ...serializeError(error),
                category: classifySqlError(error),
            },
            query: {
                sql,
                sanitizedSql: guard.sanitizedSql,
                params,
                cacheKey,
                stage: 'execution',
            },
            sqlFlow: {
                stage: 'execution',
                originalSql: options.originalSql || sql,
                correctedSql: options.correctedSql || guard.sanitizedSql,
                retryCount: options.retryCount || 0,
            },
            latencyMs: Date.now() - start,
        });
        throw new Error(error?.message || 'Query execution failed');
    }
    finally {
        connection.release();
    }
}
