export type ChartType = 'bar' | 'line' | 'pie' | 'table';

export interface ChartConfig {
  xAxis: string;
  yAxis: string;
  dataKey?: string;
  seriesKeys?: string[];
}

export interface ChartResult {
  title: string;
  chartType: ChartType;
  chartConfig: ChartConfig;
  data: any[];
  rowCount: number;
  executionTimeMs: number;
  sql: string;
  reasoning?: string;
  aiExplanation?: string;
  queryConfidence?: ChartQueryConfidence;
  metricLineage?: ChartMetricLineage[];
  prompt?: string;
  executionMetadata?: ChartExecutionMetadata;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  chartResult?: ChartResult;
  timestamp: Date;
  status?: 'loading' | 'done' | 'error';
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

export interface SavedChart {
  _id: string;
  title: string;
  prompt: string;
  sql: string;
  reasoning?: string;
  aiExplanation?: string;
  queryConfidence?: ChartQueryConfidence;
  metricLineage?: ChartMetricLineage[];
  chartType: ChartType;
  chartConfig: ChartConfig;
  dataSnapshot: any[];
  gridPosition: { x: number; y: number; w: number; h: number };
  reportLayout?: { x: number; y: number; w: number; h: number };
  reportIds?: string[];
  executionMetadata?: ChartExecutionMetadata;
  createdAt: string;
  updatedAt?: string;
}

export interface ChartExecutionMetadata {
  rowCount?: number;
  queryDurationMs?: number;
  lastRunAt?: string;
  cacheStatus?: 'miss' | 'hit' | 'stale';
}

export interface ChartQueryConfidence {
  score: number;
  factors: string[];
}

export interface ChartMetricLineage {
  metricId: string;
  name: string;
  description: string;
  matchedBy: string[];
}

export type ReportVisibility = 'private' | 'internal' | 'public';

export interface ReportInsight {
  id: string;
  type: 'trend' | 'anomaly' | 'change' | 'metric';
  title: string;
  detail: string;
  severity: 'info' | 'warning' | 'success';
  chartId?: string;
}

export interface ReportComment {
  id: string;
  author: string;
  body: string;
  chartId?: string;
  createdAt: string;
}

export interface ReportVersion {
  version: number;
  actor: string;
  reason: string;
  createdAt: string;
}

export interface Report {
  _id: string;
  title: string;
  description: string;
  owner: string;
  charts: SavedChart[];
  layout: Record<string, unknown>;
  visibility: ReportVisibility;
  share: {
    enabled: boolean;
    token?: string;
    createdAt?: string;
    expiresAt?: string;
  };
  aiSummary: {
    status: 'idle' | 'generating' | 'ready' | 'error';
    summary?: string;
    insights: ReportInsight[];
    generatedAt?: string;
    sourceHash?: string;
  };
  refreshPolicy: {
    mode: 'manual' | 'scheduled';
    intervalMinutes?: number;
    staleAfterSeconds: number;
  };
  comments: ReportComment[];
  annotations: Array<{ id: string; chartId: string; body: string; createdAt: string }>;
  versions: ReportVersion[];
  access?: {
    mode: 'view' | 'edit';
    source: 'internal' | 'share';
    canEdit: boolean;
    canShare: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ReportRefreshResult {
  chartId: string;
  title: string;
  success: boolean;
  message?: string;
}
