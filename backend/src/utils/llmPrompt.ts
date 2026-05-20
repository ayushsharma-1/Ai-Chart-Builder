import { getRelevantSchemaContext } from './dataModel';
import { getRelevantSemanticMetricPrompt } from './semanticMetrics';
import {
  FROZEN_IDENTITY,
  FROZEN_SQL_RULES,
  FROZEN_FILTER_RULES,
  FROZEN_ALLOWED_FUNCTIONS,
  FROZEN_CHART_RULES,
  FROZEN_OUTPUT_FORMAT,
} from './promptTokens';

export interface LLMRuntimeContext {
  previousPrompt?: string;
  previousTitle?: string;
  previousSql?: string;
  previousChartType?: string;
}

// Re-export under legacy names for backward compatibility
export const BASE_SYSTEM_PROMPT = FROZEN_IDENTITY;
export const CORE_SQL_RULES = FROZEN_SQL_RULES;
export const CHART_RULES = FROZEN_CHART_RULES;
export const OUTPUT_FORMAT_RULES = FROZEN_OUTPUT_FORMAT;

export function buildRuntimeUserContext(userPrompt: string, context?: LLMRuntimeContext) {
  const lines = [
    'USER QUERY CONTEXT:',
    `User request: ${userPrompt}`,
  ];

  if (context?.previousTitle || context?.previousPrompt || context?.previousChartType || context?.previousSql) {
    lines.push(
      'Follow-up context:',
      `Previous chart title: ${context.previousTitle || 'unknown'}`,
      `Previous prompt: ${context.previousPrompt || 'unknown'}`,
      `Previous chart type: ${context.previousChartType || 'unknown'}`,
      `Previous SQL: ${context.previousSql || 'unknown'}`,
      'If this is a refinement, preserve useful intent from the prior query while generating a fresh safe SELECT statement.'
    );
  }

  return lines.join('\n');
}

function buildPromptIntent(userPrompt: string, context?: LLMRuntimeContext) {
  return [userPrompt, context?.previousPrompt, context?.previousTitle, context?.previousChartType].filter(Boolean).join(' ');
}

export function buildLLMSystemPrompt(userPrompt: string, context?: LLMRuntimeContext) {
  const intent = buildPromptIntent(userPrompt, context);
  const schemaContext = getRelevantSchemaContext(intent);
  const metricContext = getRelevantSemanticMetricPrompt(intent);

  return [FROZEN_IDENTITY, schemaContext, metricContext, FROZEN_SQL_RULES, FROZEN_FILTER_RULES, FROZEN_ALLOWED_FUNCTIONS, FROZEN_CHART_RULES, FROZEN_OUTPUT_FORMAT].filter(Boolean).join('\n\n');
}

export function buildLLMMessages(userPrompt: string, context?: LLMRuntimeContext) {
  return {
    systemPrompt: buildLLMSystemPrompt(userPrompt, context),
    userPrompt: buildRuntimeUserContext(userPrompt, context),
  };
}