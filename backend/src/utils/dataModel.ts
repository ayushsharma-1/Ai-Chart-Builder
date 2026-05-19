interface SchemaTableDefinition {
  name: string;
  purpose: string;
  columns: string[];
  keywords: string[];
  relations?: string[];
  filters?: string[];
}

const SCHEMA_TABLES: SchemaTableDefinition[] = [
  {
    name: 'tblcandidate',
    purpose: 'Candidate profiles and talent attributes.',
    columns: [
      'id',
      'firstname',
      'lastname',
      'currentstatus',
      'city',
      'state',
      'country',
      'position',
      'relevantexperience',
      'skill',
      'source',
      'deleted',
      'ownerid',
      'accountid',
      'createdon',
      'updatedon',
      'availablefrom',
      'salarytype',
      'isduplicate',
    ],
    keywords: ['candidate', 'candidates', 'talent', 'profile', 'resume', 'skill', 'experience', 'owner', 'source', 'status'],
    filters: ['tblcandidate.deleted = 0'],
  },
  {
    name: 'tblassignjobcandidate',
    purpose: 'Bridge table for candidate-to-job assignments and funnel analytics.',
    columns: [
      'id',
      'jobid',
      'candidateid',
      'candidatestatusid',
      'billingdate',
      'billingamount',
      'total',
      'ownerid',
      'accountid',
      'createdon',
      'updatedon',
      'joiningdate',
      'stagedate',
      'paymentstatusid',
      'jobname',
      'candidatename',
      'companyname',
      'contactname',
      'clientfeedback',
      'client_id',
    ],
    keywords: ['assignment', 'assignments', 'pipeline', 'placement', 'funnel', 'billing', 'billingamount', 'total', 'stage', 'status', 'conversion'],
    relations: ['tblassignjobcandidate.candidateid -> tblcandidate.id', 'tblassignjobcandidate.jobid -> tbljob.id'],
  },
  {
    name: 'tbldeals',
    purpose: 'CRM deal and revenue analytics.',
    columns: [
      'id',
      'name',
      'dealstage',
      'dealvalue',
      'dealpercentagevalue',
      'closedate',
      'dealtype',
      'relatedcompany',
      'relatedcandidate',
      'related_job',
      'archived',
      'ownerid',
      'accountid',
      'createdon',
      'updatedon',
      'sourceid',
      'split_type',
    ],
    keywords: ['deal', 'deals', 'revenue', 'billing', 'amount', 'value', 'closed', 'close date', 'pipeline', 'owner', 'company', 'stage'],
    filters: ['tbldeals.archived = 0'],
    relations: ['tbldeals.relatedcandidate -> tblcandidate.id', 'tbldeals.related_job -> tbljob.id'],
  },
  {
    name: 'tbljob',
    purpose: 'Job requisitions, openings, and hiring demand.',
    columns: [
      'id',
      'name',
      'description',
      'specialization',
      'minexperienceinyears',
      'maxexperienceinyears',
      'annualsalarymin',
      'annualsalarymax',
      'noofopenings',
      'jobstatus',
      'companyid',
      'contactid',
      'currencyid',
      'slug',
      'allowapply',
      'deleted',
      'ownerid',
      'accountid',
      'createdon',
      'updatedon',
      'jobpostingdate',
      'city',
      'state',
      'country',
      'jobpostingstatus',
      'jobcode',
      'showcompany',
      'showaccountname',
      'salarytype',
      'job_type',
      'job_category',
      'job_skill',
      'remote',
      'hiring_pipeline_id',
    ],
    keywords: ['job', 'jobs', 'role', 'opening', 'openings', 'hiring', 'req', 'requisition', 'remote', 'company', 'specialization', 'department'],
    filters: ['tbljob.deleted = 0'],
  },
];

const SCHEMA_CONTEXT_CACHE = new Map<string, string>();

const SCHEMA_HEADER = [
  'SCHEMA CONTEXT:',
  'Use only the tables and columns listed below.',
  'All date/time fields are UNIX timestamps; use FROM_UNIXTIME() before date formatting or bucketing.',
  'Avoid PII fields such as emailid, contactnumber, and formatted_contact_number.',
  'Prefer compact analytical shapes instead of verbose table dumps.',
].join('\n');

function normalizeIntent(intent: string) {
  return intent.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function scoreTable(table: SchemaTableDefinition, intent: string) {
  const haystack = normalizeIntent([table.name, table.purpose, ...table.columns, ...table.keywords].join(' '));
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

function selectRelevantTables(intent: string) {
  const ranked = SCHEMA_TABLES
    .map((table) => ({ table, score: scoreTable(table, intent) }))
    .sort((left, right) => right.score - left.score);

  const selected = ranked.filter((entry) => entry.score > 0).map((entry) => entry.table);

  if (selected.length === 0) {
    return [SCHEMA_TABLES[1]];
  }

  const selectedNames = new Set(selected.map((table) => table.name));
  const intentText = normalizeIntent(intent);

  if ((selectedNames.has('tblcandidate') && selectedNames.has('tbljob')) || /funnel|placement|conversion|assignment|pipeline/.test(intentText)) {
    selectedNames.add('tblassignjobcandidate');
  }

  if ((selectedNames.has('tbldeals') && (selectedNames.has('tblcandidate') || selectedNames.has('tbljob'))) || /deal|revenue|billing|value|close/.test(intentText)) {
    selectedNames.add('tblassignjobcandidate');
  }

  return SCHEMA_TABLES.filter((table) => selectedNames.has(table.name));
}

function formatTableDefinition(table: SchemaTableDefinition) {
  return `${table.name}(${table.columns.join(', ')})`;
}

function formatSchemaTable(table: SchemaTableDefinition) {
  const details: string[] = [
    `- ${formatTableDefinition(table)}`,
    `  purpose: ${table.purpose}`,
  ];

  if (table.filters?.length) {
    details.push(`  filters: ${table.filters.join('; ')}`);
  }

  if (table.relations?.length) {
    details.push(`  relations: ${table.relations.join('; ')}`);
  }

  return details.join('\n');
}

function buildSchemaContext(intent: string) {
  const cacheKey = normalizeIntent(intent);
  const cached = SCHEMA_CONTEXT_CACHE.get(cacheKey);

  if (cached) {
    return cached;
  }

  const relevantTables = selectRelevantTables(intent);
  const relationshipHints = relevantTables.flatMap((table) => table.relations || []);
  const filters = relevantTables.flatMap((table) => table.filters || []);

  const contextParts = [
    SCHEMA_HEADER,
    'Relevant tables:',
    ...relevantTables.map((table) => formatSchemaTable(table)),
    relationshipHints.length ? `RELATIONSHIPS: ${Array.from(new Set(relationshipHints)).join('; ')}` : '',
    filters.length ? `DEFAULT FILTERS: ${Array.from(new Set(filters)).join('; ')}` : '',
    'JOIN GUIDANCE: Use tblassignjobcandidate as the bridge for candidate/job funnel analytics. Use tbljob.name as the job label, and CONCAT(firstname, " ", lastname) when a candidate display name is needed.',
    'ANALYTICAL HINTS: Group by compact business dimensions such as month, recruiter, owner, company, source, stage, status, or job.',
  ].filter(Boolean);

  const context = contextParts.join('\n');
  SCHEMA_CONTEXT_CACHE.set(cacheKey, context);
  return context;
}

export function getRelevantSchemaContext(userIntent = ''): string {
  return buildSchemaContext(userIntent);
}

export function getDataModel(userIntent = ''): string {
  return getRelevantSchemaContext(userIntent);
}