"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OUTPUT_FORMAT_RULES = exports.CHART_RULES = exports.CORE_SQL_RULES = exports.BASE_SYSTEM_PROMPT = void 0;
exports.buildRuntimeUserContext = buildRuntimeUserContext;
exports.buildLLMSystemPrompt = buildLLMSystemPrompt;
exports.buildLLMMessages = buildLLMMessages;
const dataModel_1 = require("./dataModel");
const semanticMetrics_1 = require("./semanticMetrics");
const promptTokens_1 = require("./promptTokens");
// Re-export under legacy names for backward compatibility
exports.BASE_SYSTEM_PROMPT = promptTokens_1.FROZEN_IDENTITY;
exports.CORE_SQL_RULES = promptTokens_1.FROZEN_SQL_RULES;
exports.CHART_RULES = promptTokens_1.FROZEN_CHART_RULES;
exports.OUTPUT_FORMAT_RULES = promptTokens_1.FROZEN_OUTPUT_FORMAT;
function buildRuntimeUserContext(userPrompt, context) {
    const lines = [
        'USER QUERY CONTEXT:',
        `User request: ${userPrompt}`,
    ];
    if (context?.previousTitle || context?.previousPrompt || context?.previousChartType || context?.previousSql) {
        lines.push('Follow-up context:', `Previous chart title: ${context.previousTitle || 'unknown'}`, `Previous prompt: ${context.previousPrompt || 'unknown'}`, `Previous chart type: ${context.previousChartType || 'unknown'}`, `Previous SQL: ${context.previousSql || 'unknown'}`, 'If this is a refinement, preserve useful intent from the prior query while generating a fresh safe SELECT statement.');
    }
    return lines.join('\n');
}
function buildPromptIntent(userPrompt, context) {
    return [userPrompt, context?.previousPrompt, context?.previousTitle, context?.previousChartType].filter(Boolean).join(' ');
}
function buildLLMSystemPrompt(userPrompt, context) {
    const intent = buildPromptIntent(userPrompt, context);
    const schemaContext = (0, dataModel_1.getRelevantSchemaContext)(intent);
    const metricContext = (0, semanticMetrics_1.getRelevantSemanticMetricPrompt)(intent);
    return [promptTokens_1.FROZEN_IDENTITY, schemaContext, metricContext, promptTokens_1.FROZEN_SQL_RULES, promptTokens_1.FROZEN_FILTER_RULES, promptTokens_1.FROZEN_ALLOWED_FUNCTIONS, promptTokens_1.FROZEN_CHART_RULES, promptTokens_1.FROZEN_OUTPUT_FORMAT].filter(Boolean).join('\n\n');
}
function buildLLMMessages(userPrompt, context) {
    return {
        systemPrompt: buildLLMSystemPrompt(userPrompt, context),
        userPrompt: buildRuntimeUserContext(userPrompt, context),
    };
}
