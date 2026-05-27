export interface SchemaTableDefinition {
  name: string;
  purpose: string;
  columns: string[];
  keywords: string[];
  relations?: string[];
  filters?: string[];
}

export interface RelationCard {
  table: string;
  leftTable: string;
  leftCol: string;
  rightTable: string;
  rightCol: string;
  label: string;
}

const TABLES: SchemaTableDefinition[] = [
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

function normalizeName(value: string) {
  return value.toLowerCase().trim();
}

function parseRelation(relation: string) {
  const match = relation.match(/^([^.]+)\.([^\s]+)\s*->\s*([^.]+)\.([^\s]+)$/);

  if (!match) {
    return null;
  }

  return {
    leftTable: normalizeName(match[1]),
    leftCol: normalizeName(match[2]),
    rightTable: normalizeName(match[3]),
    rightCol: normalizeName(match[4]),
  };
}

export const SCHEMA_TABLES = TABLES;

export const SCHEMA_COLUMN_MAP = new Map(
  SCHEMA_TABLES.map((table) => [table.name, new Set(table.columns.map((column) => column.toLowerCase()))] as const),
);

const TABLE_LOOKUP = new Map(SCHEMA_TABLES.map((table) => [table.name, table] as const));
const RELATION_LOOKUP = new Map<string, RelationCard[]>();

for (const table of SCHEMA_TABLES) {
  for (const relation of table.relations || []) {
    const parsed = parseRelation(relation);
    if (!parsed) {
      continue;
    }

    const forward: RelationCard = {
      table: parsed.rightTable,
      leftTable: parsed.leftTable,
      leftCol: parsed.leftCol,
      rightTable: parsed.rightTable,
      rightCol: parsed.rightCol,
      label: `${parsed.leftTable} ↔ ${parsed.rightTable} via ${parsed.leftCol} → ${parsed.rightCol}`,
    };

    const reverse: RelationCard = {
      table: parsed.leftTable,
      leftTable: parsed.rightTable,
      leftCol: parsed.rightCol,
      rightTable: parsed.leftTable,
      rightCol: parsed.leftCol,
      label: `${parsed.rightTable} ↔ ${parsed.leftTable} via ${parsed.rightCol} → ${parsed.leftCol}`,
    };

    const existingForward = RELATION_LOOKUP.get(parsed.leftTable) || [];
    const existingReverse = RELATION_LOOKUP.get(parsed.rightTable) || [];
    RELATION_LOOKUP.set(parsed.leftTable, [...existingForward.filter((item) => item.table !== forward.table), forward]);
    RELATION_LOOKUP.set(parsed.rightTable, [...existingReverse.filter((item) => item.table !== reverse.table), reverse]);
  }
}

export function getTableDefinition(tableName: string | null | undefined) {
  if (!tableName) {
    return null;
  }

  return TABLE_LOOKUP.get(tableName) || null;
}

export function getTableColumnCount(tableName: string | null | undefined) {
  return getTableDefinition(tableName)?.columns.length || 0;
}

export function getTableColumns(tableName: string | null | undefined) {
  return getTableDefinition(tableName)?.columns || [];
}

export function isNumericColumn(columnName: string) {
  const normalized = normalizeName(columnName);

  return (
    normalized === 'id' ||
    normalized.endsWith('id') ||
    /(amount|value|count|total|salary|min|max|price|cost|rate|year|month|day|experience|openings|tax|percent|percentage|lat|lng|score|rating|number|age|duration|balance|qty|quantity|rank|position|limit|limitid)$/i.test(normalized)
  );
}

export function isDateLikeColumn(columnName: string) {
  return /(date|time|on|created|updated|month|year|day|joined|joining|posting|closed|availablefrom|requested)/i.test(columnName);
}

export function getAvailableJoins(baseTable: string | null | undefined) {
  if (!baseTable) {
    return [];
  }

  return RELATION_LOOKUP.get(baseTable) || [];
}
