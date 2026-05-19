export interface SemanticMetric {
  id: string;
  name: string;
  description: string;
  primaryTable: string;
  expression: string;
  defaultTimeField?: string;
  dimensions: string[];
  requiredFilters: string[];
}

export const SEMANTIC_METRICS: SemanticMetric[] = [
  {
    id: 'active_deals',
    name: 'Active Deals',
    description: 'Open, non-archived deals currently in the sales pipeline.',
    primaryTable: 'tbldeals',
    expression: 'COUNT(*)',
    defaultTimeField: 'createdon',
    dimensions: ['owner', 'company', 'stage', 'created_month'],
    requiredFilters: ['tbldeals.archived = 0'],
  },
  {
    id: 'candidate_conversion_rate',
    name: 'Candidate Conversion Rate',
    description: 'Share of assigned candidates who moved into a successful or hired stage.',
    primaryTable: 'tblassignjobcandidate',
    expression: 'SUM(CASE WHEN LOWER(stage) LIKE "%hire%" THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0)',
    defaultTimeField: 'createdon',
    dimensions: ['stage', 'owner', 'job_status', 'created_month'],
    requiredFilters: ['no deleted/archived flag exists on tblassignjobcandidate'],
  },
  {
    id: 'jobs_closed_this_month',
    name: 'Jobs Closed This Month',
    description: 'Jobs marked closed during the current calendar month.',
    primaryTable: 'tbljob',
    expression: 'COUNT(*)',
    defaultTimeField: 'updatedon',
    dimensions: ['job_status', 'company', 'owner'],
    requiredFilters: ['tbljob.deleted = 0'],
  },
  {
    id: 'pipeline_velocity',
    name: 'Pipeline Velocity',
    description: 'Average number of candidate assignments progressing through pipeline stages over time.',
    primaryTable: 'tblassignjobcandidate',
    expression: 'COUNT(*)',
    defaultTimeField: 'createdon',
    dimensions: ['stage', 'owner', 'created_month'],
    requiredFilters: ['no deleted/archived flag exists on tblassignjobcandidate'],
  },
  {
    id: 'remote_jobs',
    name: 'Remote Jobs',
    description: 'Jobs whose location or work mode indicates remote work.',
    primaryTable: 'tbljob',
    expression: 'COUNT(*)',
    defaultTimeField: 'createdon',
    dimensions: ['company', 'job_status', 'created_month'],
    requiredFilters: ['tbljob.deleted = 0', 'remote/location predicate when available'],
  },
];

const SEMANTIC_METRIC_CACHE = new Map<string, string>();

function normalizeIntent(intent: string) {
  return intent.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function scoreMetric(metric: SemanticMetric, intent: string) {
  const haystack = normalizeIntent([
    metric.id,
    metric.name,
    metric.description,
    metric.primaryTable,
    metric.expression,
    metric.dimensions.join(' '),
    metric.requiredFilters.join(' '),
  ].join(' '));
  const tokens = normalizeIntent(intent).split(/\s+/).filter(Boolean);

  if (tokens.length === 0) {
    return 0;
  }

  let score = 0;
  for (const token of tokens) {
    if (token.length < 2) {
      continue;
    }

    if (haystack.includes(token)) {
      score += token.length >= 5 ? 3 : 2;
    }
  }

  return score;
}

function selectRelevantMetrics(intent: string) {
  const ranked = SEMANTIC_METRICS
    .map((metric) => ({ metric, score: scoreMetric(metric, intent) }))
    .sort((left, right) => right.score - left.score);

  const selected = ranked.filter((entry) => entry.score > 0).map((entry) => entry.metric);

  if (selected.length > 0) {
    return selected;
  }

  const normalizedIntent = normalizeIntent(intent);
  const fallbackTables = new Set<string>();

  if (/candidate|placement|pipeline|funnel|assignment/.test(normalizedIntent)) {
    fallbackTables.add('tblassignjobcandidate');
  }

  if (/deal|revenue|billing|value|close/.test(normalizedIntent)) {
    fallbackTables.add('tbldeals');
  }

  if (/job|hiring|opening|requisition|remote/.test(normalizedIntent)) {
    fallbackTables.add('tbljob');
  }

  if (/profile|talent|skill|candidate/.test(normalizedIntent)) {
    fallbackTables.add('tblcandidate');
  }

  return SEMANTIC_METRICS.filter((metric) => fallbackTables.has(metric.primaryTable)).slice(0, 3);
}

function formatMetricPrompt(metric: SemanticMetric) {
  return [
    `- ${metric.name} (${metric.id})`,
    `  table: ${metric.primaryTable}`,
    `  expression: ${metric.expression}`,
    `  dimensions: ${metric.dimensions.join(', ')}`,
    `  filters: ${metric.requiredFilters.join('; ')}`,
    `  description: ${metric.description}`,
  ].join('\n');
}

function buildMetricPrompt(intent: string) {
  const cacheKey = normalizeIntent(intent);
  const cached = SEMANTIC_METRIC_CACHE.get(cacheKey);

  if (cached) {
    return cached;
  }

  const metrics = selectRelevantMetrics(intent);
  const prompt = metrics.length
    ? ['SEMANTIC METRICS:', ...metrics.map((metric) => formatMetricPrompt(metric)), 'Prefer these business definitions over inventing new metric semantics.'].join('\n')
    : '';

  SEMANTIC_METRIC_CACHE.set(cacheKey, prompt);
  return prompt;
}

export function getRelevantSemanticMetricPrompt(userIntent = '') {
  return buildMetricPrompt(userIntent);
}

export function getSemanticMetricPrompt(userIntent = '') {
  return getRelevantSemanticMetricPrompt(userIntent);
}
