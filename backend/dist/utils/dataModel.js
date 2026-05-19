"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDataModel = getDataModel;
function getDataModel() {
    return `
You have access to the following MySQL tables for the recruitcrm_normlized database.

CRITICAL RULES:
- All date/time fields are UNIX timestamps stored as integers.
- Always use FROM_UNIXTIME() before date formatting, for example:
  DATE_FORMAT(FROM_UNIXTIME(createdon), '%Y-%m') AS month
- Never use DATE_FORMAT() directly on integer timestamp columns.
- Do not select PII fields: emailid, contactnumber, formatted_contact_number.
- Keep results analytics-focused and avoid exposing raw personal contact data.

TABLE: tblcandidate (69 rows)
PURPOSE: Candidate profiles.
COLUMNS OF INTEREST:
  - id (int) [PRIMARY KEY]
  - firstname (varchar(40))
  - lastname (varchar(40))
  - genderid (tinyint(1))
  - qualificationid (int)
  - specialization (varchar(200))
  - locationid (smallint)
  - workexpyr (tinyint(1))
  - workexpmonth (tinyint(1))
  - currentsalary (float(12,2))
  - salaryexpectation (float(12,2))
  - willingtorelocate (tinyint(1))
  - lastorganisation (varchar(300))
  - currentstatus (varchar(45))
  - noticeperiod (int)
  - city (varchar(50))
  - state (varchar(60))
  - country (varchar(60))
  - locality (varchar(100))
  - position (varchar(512))
  - relevantexperience (int)
  - skill (text)
  - source (text)
  - deleted (tinyint(1)) NOT NULL
  - ownerid (int)
  - accountid (int) NOT NULL
  - createdon (int) [UNIX TIMESTAMP]
  - updatedon (int) [UNIX TIMESTAMP]
  - availablefrom (int) [UNIX TIMESTAMP]
  - salarytype (varchar(30))
  - isduplicate (tinyint(1))

FILTER RULE: always include deleted = 0.

TABLE: tblassignjobcandidate (61 rows)
PURPOSE: Candidate-to-job assignments and pipeline analytics.
COLUMNS OF INTEREST:
  - id (int) [PRIMARY KEY]
  - jobid (int) [FK → tbljob.id]
  - candidateid (int) [FK → tblcandidate.id]
  - candidatestatusid (int)
  - billingdate (int) [UNIX TIMESTAMP]
  - billingamount (varchar(15))
  - total (varchar(15))
  - ownerid (int)
  - accountid (int) NOT NULL
  - createdon (int) [UNIX TIMESTAMP]
  - updatedon (int) [UNIX TIMESTAMP]
  - joiningdate (int) [UNIX TIMESTAMP]
  - stagedate (int) [UNIX TIMESTAMP]
  - paymentstatusid (int)
  - jobname (varchar(200)) denormalized
  - candidatename (varchar(90)) denormalized
  - companyname (varchar(60)) denormalized
  - contactname (varchar(130)) denormalized
  - clientfeedback (tinyint(1))
  - client_id (int)

FILTER RULE: no deleted/archived flags exist on this table.

TABLE: tbldeals (17 rows)
PURPOSE: CRM deals analytics.
COLUMNS OF INTEREST:
  - id (int) [PRIMARY KEY]
  - name (varchar(300))
  - dealstage (int)
  - dealvalue (decimal(17,2))
  - dealpercentagevalue (decimal(17,2))
  - closedate (int) [UNIX TIMESTAMP]
  - dealtype (int)
  - relatedcompany (int)
  - relatedcandidate (int)
  - related_job (int)
  - archived (tinyint(1)) NOT NULL
  - ownerid (int)
  - accountid (int) NOT NULL
  - createdon (int) [UNIX TIMESTAMP]
  - updatedon (int) [UNIX TIMESTAMP]
  - sourceid (int)
  - split_type (int)

FILTER RULE: always include archived = 0.

TABLE: tbljob (2,249 rows)
PURPOSE: Job requisitions and openings.
COLUMNS OF INTEREST:
  - id (int) [PRIMARY KEY]
  - name (varchar(300))
  - description (text)
  - qualificationid (int)
  - specialization (varchar(300))
  - minexperienceinyears (tinyint(1))
  - maxexperienceinyears (tinyint(1))
  - annualsalarymin (float(11,2))
  - annualsalarymax (float(11,2))
  - noofopenings (smallint)
  - jobstatus (int)
  - companyid (int)
  - contactid (int)
  - currencyid (int)
  - slug (varchar(90))
  - allowapply (tinyint(1))
  - deleted (tinyint(1)) NOT NULL
  - ownerid (int)
  - accountid (int) NOT NULL
  - createdon (int) [UNIX TIMESTAMP]
  - updatedon (int) [UNIX TIMESTAMP]
  - jobpostingdate (int) [UNIX TIMESTAMP]
  - locality (varchar(100))
  - city (varchar(50))
  - state (varchar(50))
  - country (varchar(50))
  - jobpostingstatus (int)
  - jobcode (varchar(10))
  - showcompany (tinyint(1))
  - showaccountname (tinyint)
  - salarytype (varchar(30))
  - job_type (varchar(20))
  - job_category (varchar(100))
  - job_skill (text)
  - remote (tinyint(1))
  - hiring_pipeline_id (int)

FILTER RULE: always include deleted = 0.

RELATIONSHIPS:
  - tblassignjobcandidate.candidateid → tblcandidate.id
  - tblassignjobcandidate.jobid → tbljob.id
  - tbldeals.relatedcandidate may reference tblcandidate.id and should be left-joined carefully.
  - tbldeals.related_job may reference tbljob.id and should be left-joined carefully.

JOIN GUIDANCE:
  - Use tblassignjobcandidate as the primary bridge between candidates and jobs.
  - tblcandidate does NOT have a candidatename column; build display names with CONCAT(firstname, ' ', lastname) AS candidate_name when needed.
  - tbljob uses name for the job title; select tbljob.name AS jobname if you want a job label in the result.
  - tblassignjobcandidate also has a denormalized jobname column, but it should only be used when that table is the primary source.
  - If you join tbldeals to candidates, prefer LEFT JOIN tblcandidate ON tbldeals.relatedcandidate = tblcandidate.id.
  - If you need both candidate and job context for a deal, join tbldeals → tblcandidate → tblassignjobcandidate → tbljob, or join tbldeals → tblassignjobcandidate when the pipeline relation is the primary source.
  - When grouping by display labels, always group by the exact selected expression or an alias that exists in the query.

RECOMMENDED ANALYTICS PATTERNS:
  - Candidates added per month: DATE_FORMAT(FROM_UNIXTIME(createdon), '%Y-%m')
  - Jobs created per month: DATE_FORMAT(FROM_UNIXTIME(createdon), '%Y-%m')
  - Pipeline stage breakdown: GROUP BY candidatestatusid
  - Deal value by stage: GROUP BY dealstage
  - Remote vs onsite jobs: CASE WHEN remote = 1 THEN 'Remote' ELSE 'On-site' END
`.trim();
}
