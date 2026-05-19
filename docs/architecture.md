# Architecture, Product Flow, and AI Flow

## Product Flow
The AI Analytics platform provides a seamless flow from natural language questioning to persistent dashboards:

1. **Ask (Chat Interface):** The user enters a natural language question (e.g., "Show me revenue by department for the last quarter").
2. **Translate & Guard:** The system translates the request into SQL via LLM, applies security guardrails, and executes it.
3. **Visualize:** The frontend automatically determines the best chart type (Bar, Line, Pie, Table) based on the data shape and renders it in the chat.
4. **Iterate:** The user can ask follow-up questions ("Make it a line chart" or "Only show marketing"). The system remembers the context.
5. **Save:** The user clicks "Save" to persist the chart's SQL, configuration, and data snapshot to the database.
6. **Dashboard:** The user creates a Report, opens the chart picker, and drops their saved charts onto a resizable, draggable grid layout.
7. **Insight & Share:** The user generates a dashboard-wide AI summary to highlight anomalies and shares the dashboard via a public link.

## High-Level Architecture
The application is a standard modern decoupled web stack.
- **Frontend:** Next.js (App Router), React, Tailwind, Recharts, React-Grid-Layout.
- **Backend:** Node.js, Express, TypeScript, Zod.
- **AI Engine:** Groq API leveraging `Llama 3.3-70b`.
- **State Database:** MongoDB (Mongoose) stores Chats, Saved Charts, and Dashboard Layouts.
- **Analytical Database:** MySQL 8.0 stores the actual business data being queried.

## Data Flow
The flow of data from user prompt to rendered chart:
1. `ChatPanel.tsx` -> `POST /api/query` (JSON payload with prompt).
2. `query.route.ts` -> Parses and validates the request using Zod.
3. `llm.service.ts` -> Fetches the static schema, builds the massive system prompt, and calls Groq.
4. `Groq LLM` -> Returns a JSON string containing the SQL query, reasoning, and chart type recommendation.
5. `llm.service.ts` -> Parses the JSON response.
6. `sqlGuard.ts` -> Validates the SQL string (blocks `DELETE`, `DROP`, injects `LIMIT`).
7. `sql.service.ts` -> Executes the SQL on the MySQL database connection pool.
8. `query.route.ts` -> Returns the result rows, metadata, and SQL back to the frontend.
9. `InlineChartCard.tsx` -> Re-infers the dataset to ensure the recommended chart type is actually viable for the returned data.
10. `ChartRenderer.tsx` -> Passes the normalized data to Recharts for SVG rendering.

## AI Flow & Prompt Engineering

The core intelligence of the application resides in `llm.service.ts`. The prompt engineering strategy is highly structured:

### 1. Role Assignment
The LLM is explicitly assigned the role of a "Senior Data Analyst and SQL Expert".

### 2. Schema Injection
The prompt dynamically injects the `getDataModel()` definition, which includes:
- Exact table names.
- Column definitions with data types (e.g., `VARCHAR`, `DECIMAL(10,2)`).
- Table relationships (Foreign Key mapping).

### 3. Semantic Rules
To prevent hallucination, the system provides strict business logic rules:
- **Aliases:** "Never use MySQL reserved keywords as column aliases."
- **Date Functions:** "Always use `FROM_UNIXTIME()` if dates are stored as UNIX timestamps."
- **Aggregations:** "Always group correctly to avoid ONLY_FULL_GROUP_BY errors."

### 4. Output Formatting (JSON Mode)
The LLM is constrained to output *only* valid JSON. The requested schema is:
```json
{
  "title": "String (Short chart title)",
  "sql": "String (The valid MySQL query)",
  "reasoning": "String (Step-by-step logic)",
  "chartType": "String (bar|line|pie|table)",
  "chartConfig": {
    "xAxis": "String (The dimension column name)",
    "yAxis": "String (The primary metric column name)",
    "seriesKeys": ["String"] 
  },
  "confidenceScore": 95
}
```

### 5. Conversational Memory
If the user is interacting with an existing chart, the backend passes `context.previousSql` and `context.previousPrompt`. The LLM is instructed to treat the new prompt as a modification request against the existing SQL, allowing for powerful "drill-down" or "filtering" conversational chains without needing to re-state the entire original request.
