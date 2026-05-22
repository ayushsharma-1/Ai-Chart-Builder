"use strict";
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
const aiMetricsLogger_1 = require("./aiMetricsLogger");
const sqlGuard_1 = require("./sqlGuard");
const CONFIDENCE_THRESHOLD = 0.65;
function isAnalyticalPrompt(userPrompt) {
    const normalized = userPrompt.toLowerCase();
    const analyticsKeywords = [
        'top',
        'per',
        'group by',
        'rank',
        'ranking',
        'average',
        'avg',
        'mean',
        'sum',
        'total',
        'count',
        'trend',
        'distribution',
        'stddev',
        'standard deviation',
        'variance',
        'outlier',
        'deviation',
        'revenue',
        'billing',
    ];
    return analyticsKeywords.some((keyword) => normalized.includes(keyword));
}
function stringifyErrorValue(value) {
    if (typeof value === 'string')
        return value;
    if (value instanceof Error)
        return value.message;
    if (value && typeof value === 'object') {
        try {
            return JSON.stringify(value);
        }
        catch {
            return 'Unknown error';
        }
    }
    return 'Unknown error';
}
function isGroqRateLimitError(err) {
    const message = stringifyErrorValue(err?.message ||
        err?.error?.message ||
        err);
    return /rate\s*limit\s*reached|tokens per day|\bTPD\b/i.test(message);
}
function buildNonAnalyticsError() {
    return {
        success: false,
        type: 'non_analytics',
        message: 'I can only answer analytics questions about your recruitment data. Try asking about candidates, jobs, pipeline stages, or deals.',
    };
}
function buildClarificationError(intent) {
    const clarification = intent.clarificationQuestion || 'Could you be more specific? What metric would you like to see - placements, revenue, conversion rate, or something else?';
    return {
        success: false,
        type: 'clarification',
        message: clarification,
        clarificationNeeded: clarification,
        confidence: intent.confidence,
        confidenceReason: intent.confidenceReason || undefined,
    };
}
async function fetchSchemaForIntent(intent) {
    try {
        const schema = await (0, schemaService_1.getSchemaForTables)(intent.tables);
        return { schema };
    }
    catch (err) {
        console.error('[Pipeline] Schema stage failed:', err.message);
        return { error: { success: false, type: 'error', message: 'Something went wrong. Please try again.' } };
    }
}
async function generateAgentSql(input, intent, schema) {
    try {
        const agentResponse = await (0, sqlAgent_1.generateSqlFromAgent)({
            userPrompt: input.userPrompt,
            intent,
            schema,
            sessionId: input.sessionId,
            previousContext: input.previousContext,
        });
        return { agentResponse };
    }
    catch (err) {
        console.error('[Pipeline] SQL agent failed:', err.message);
        if (isGroqRateLimitError(err)) {
            return { error: { success: false, type: 'rate_limit', message: err.message || String(err) } };
        }
        const isValidation = err.message?.includes('validation failed') ||
            err.message?.includes('Query blocked') ||
            err.message?.includes('invalid response structure') ||
            err.message?.includes('returned empty response') ||
            err.message?.includes('JSON');
        return {
            error: {
                success: false,
                type: isValidation ? 'validation_error' : 'error',
                message: isValidation
                    ? 'I could not read that query cleanly. Please simplify your prompt and try again.'
                    : 'Something went wrong generating your query. Please try again.',
            },
        };
    }
}
function logSqlValidationEvent(input, sql, validation, latencyMs) {
    (0, aiMetricsLogger_1.logAICall)({
        callType: 'sql_validation',
        model: 'node-sql-parser',
        sessionId: input.sessionId,
        userPrompt: input.userPrompt,
        success: validation.safe,
        errorMessage: validation.safe ? undefined : validation.reason,
        errorDetails: validation.safe
            ? undefined
            : {
                reason: validation.reason,
                category: 'VALIDATION_ERROR',
            },
        sqlFlow: {
            stage: 'validation',
            sql,
            structuralValidationPassed: validation.safe,
            validationIssues: validation.safe ? undefined : [validation.reason || 'SQL failed validation'],
            transformations: validation.transformations || (validation.sanitizedSql && validation.sanitizedSql !== sql ? ['validateSqlSanitized'] : undefined),
        },
        query: {
            sql,
            sanitizedSql: validation.sanitizedSql,
            stage: 'validation',
        },
        latencyMs,
    });
}
async function repairSqlAfterValidationFailure(input, sql, validationReason) {
    const fix = await (0, fixAgent_1.runFixAgent)({
        sql,
        mode: 'validation',
        validationIssues: [validationReason],
        sessionId: input.sessionId,
        userPrompt: input.userPrompt,
    });
    if (!fix.fixed || !fix.fixedSql) {
        console.error('[Pipeline] Validation fix agent did not return a usable query');
        return { sql: null, error: { success: false, type: 'validation_error', message: 'I could not repair the SQL query. Please simplify the request and try again.' } };
    }
    const repairedValidation = (0, sqlGuard_1.validateSql)(fix.fixedSql);
    if (!repairedValidation.safe || !repairedValidation.sanitizedSql) {
        console.error('[Pipeline] Validation fix agent returned SQL that still failed AST validation');
        return { sql: null, error: { success: false, type: 'validation_error', message: 'I could not repair the SQL query. Please simplify the request and try again.' } };
    }
    return { sql: repairedValidation.sanitizedSql };
}
async function repairSqlAfterExecutionFailure(input, originalSql, currentSql, mysqlError) {
    const fix = await (0, fixAgent_1.runFixAgent)({
        sql: currentSql,
        mode: 'execution',
        mysqlError,
        sessionId: input.sessionId,
        userPrompt: input.userPrompt,
    });
    if (!fix.fixed || !fix.fixedSql) {
        console.error('[Pipeline] Fix agent did not return a usable query');
        return { sql: null, error: { success: false, type: 'error', message: 'Something went wrong. Please try again.' } };
    }
    const repairedValidation = (0, sqlGuard_1.validateSql)(fix.fixedSql);
    if (!repairedValidation.safe || !repairedValidation.sanitizedSql) {
        console.error('[Pipeline] Execution fix agent returned SQL that failed AST validation');
        return { sql: null, error: { success: false, type: 'error', message: 'Something went wrong. Please try again.' } };
    }
    return { sql: repairedValidation.sanitizedSql };
}
async function executeSqlWithRepair(input, sql) {
    const validationStart = Date.now();
    const validation = (0, sqlGuard_1.validateSql)(sql);
    logSqlValidationEvent(input, sql, validation, Date.now() - validationStart);
    let currentSql = validation.sanitizedSql || sql;
    let fixAttempted = false;
    let fixAgentCalls = 0; // cap fix agent LLM calls to 1 per request
    if (!validation.safe || !validation.sanitizedSql) {
        const repairResult = await repairSqlAfterValidationFailure(input, sql, validation.reason || 'SQL failed validation');
        if (!repairResult.sql) {
            return { fixAttempted: true, error: repairResult.error || { success: false, type: 'validation_error', message: 'I could not repair the SQL query. Please simplify the request and try again.' } };
        }
        currentSql = repairResult.sql;
        fixAttempted = true;
        fixAgentCalls += 1;
    }
    try {
        const correctedSql = currentSql === sql ? undefined : currentSql;
        const queryResult = await (0, sql_service_1.runQuery)(currentSql, [], {
            sessionId: input.sessionId,
            userPrompt: input.userPrompt,
            originalSql: sql,
            correctedSql,
            retryCount: fixAttempted ? 1 : 0,
        });
        return { queryResult, fixAttempted };
    }
    catch (err) {
        const mysqlError = err?.message || String(err);
        console.warn('[Pipeline] Execution failed, attempting fix agent:', mysqlError);
        // Only allow one fix-agent LLM call per request to avoid unbounded retries
        if (fixAgentCalls >= 1) {
            console.error('[Pipeline] Execution failed and fix agent quota exhausted. Bailing.');
            return { fixAttempted: true, error: { success: false, type: 'error', message: 'Execution failed and automated repairs exhausted.' } };
        }
        const repairResult = await repairSqlAfterExecutionFailure(input, sql, currentSql, mysqlError);
        if (!repairResult.sql) {
            return { fixAttempted: true, error: repairResult.error || { success: false, type: 'error', message: 'Something went wrong. Please try again.' } };
        }
        fixAgentCalls += 1;
        try {
            const queryResult = await (0, sql_service_1.runQuery)(repairResult.sql, [], {
                sessionId: input.sessionId,
                userPrompt: input.userPrompt,
                originalSql: sql,
                correctedSql: repairResult.sql,
                retryCount: 1,
            });
            return { queryResult, fixAttempted: true };
        }
        catch (fixErr) {
            console.error('[Pipeline] Fix agent attempt also failed', {
                sql: repairResult.sql,
                error: {
                    name: fixErr?.name,
                    message: fixErr?.message,
                    stack: fixErr?.stack,
                    code: fixErr?.code,
                    errno: fixErr?.errno,
                    sqlState: fixErr?.sqlState,
                },
            });
            return { fixAttempted: false, error: { success: false, type: 'error', message: 'Something went wrong. Please try again.' } };
        }
    }
}
function buildLookupSuccessResult(agentResponse, queryResult, timings, pipelineStart, fixAttempted) {
    const firstRow = queryResult.data[0] || {};
    const columns = Object.keys(firstRow);
    return {
        success: true,
        title: agentResponse.title || 'Lookup result',
        chartType: 'table',
        renderAs: 'text',
        chartConfig: {
            xAxis: columns[0] || 'result',
            yAxis: columns.slice(1),
        },
        data: queryResult.data,
        rowCount: queryResult.rowCount,
        executionTimeMs: queryResult.executionTimeMs,
        sql: agentResponse.sql || '',
        reasoning: agentResponse.reasoning || '',
        chartOverrideReason: 'Lookup queries are rendered as text',
        chartConfidence: 'low',
        fromCache: queryResult.cacheStatus === 'hit' || queryResult.cacheStatus === 'stale',
        wasAutoFixed: fixAttempted,
        pipeline: {
            intentMs: timings.intentMs,
            schemaMs: timings.schemaMs,
            sqlGenMs: timings.sqlGenMs,
            executionMs: timings.executionMs,
            totalMs: Date.now() - pipelineStart,
        },
    };
}
function buildAnalyticsSuccessResult(agentResponse, queryResult, recommendation, timings, pipelineStart, fixAttempted) {
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
        sql: agentResponse.sql || '',
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
            totalMs: Date.now() - pipelineStart,
        },
    };
}
async function runAnalyticsPipeline(input) {
    const pipelineStart = Date.now();
    const timings = { intentMs: 0, schemaMs: 0, sqlGenMs: 0, executionMs: 0 };
    console.info('[Pipeline] Starting for prompt:', input.userPrompt);
    const intentStart = Date.now();
    let intent;
    try {
        intent = await (0, intentAgent_1.analyzeIntent)(input.userPrompt, input.previousContext, { sessionId: input.sessionId });
        timings.intentMs = Date.now() - intentStart;
        console.info('[Pipeline] Intent:', intent.intent, '| Tables:', intent.tables.join(', '));
    }
    catch (err) {
        console.warn('[Pipeline] Intent agent failed, using full-schema fallback:', err.message);
        timings.intentMs = Date.now() - intentStart;
        intent = (0, intentAgent_1.buildIntentFallback)(input.userPrompt);
    }
    if (!intent.isAnalytics) {
        return buildNonAnalyticsError();
    }
    if (intent.confidence < CONFIDENCE_THRESHOLD) {
        return buildClarificationError(intent);
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
    const schemaStart = Date.now();
    const schemaResult = await fetchSchemaForIntent(intent);
    timings.schemaMs = Date.now() - schemaStart;
    if (schemaResult.error || !schemaResult.schema) {
        return schemaResult.error || { success: false, type: 'error', message: 'Something went wrong. Please try again.' };
    }
    const schema = schemaResult.schema;
    console.info('[Pipeline] Schema fetched for tables:', intent.tables.join(', '), '| Cache age:', Date.now() - schema.fetchedAt, 'ms');
    const sqlGenStart = Date.now();
    const agentResult = await generateAgentSql(input, intent, schema);
    timings.sqlGenMs = Date.now() - sqlGenStart;
    if (agentResult.error || !agentResult.agentResponse) {
        return agentResult.error || { success: false, type: 'error', message: 'Something went wrong generating your query. Please try again.' };
    }
    const agentResponse = agentResult.agentResponse;
    if (!agentResponse.isAnalyticsQuery || !agentResponse.sql) {
        return {
            success: false,
            type: agentResponse.clarificationNeeded ? 'clarification' : 'non_analytics',
            message: agentResponse.clarificationNeeded || 'I can only answer analytics questions about your recruitment data.',
            clarificationNeeded: agentResponse.clarificationNeeded || undefined,
        };
    }
    const executionStart = Date.now();
    const executionResult = await executeSqlWithRepair(input, agentResponse.sql);
    timings.executionMs = Date.now() - executionStart;
    if (executionResult.error || !executionResult.queryResult) {
        return executionResult.error || { success: false, type: 'error', message: 'Something went wrong. Please try again.' };
    }
    const queryResult = executionResult.queryResult;
    if (queryResult.rowCount === 0) {
        try {
            (0, aiMetricsLogger_1.logAICall)({
                callType: 'sql_execution',
                model: 'mysql2',
                sessionId: input.sessionId,
                userPrompt: input.userPrompt,
                success: false,
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
    if (intent.metricType === 'lookup' && !isAnalyticalPrompt(input.userPrompt)) {
        return buildLookupSuccessResult(agentResponse, queryResult, timings, pipelineStart, executionResult.fixAttempted);
    }
    const dataProfile = (0, dataTransformer_1.buildDataProfile)(queryResult.data);
    const recommendation = (0, chartRecommender_1.recommendChart)({
        llmChartType: agentResponse.chartType,
        llmXAxis: agentResponse.xAxis,
        llmYAxis: agentResponse.yAxis,
        data: queryResult.data,
        dataProfile,
    });
    return buildAnalyticsSuccessResult(agentResponse, queryResult, recommendation, timings, pipelineStart, executionResult.fixAttempted);
}
