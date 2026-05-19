# High-Level Architecture Narrative (Interview & Stakeholder Notes)

## The Elevator Pitch
"We built an AI-first analytics platform that acts as a conversational data analyst. Users can ask questions in plain English, and the system translates those into secure, optimized SQL queries, executes them against our analytical database, and instantly generates responsive charts. Users can then pin these charts to a live, shareable dashboard."

## Core Architecture
The system uses a modern, decoupled full-stack architecture:
1. **Frontend (Next.js / React):** Handles the conversational UI, chart inference, and dashboard grid layout. It maintains session state locally and delegates complex rendering logic to Recharts.
2. **Backend API (Node.js / Express):** Acts as the orchestrator. It receives natural language prompts, interacts with the LLM to generate SQL, validates the SQL for security, executes the query, and stores persistent layouts.
3. **AI Engine (Groq / Llama 3.3-70b):** The intelligence layer. It receives a heavily engineered system prompt containing the database schema and semantic definitions to write context-aware SQL.
4. **Databases:**
   - **MongoDB:** Stores application state (Saved Charts, Dashboard Layouts, AI Insights, Share Tokens).
   - **MySQL 8.0:** The target analytical data warehouse where the actual SQL is executed against business data.

## The "Wow" Factors (What to highlight)
1. **Conversational Context:** The chat interface isn't just one-shot. When users ask follow-up questions, the frontend passes the *previous* chart's SQL and context back to the LLM, allowing for iterative refinement ("Now break that down by month").
2. **Dynamic Chart Inference:** The frontend doesn't rely on the LLM to pick the chart type perfectly. `ChartRenderer.tsx` inspects the returned dataset. If there are multiple metrics with vastly different scales, it automatically spawns a Dual Y-Axis chart to keep the visualization readable.
3. **Explainability & Trust:** AI can hallucinate. To build trust, we built an "Explainability Panel" where users can inspect the exact SQL generated, view the LLM's reasoning, and see a confidence score. If the AI gets it slightly wrong, power users can manually edit the SQL prompt.
4. **Automated Dashboard Insights:** Dashboards aren't just static grids. The backend can ingest the snapshots of all 10 charts on a dashboard and use the LLM to generate a synthesized executive summary, highlighting anomalies or trends across the entire dataset.

## Security & Safety Story
"How do you prevent the AI from dropping the database?"
We implemented a strict defense-in-depth strategy:
- **Zero-Trust Prompts:** The LLM is explicitly instructed to only generate `SELECT` statements, but we do not trust it.
- **Regex Guardrails:** Before any query touches the database, `sqlGuard.ts` scans for blocklisted commands (`DROP`, `DELETE`, `UPDATE`) and forbidden functions (`LOAD_FILE`).
- **Execution Guardrails:** We automatically inject a `LIMIT 100` clause to prevent accidental million-row table scans that would crash the server.
- **Connection Level:** The MySQL database user credentials provided to the Express server should be scoped to `READ ONLY` permissions at the database level.

## Evolution & Future Roadmap
If asked, "How do we scale this for production?":
1. **Semantic Layer Integration:** Currently, the database schema is hardcoded in the system prompt. For production, we would integrate with a Semantic Layer (like dbt or Cube.js) and use RAG (Retrieval-Augmented Generation) to dynamically fetch only the relevant table schemas based on the user's question, bypassing LLM context limits.
2. **AST Parsing:** We would replace our regex-based `sqlGuard` with an Abstract Syntax Tree (AST) SQL parser to guarantee safe queries and programmatically inject tenant IDs (Row Level Security) into the `WHERE` clauses.
3. **Caching Layer:** We would implement Redis to cache query results. If two users ask for "Revenue this month", the second user gets a sub-millisecond cached response without hitting the LLM or MySQL.
