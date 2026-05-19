"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SEMANTIC_METRICS = void 0;
exports.getSemanticMetricPrompt = getSemanticMetricPrompt;
exports.SEMANTIC_METRICS = [
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
function getSemanticMetricPrompt() {
    return [
        'SEMANTIC METRIC LAYER:',
        ...exports.SEMANTIC_METRICS.map((metric) => [
            `- ${metric.name} (${metric.id})`,
            `  Definition: ${metric.description}`,
            `  Base table: ${metric.primaryTable}`,
            `  Expression: ${metric.expression}`,
            `  Required filters: ${metric.requiredFilters.join('; ')}`,
            `  Recommended dimensions: ${metric.dimensions.join(', ')}`,
        ].join('\n')),
        'When a user asks for one of these business concepts, prefer the metric definition above over inventing a new definition.',
    ].join('\n');
}
