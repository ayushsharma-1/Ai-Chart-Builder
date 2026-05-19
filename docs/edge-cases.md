# Edge Cases, Limitations, and Technical Debt

## Edge Cases Covered

### 1. SQL Injection & Destructive Operations
- **Backend Defense (`sqlGuard.ts`):** The backend actively regex-filters for destructive commands (`DROP`, `DELETE`, `TRUNCATE`, `UPDATE`, `INSERT`, `ALTER`, `GRANT`).
- **Function Blocking:** Blocks potentially dangerous MySQL functions (e.g., `LOAD_FILE`, `INTO OUTFILE`, `SLEEP`).
- **Strict Read-Only:** Enforces that queries must start with `SELECT` or `WITH`.

### 2. Missing Limits
- **Automated Injection:** The backend parser (`sqlGuard.ts` -> `enforceLimit`) automatically appends a `LIMIT 100` clause if the generated query does not contain one, preventing massive data pulls that could crash the Node.js server or the browser.

### 3. Reserved Keywords
- **Alias Formatting:** The AI is instructed, and the prompt validation ensures, that columns do not use MySQL reserved keywords as aliases (e.g., avoiding `AS match`, which causes syntax errors).

### 4. Chart Rendering Resiliency
- **Data Inference:** The `ChartRenderer.tsx` and `chartUtils.ts` do not crash if the AI returns unexpected column names. They scan the dataset to identify numeric columns versus dimensional columns, intelligently selecting the primary and secondary Y-axes.
- **Dual Y-Axes:** If a chart contains two metrics with vastly different magnitudes (e.g., Revenue in millions and Conversion Rate in percentages), the renderer automatically splits them into left and right Y-axes to prevent flatlining lines.
- **Empty Results:** If a query executes successfully but returns 0 rows, the UI gracefully renders an `EmptyState` component instead of throwing a rendering error.

### 5. ONLY_FULL_GROUP_BY Compliance
- **Validation Loop:** MySQL 8 enforces strict `GROUP BY` rules. The LLM service (`llm.service.ts`) detects `ONLY_FULL_GROUP_BY` errors upon query execution and will automatically ask the LLM to rewrite the query once to fix the missing aggregated columns before failing completely.

---

## Missing Areas & Limitations

### 1. Dynamic Schema Discovery (RAG)
- **Static Schema:** The data schema (`getDataModel()` in `llm.service.ts`) and semantic metrics are hardcoded into the system prompt.
- **Scalability Issue:** As the database grows to hundreds of tables, the entire schema will not fit into the LLM context window. A retrieval-augmented generation (RAG) approach or a semantic layer (like dbt metadata) is missing.

### 2. Query Caching
- **No Redis/Memcached:** While charts save a `dataSnapshot` in MongoDB, ad-hoc queries in the chat interface directly hit the analytical database. There is no query caching layer to prevent identical prompts from re-running expensive SQL.

### 3. Multi-Tenancy & Row-Level Security
- **Trusting the LLM:** The application relies entirely on the LLM to append `WHERE accountid = X` to queries. If the LLM hallucinates or forgets the filter, cross-tenant data leakage occurs.
- **Missing Enforcer:** There is no AST (Abstract Syntax Tree) parsing layer to forcefully inject the tenant ID into the SQL `WHERE` clause before execution.

### 4. Authentication & Authorization
- **Mocked Auth:** The POC does not integrate with a real authentication provider (e.g., NextAuth, Clerk). All actions run under an assumed user context.

---

## Technical Debt

### 1. State Management Synchronization
- The chat state is persisted entirely in `localStorage`. If a user switches browsers or clears cache, their chat history is lost. Chat sessions should be migrated to MongoDB for true persistence.

### 2. Chart Layout Synchronization
- Saving chart layouts currently triggers sequential or debounced `PATCH` requests. This could lead to race conditions if a user moves multiple widgets rapidly.

### 3. Backend Error Handling
- The `sqlGuard` relies heavily on regex for security. Regex-based SQL parsing is famously brittle against sophisticated evasion techniques (e.g., nested comments `SELECT/*...*/user`). An actual SQL parser library (like `node-sql-parser`) should be used for AST validation.
- Error messages returned to the frontend often expose raw database table names if the LLM generates a syntax error, leaking internal database structure.
