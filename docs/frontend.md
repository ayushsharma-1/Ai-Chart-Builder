# Frontend Implementation & State Management

## Overview
The frontend is a Next.js (App Router) application built with React and Tailwind CSS. It provides a chat-based interface for querying analytics data and a dashboard interface for saving, organizing, and viewing generated charts.

## Core Technologies
- **Framework:** Next.js (App Router)
- **Styling:** Tailwind CSS, `globals.css` with CSS variables for a dark, glowing aesthetic (`--bg`, `--surface`, `--accent`).
- **Charts:** `recharts` for responsive SVG charts (Bar, Line, Pie).
- **Dashboard Layout:** `@eleung/react-grid-layout` for draggable and resizable dashboard grids.
- **State Management:** React Hooks (`useState`, `useEffect`, `useCallback`, `useMemo`) combined with `localStorage` for chat persistence and custom hooks (`useQuery`, `useCharts`, `useReports`) wrapping Axios API calls.
- **Icons:** `lucide-react`.

## Directory Structure
- `app/`: Next.js pages and routing (`layout.tsx`, `chat/page.tsx`, `charts/page.tsx`, `dashboard/page.tsx`, `report/[id]/page.tsx`).
- `components/`: Modular React components.
  - `chart/`: Rendering specific charts (`BarChartView.tsx`, `LineChartView.tsx`, `PieChartView.tsx`, `TableView.tsx`, `ChartRenderer.tsx`).
  - `chat/`: Chat interface components (`ChatPanel.tsx`, `MessageBubble.tsx`, `InlineChartCard.tsx`, `SuggestedPrompts.tsx`).
  - `dashboard/`: Dashboard rendering (`DashboardGrid.tsx`, `DashboardCard.tsx`).
  - `reports/`: Report workspace, grids, and explainability (`ReportWorkspace.tsx`, `ReportGrid.tsx`, `ChartExplainabilityPanel.tsx`).
  - `ui/`: Reusable UI elements (`Navbar.tsx`, `Sidebar.tsx`, `EmptyState.tsx`, `LoadingSpinner.tsx`).
- `hooks/`: Custom hooks for state management and API integration (`useQuery.ts`, `useCharts.ts`, `useReports.ts`).
- `lib/`: Utilities (`api.ts`, `chartUtils.ts`).
- `types/`: Shared TypeScript interfaces.

## State Management

### Chat State (`useQuery.ts`)
- Manages chat sessions, messages, and the currently active session.
- **Persistence:** Synchronizes chat state with `localStorage` using the key `lens.chat.state.v2`. It handles hydration on the client side to avoid SSR mismatches.
- **Session Handling:** Allows creating new chats, selecting previous chats, and deleting chats.
- **Message Flow:** Appends a user message and a placeholder loading message. Sends the prompt to `/api/query` via Axios. On success, replaces the loading message with the finalized text and `ChartResult`. On failure, displays an error message.
- **Context Injection:** When sending a prompt, it includes context from the currently visible chart (previous prompt, title, SQL, and type) to allow the LLM to perform iterative refinement.

### Chart State (`useCharts.ts`)
- Manages the user's saved charts (`savedCharts` state).
- **CRUD Operations:** `fetchCharts`, `saveChart`, `deleteChart`, `updatePosition`.
- When a chart is saved, it captures the complete `ChartResult` state, including execution metadata, snapshot data, and AI explanations, ensuring the dashboard can render instantly without re-executing the SQL.

### Report State (`useReports.ts` & `useReport.ts`)
- `useReports`: Fetches the list of all reports and handles creating/duplicating/deleting reports.
- `useReport`: Manages the state of a single report workspace. Handles adding/removing charts to the report layout, updating positions, triggering report-wide data refreshes (`refresh`), and generating AI insights for the report (`generateInsights`).

## Chart Rendering & Analytics (`chartUtils.ts` & `ChartRenderer.tsx`)
- **Data Inference:** `inferChartDataset` analyzes the incoming dataset (rows) to determine valid metrics, optimal chart type, and whether dual Y-axes are needed.
- **Formatting:** `formatCompactNumber` and `formatTooltipValue` intelligently format values (e.g., currency, thousands/millions abbreviations, percentages).
- **Responsive Sizing:** Charts compute dynamic widths (`calculateAxisWidths`) and adjust legends/tick rotation based on window resize events to maintain readability on mobile and desktop.
- **Explainability:** `ChartExplainabilityPanel.tsx` exposes the AI's generated SQL, confidence score, metric lineage, and reasoning for transparency. It allows users to manually tweak the prompt and regenerate the chart.

## Component Interactions
1. **User asks a question** in `ChatPanel`.
2. `useQuery` sends the request to the backend.
3. The response creates an `InlineChartCard` within the chat stream.
4. `InlineChartCard` uses `ChartRenderer` to render the data dynamically.
5. The user can toggle chart types via `ChartTypeSwitcher` or save the chart to their dashboard.
6. The dashboard (`DashboardPage`, `ReportWorkspace`) uses `react-grid-layout` to render saved charts in an editable grid.
