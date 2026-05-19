# Dashboard & Report Flow

## Overview
The platform allows users to pin generated charts into reusable, shareable, and layout-persistent reports (dashboards). This feature transforms ad-hoc AI queries into structured, trackable analytics views.

## Core Concepts
- **Saved Charts:** Independent visualizations generated from the chat interface. A chart captures the SQL query, prompt, configuration, and a data snapshot.
- **Reports (Dashboards):** Collections of saved charts organized on a grid layout. Reports support sharing, layout persistence, and aggregate AI insights.

## Implementation Details

### Grid Layout System
The dashboard leverages `@eleung/react-grid-layout` (a fork/variant of `react-grid-layout`) to provide a drag-and-drop workspace.
- **Component:** `ReportGrid.tsx` and `DashboardGrid.tsx`.
- **Responsive Breakpoints:** Configured for `lg` (12 columns), `md` (10 columns), and `sm` (6 columns) with a base row height of 80px/82px.
- **State Syncing:** Layout changes (`onDragStop`, `onResizeStop`) trigger state updates that are batched and sent to the backend (`/api/reports/[id]/layout`) to persist positional data.

### Report Creation & Composition
1. **Creation:** Users create a new report via `useReports.ts` (`POST /api/reports`).
2. **Chart Attachment:** In the report edit mode (`ReportWorkspace.tsx`), users can browse their saved charts via a search picker and attach them to the report.
3. **Rendering:** The `ReportGrid` maps over attached charts, rendering each inside an `<article>` container that provides a drag handle and an options menu.
4. **Explainability:** Users can click on a chart in the report to open the `ChartExplainabilityPanel`, which slides out from the right. This panel displays the generated SQL, confidence factors, execution duration, and metric lineage.

### Refresh & Caching Flow
To avoid running expensive analytical queries on every page load, charts rely on cached `dataSnapshot`s.
- **Manual Refresh:** Users can click "Refresh" in the report toolbar, triggering `POST /api/reports/[id]/refresh`.
- **Execution:** The backend iterates through all charts in the report, re-executes their SQL against the data warehouse, and updates the `dataSnapshot` and `executionMetadata.lastRunAt`.
- **Result:** The UI displays a toast indicating how many charts successfully refreshed vs. failed.

### AI Dashboard Insights
- **Generation:** Users can generate an AI summary of the entire dashboard by clicking "Generate" in the `ReportInsights` component (`POST /api/reports/[id]/insights`).
- **Processing:** The backend aggregates the data snapshots and metadata from all charts in the report, sends them to the LLM (Llama 3.3-70b via Groq), and receives structured insights (trends, anomalies, metric highlights).
- **Display:** Insights are rendered as severity-colored cards (`success`, `warning`, `info`) at the top of the report workspace.

### Sharing & Collaboration
- Reports can be marked as `private`, `internal`, or `public`.
- **Share Tokens:** Users can generate a secure share link. The frontend appends `?shareToken=...` to the URL.
- **View Mode:** When accessed via a share token, the report is rendered in `readOnly` mode (drag/drop disabled, add/remove charts disabled, prompt editing disabled).
