"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCHEMA_COLUMN_MAP = exports.SCHEMA_TABLES = void 0;
exports.getRelevantSchemaContext = getRelevantSchemaContext;
exports.getDataModel = getDataModel;
exports.SCHEMA_TABLES = [
    {
        name: 'tblcandidate',
        purpose: 'Candidate profiles and talent attributes.',
        columns: [
            'id',
            'srno',
            'firstname',
            'lastname',
            'emailid',
            'currentstatus',
            'genderid',
            'contactnumber',
            'qualificationid',
            'specialization',
            'locationid',
            'workexpyr',
            'workexpmonth',
            'candidatedob',
            'currentsalary',
            'salaryexpectation',
            'resume',
            'resumefilename',
            'willingtorelocate',
            'lastorganisation',
            'noticeperiod',
            'currencyid',
            'slug',
            'authid',
            'resumeupdatedon',
            'resumeupdaterequestedon',
            'requestresumelinkstatus',
            'resumeaddedon',
            'profilepic',
            'profilefacebook',
            'profilegithub',
            'profiletwitter',
            'profilelinkedin',
            'deleted',
            'ownerid',
            'accountid',
            'createdby',
            'createdon',
            'updatedby',
            'updatedon',
            'city',
            'state',
            'country',
            'locality',
            'lng',
            'relevantexperience',
            'position',
            'canaccess',
            'availablefrom',
            'salarytype',
            'source',
            'sourceadded',
            'languageskills',
            'skill',
            'isduplicate',
            'address',
            'lat',
            'sourceid',
            'migration_reserved1',
            'migration_reserved2',
            'email_opt_out',
            'profilexing',
            'unavailable',
            'availability_updated_by',
            'sovren_document_id',
            'email_opt_out_source',
            'formatted_contact_number',
            'formatted_profilelinkedin',
            'formatted_profile_linkedin',
            'sms_opt_out',
            'sms_consent',
            'postal_code',
            'location',
            'merge_flag',
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
            'tax',
            'total',
            'remark',
            'updatedbytype',
            'ownerid',
            'accountid',
            'createdby',
            'createdon',
            'updatedby',
            'updatedon',
            'share',
            'joiningdate',
            'stagedate',
            'paymentstatusid',
            'invoiceid',
            'jobname',
            'candidatename',
            'companyname',
            'contactname',
            'jobslug',
            'candidateslug',
            'companyslug',
            'contactslug',
            'invoiceurl',
            'clientfeedback',
            'formatted_cv',
            'coverletter',
            'portfolio',
            'other_file_1',
            'other_file_2',
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
            'srno',
            'name',
            'dealstage',
            'dealvalue',
            'dealpercentagevalue',
            'closedate',
            'dealtype',
            'slug',
            'relatedcompany',
            'relatedcandidate',
            'related_job',
            'archived',
            'ownerid',
            'accountid',
            'createdby',
            'createdon',
            'updatedby',
            'updatedon',
            'sourceid',
            'split_type',
            'migration_reserved1',
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
            'srno',
            'name',
            'description',
            'qualificationid',
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
            'jdtext',
            'details',
            'detailfilename',
            'deleted',
            'collaborator',
            'authid',
            'ownerid',
            'accountid',
            'createdby',
            'createdon',
            'updatedby',
            'updatedon',
            'jobpostingdate',
            'city',
            'lat',
            'lng',
            'address',
            'state',
            'country',
            'jobpostingstatus',
            'jobcode',
            'showcompany',
            'showaccountname',
            'canaccess',
            'salarytype',
            'jobstatuscomment',
            'jobquestions',
            'sharecandidatefields',
            'submitcandidateemailsenton',
            'cvljobpostingid',
            'sourceid',
            'job_type',
            'job_category',
            'job_skill',
            'remote',
            'hiring_pipeline_id',
            'migration_reserved1',
            'migration_reserved2',
            'mapped_pending_job_id',
            'enable_vms_link',
            'job_online_candidate_list_passcode',
        ],
        keywords: ['job', 'jobs', 'role', 'opening', 'openings', 'hiring', 'req', 'requisition', 'remote', 'company', 'specialization', 'department'],
        filters: ['tbljob.deleted = 0'],
    },
];
exports.SCHEMA_COLUMN_MAP = new Map(exports.SCHEMA_TABLES.map((table) => [table.name, new Set(table.columns.map((column) => column.toLowerCase()))]));
const SCHEMA_CONTEXT_CACHE = new Map();
const SCHEMA_HEADER = [
    'SCHEMA CONTEXT:',
    'Use only the tables and columns listed below.',
    'All date/time fields are UNIX timestamps; use FROM_UNIXTIME() before date formatting or bucketing.',
    'Avoid PII fields such as emailid, contactnumber, and formatted_contact_number.',
    'Prefer compact analytical shapes instead of verbose table dumps.',
].join('\n');
function normalizeIntent(intent) {
    return intent.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function scoreTable(table, intent) {
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
function selectRelevantTables(intent) {
    const ranked = exports.SCHEMA_TABLES
        .map((table) => ({ table, score: scoreTable(table, intent) }))
        .sort((left, right) => right.score - left.score);
    const selected = ranked.filter((entry) => entry.score > 0).map((entry) => entry.table);
    if (selected.length === 0) {
        return [exports.SCHEMA_TABLES[1]];
    }
    const selectedNames = new Set(selected.map((table) => table.name));
    const intentText = normalizeIntent(intent);
    if ((selectedNames.has('tblcandidate') && selectedNames.has('tbljob')) || /funnel|placement|conversion|assignment|pipeline/.test(intentText)) {
        selectedNames.add('tblassignjobcandidate');
    }
    if ((selectedNames.has('tbldeals') && (selectedNames.has('tblcandidate') || selectedNames.has('tbljob'))) || /deal|revenue|billing|value|close/.test(intentText)) {
        selectedNames.add('tblassignjobcandidate');
    }
    return exports.SCHEMA_TABLES.filter((table) => selectedNames.has(table.name));
}
function formatTableDefinition(table) {
    return `${table.name}(${table.columns.join(', ')})`;
}
function formatSchemaTable(table) {
    const details = [
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
function buildSchemaContext(intent) {
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
function getRelevantSchemaContext(userIntent = '') {
    return buildSchemaContext(userIntent);
}
function getDataModel(userIntent = '') {
    return getRelevantSchemaContext(userIntent);
}
