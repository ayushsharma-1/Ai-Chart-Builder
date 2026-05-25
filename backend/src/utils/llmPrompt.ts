import { getRelevantSchemaContext } from './dataModel';
import { getRelevantSemanticMetricPrompt } from './semanticMetrics';
import * as promptTokens from './promptTokens';

export {
  FROZEN_IDENTITY as BASE_SYSTEM_PROMPT,
  FROZEN_SQL_RULES as CORE_SQL_RULES,
  FROZEN_CHART_RULES as CHART_RULES,
  FROZEN_OUTPUT_FORMAT as OUTPUT_FORMAT_RULES,
} from './promptTokens';

export interface LLMRuntimeContext {
  previousPrompt?: string;
  previousTitle?: string;
  previousSql?: string;
  previousChartType?: string;
}

export {
  FROZEN_IDENTITY as BASE_SYSTEM_PROMPT,
  FROZEN_SQL_RULES as CORE_SQL_RULES,
  FROZEN_CHART_RULES as CHART_RULES,
  FROZEN_OUTPUT_FORMAT as OUTPUT_FORMAT_RULES,
} from './promptTokens';

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

  return [
    promptTokens.FROZEN_IDENTITY,
    schemaContext,
    metricContext,
    promptTokens.FROZEN_SQL_RULES,
    promptTokens.FROZEN_DISTINCT_RULES,
    promptTokens.FROZEN_FILTER_RULES,
    promptTokens.FROZEN_ALLOWED_FUNCTIONS,
    promptTokens.FROZEN_CHART_RULES,
    promptTokens.FROZEN_OUTPUT_FORMAT,
  ].filter(Boolean).join('\n\n');
}

export function buildLLMMessages(userPrompt: string, context?: LLMRuntimeContext) {
  return {
    systemPrompt: buildLLMSystemPrompt(userPrompt, context),
    userPrompt: buildRuntimeUserContext(userPrompt, context),
  };
}