# Backend Implementation & SQL Safety

## Overview
The backend is a Node.js API built with Express, TypeScript, and Mongoose. It serves as the bridge between the conversational Next.js frontend, the Groq LLM API, the MySQL analytical data warehouse, and the MongoDB state storage.

## Core Stack & Dependencies
- **Runtime:** Node.js
- **Framework:** Express with Zod for strict request body validation.
- **Languages:** TypeScript.
- **Databases:** Mongoose (MongoDB) for state; `mysql2` for analytical querying.
- **AI Integration:** `@groq/groq-sdk` for communication with Llama 3.3-70b.

## Directory Structure
- `src/`
  - `routes/`: Express route definitions (`query.route.ts`, `chart.route.ts`, `report.route.ts`).
  - `services/`: Business logic orchestration.
    - `llm.service.ts`: Orchestrates Groq calls, builds the system prompt with schemas, and validates responses.
    - `sql.service.ts`: Manages the MySQL connection pool and executes queries safely.
    - `chart.service.ts`: Manages CRUD operations for saved charts in MongoDB.
    - `report.service.ts`: Handles complex dashboard operations, versioning, sharing, and dashboard-level AI insight generation.
  - `models/`: Mongoose schemas (`Chart.ts`, `Report.ts`).
  - `utils/`: Helpers.
    - `sqlGuard.ts`: Core SQL safety layer for regex validation and sanitization.
    - `promptUtils.ts`: Prepares semantic layers.

## Backend Request Flow
1. **API Call (`POST /api/query`)**: Frontend sends `{ prompt, context? }`.
2. **Validation**: Zod validates the incoming request payload.
3. **LLM Orchestration (`llm.service.ts`)**:
   - Compiles the system prompt by calling `getDataModel()`, embedding table definitions, schemas, and semantic metrics.
   - Prepends the previous context (if provided) to allow conversational follow-ups.
   - Instructs Groq to respond strictly in a predefined JSON format.
4. **SQL Guardrail Check (`sqlGuard.ts`)**:
   - Validates that the returned SQL is a `SELECT` or `WITH`.
   - Filters against blocklisted destructive keywords.
   - Injects `LIMIT 100` if missing.
5. **Execution (`sql.service.ts`)**:
   - Executes the validated SQL against MySQL.
   - Records execution time and row count.
6. **Response formatting**: Returns the SQL, the exact data rows, and the LLM's explanation to the frontend.

## SQL Safety & Security (`sqlGuard.ts`)

To prevent AI-generated SQL injections and destructive operations, the backend uses a layered validation approach:

### 1. The Blocklist
`sqlGuard` maintains a strict array of blocked substrings that trigger an immediate rejection:
- **DML/DDL operations:** `DROP`, `DELETE`, `TRUNCATE`, `UPDATE`, `INSERT`, `ALTER`, `GRANT`, `REVOKE`.
- **Dangerous Functions:** `LOAD_FILE`, `INTO OUTFILE`, `SLEEP`, `BENCHMARK`.
- **System Tables:** Queries attempting to access `information_schema` or `mysql` tables are rejected to prevent internal discovery.

### 2. Read-Only Enforcement
The parsed query string is stripped of leading whitespace and comments. It *must* begin with `SELECT` or `WITH`. If it starts with anything else, the query is rejected.

### 3. Automatic Limit Injection (`enforceLimit`)
To protect against massive full-table scans crashing the Node.js memory footprint or the browser, the guard checks for the presence of a `LIMIT` clause.
- If missing, it automatically appends `LIMIT 100` to the end of the query.

### 4. ONLY_FULL_GROUP_BY Handling
MySQL 8 has strict `GROUP BY` requirements. If the AI generates a query missing aggregated non-grouped columns, MySQL throws an error.
- The `llm.service.ts` catches `ER_WRONG_FIELD_WITH_GROUP` specifically.
- It automatically triggers a retry loop, feeding the exact error message back to the LLM: `"The query failed with an ONLY_FULL_GROUP_BY error. Rewrite it so all selected non-aggregated columns are in the GROUP BY clause."`

## Database Models

### Chart Model (`Chart.ts`)
Stores individual visualized queries.
- **Fields:** `title`, `prompt`, `sql`, `reasoning`, `chartType`, `chartConfig` (x/y axis bindings).
- **Data Snapshot:** Stores the raw JSON array of the executed query results, allowing instantaneous dashboard loads without hitting MySQL.
- **Grid Positioning:** Default layout positioning for when the chart is unassigned to a report.

### Report Model (`Report.ts`)
Stores dashboards (collections of charts).
- **Fields:** `title`, `description`, `visibility` (private/public).
- **Charts Array:** References to `Chart` IDs.
- **Share Options:** Token-based sharing.
- **AI Summary:** Stores dashboard-level generated insights (`trends`, `anomalies`).
