"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.isGroqRateLimitError = isGroqRateLimitError;
exports.runAnalyticsPipeline = runAnalyticsPipeline;
const intentAgent_1 = require("../agents/intentAgent");
const fixAgent_1 = require("../agents/fixAgent");
const sqlAgent_1 = require("../agents/sqlAgent");
const schemaService_1 = require("../services/schemaService");
const sql_service_1 = require("../services/sql.service");
const dataTransformer_1 = require("./dataTransformer");
const chartRecommender_1 = require("./chartRecommender");
const CONFIDENCE_THRESHOLD = 0.65;
function isGroqRateLimitError(err) {
    const msg = String(err?.message
        || err?.error?.message
        || err
        || '');
    return /rate\s*limit\s*reached|tokens per day|\bTPD\b/i.test(msg);
}
async function runAnalyticsPipeline(input) {
    const pipelineStart = Date.now();
    const timings = { intentMs: 0, schemaMs: 0, sqlGenMs: 0, executionMs: 0 };
    console.info('[Pipeline] Starting for prompt:', input.userPrompt);
    // ── STAGE 1: Intent Analysis ────────────────────────────────────────────
    const intentStart = Date.now();
    let intent;
    try {
        intent = await (0, intentAgent_1.analyzeIntent)(input.userPrompt, input.previousContext, { sessionId: input.sessionId });
        timings.intentMs = Date.now() - intentStart;
        console.info('[Pipeline] Intent:', intent.intent, '| Tables:', intent.tables.join(', '));
    }
    catch (err) {
        // Timeout or Groq rate limit — use full-schema fallback instead of failing
        console.warn('[Pipeline] Intent agent failed, using full-schema fallback:', err.message);
        timings.intentMs = Date.now() - intentStart;
        intent = (0, intentAgent_1.buildIntentFallback)(input.userPrompt);
    }
    // Handle non-analytics queries early
    if (!intent.isAnalytics) {
        return {
            success: false,
            type: 'non_analytics',
            message: "I can only answer analytics questions about your recruitment data. Try asking about candidates, jobs, pipeline stages, or deals.",
        };
    }
    if (intent.confidence < CONFIDENCE_THRESHOLD) {
        console.info(`[Pipeline] Low confidence (${intent.confidence}) — requesting clarification`);
        return {
            success: false,
            type: 'clarification',
            message: intent.clarificationQuestion || 'Could you be more specific? What metric would you like to see — placements, revenue, conversion rate, or something else?',
            clarificationNeeded: intent.clarificationQuestion || 'Could you be more specific? What metric would you like to see — placements, revenue, conversion rate, or something else?',
            confidence: intent.confidence,
            confidenceReason: intent.confidenceReason || undefined,
        };
    }
    if (intent.needsClarification) {
        return {
            success: false,
            type: 'clarification',
            message: intent.needsClarification,
            clarificationNeeded: intent.needsClarification,
            confidence: intent.confidence,
            confidenceReason: intent.confidenceReason || undefined,
        };
    }
    // ── STAGE 2: Schema Fetch ───────────────────────────────────────────────
    const schemaStart = Date.now();
    let schema;
    try {
        schema = await (0, schemaService_1.getSchemaForTables)(intent.tables);
        timings.schemaMs = Date.now() - schemaStart;
        console.info('[Pipeline] Schema fetched for tables:', intent.tables.join(', '), '| Cache age:', Date.now() - schema.fetchedAt, 'ms');
    }
    catch (err) {
        console.error('[Pipeline] Schema stage failed:', err.message);
        return { success: false, type: 'error', message: 'Something went wrong. Please try again.' };
    }
    // ── STAGE 3: SQL Generation ─────────────────────────────────────────────
    const sqlGenStart = Date.now();
    let agentResponse;
    try {
        agentResponse = await (0, sqlAgent_1.generateSqlFromAgent)({
            userPrompt: input.userPrompt,
            intent,
            schema,
            sessionId: input.sessionId,
            previousContext: input.previousContext,
        });
        timings.sqlGenMs = Date.now() - sqlGenStart;
    }
    catch (err) {
        console.error('[Pipeline] SQL agent failed:', err.message);
        if (isGroqRateLimitError(err)) {
            return {
                success: false,
                type: 'rate_limit',
                message: err.message || String(err),
            };
        }
        // Distinguish validation blocks from server errors
        const isValidation = err.message?.includes('validation failed') || err.message?.includes('Query blocked');
        return {
            success: false,
            type: isValidation ? 'validation_error' : 'error',
            message: isValidation
                ? 'I generated a query that our security system blocked. Please try rephrasing.'
                : 'Something went wrong generating your query. Please try again.',
        };
    }
    if (!agentResponse.isAnalyticsQuery || !agentResponse.sql) {
        return {
            success: false,
            type: agentResponse.clarificationNeeded ? 'clarification' : 'non_analytics',
            message: agentResponse.clarificationNeeded || "I can only answer analytics questions about your recruitment data.",
            clarificationNeeded: agentResponse.clarificationNeeded || undefined,
        };
    }
    // ── STAGE 4: SQL Execution ──────────────────────────────────────────────
    const executionStart = Date.now();
    let queryResult;
    let fixAttempted = false;
    let currentSql = agentResponse.sql;
    try {
        queryResult = await (0, sql_service_1.runQuery)(currentSql, [], {
            sessionId: input.sessionId,
            userPrompt: input.userPrompt,
            originalSql: currentSql,
            retryCount: 0,
        });
        timings.executionMs = Date.now() - executionStart;
    }
    catch (err) {
        const mysqlError = err?.message || String(err);
        console.warn('[Pipeline] Execution failed, attempting fix agent:', mysqlError);
        const fix = await (0, fixAgent_1.runFixAgent)(currentSql, mysqlError, input.sessionId);
        if (!fix.fixed || !fix.fixedSql) {
            console.error('[Pipeline] Fix agent did not return a usable query');
            return { success: false, type: 'error', message: 'Something went wrong. Please try again.' };
        }
        fixAttempted = true;
        currentSql = fix.fixedSql;
        try {
            queryResult = await (0, sql_service_1.runQuery)(currentSql, [], {
                sessionId: input.sessionId,
                userPrompt: input.userPrompt,
                originalSql: agentResponse.sql,
                correctedSql: currentSql,
                retryCount: 1,
            });
            timings.executionMs = Date.now() - executionStart;
        }
        catch (fixErr) {
            console.error('[Pipeline] Fix agent attempt also failed', {
                sql: currentSql,
                error: {
                    name: fixErr?.name,
                    message: fixErr?.message,
                    stack: fixErr?.stack,
                    code: fixErr?.code,
                    errno: fixErr?.errno,
                    sqlState: fixErr?.sqlState,
                },
                timingMs: Date.now() - executionStart,
            });
            return { success: false, type: 'error', message: 'Something went wrong. Please try again.' };
        }
    }
    if (queryResult.rowCount === 0) {
        // Log empty analytical result when chart is not a table
        try {
            const { logAICall } = await Promise.resolve().then(() => __importStar(require('../utils/aiMetricsLogger')));
            logAICall({
                callType: 'sql_execution',
                model: 'mysql2',
                sessionId: input.sessionId,
                userPrompt: input.userPrompt,
                success: true,
                errorMessage: 'EMPTY_ANALYTICAL_RESULT',
                errorDetails: { reason: 'No rows returned for non-table chart', name: 'EMPTY_ANALYTICAL_RESULT', category: 'EMPTY_RESULT' },
                query: { sql: agentResponse.sql, sanitizedSql: agentResponse.sql, stage: 'execution' },
                latencyMs: timings.executionMs,
            });
        }
        catch (e) {
            console.warn('[Pipeline] Failed to log empty analytical result', e?.message || e);
        }
        return {
            success: false,
            type: 'empty_result',
            message: 'No matching analytical data found for selected filters/time range.',
        };
    }
    // ── STAGE 5: Data Transformation + Profile ──────────────────────────────
    const dataProfile = (0, dataTransformer_1.buildDataProfile)(queryResult.data);
    // ── STAGE 6: Chart Recommendation ──────────────────────────────────────
    const recommendation = (0, chartRecommender_1.recommendChart)({
        llmChartType: agentResponse.chartType,
        llmXAxis: agentResponse.xAxis,
        llmYAxis: agentResponse.yAxis,
        data: queryResult.data,
        dataProfile,
    });
    if (recommendation.overrideReason) {
        console.info('[Pipeline] Chart engine override:', recommendation.overrideReason);
    }
    const totalMs = Date.now() - pipelineStart;
    return {
        success: true,
        title: agentResponse.title || 'Analytics result',
        chartType: recommendation.chartType,
        chartConfig: {
            xAxis: recommendation.xAxis,
            yAxis: recommendation.yAxis,
            seriesKeys: recommendation.seriesKeys,
        },
        data: queryResult.data,
        rowCount: queryResult.rowCount,
        executionTimeMs: queryResult.executionTimeMs,
        sql: agentResponse.sql,
        reasoning: agentResponse.reasoning || '',
        chartOverrideReason: recommendation.overrideReason,
        chartConfidence: recommendation.confidence,
        pieDisabled: recommendation.pieDisabled,
        pieDisabledReason: recommendation.pieDisabledReason,
        fromCache: queryResult.cacheStatus === 'hit' || queryResult.cacheStatus === 'stale',
        wasAutoFixed: fixAttempted,
        pipeline: {
            intentMs: timings.intentMs,
            schemaMs: timings.schemaMs,
            sqlGenMs: timings.sqlGenMs,
            executionMs: timings.executionMs,
            totalMs,
        },
    };
}
