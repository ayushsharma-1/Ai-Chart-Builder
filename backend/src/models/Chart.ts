import mongoose, { Document, Schema } from 'mongoose';

export interface IChart extends Document {
  title: string;
  prompt: string;
  sql: string;
  reasoning?: string;
  aiExplanation?: string;
  queryConfidence?: {
    score: number;
    factors: string[];
  };
  metricLineage?: Array<{
    metricId: string;
    name: string;
    description: string;
    matchedBy: string[];
  }>;
  chartType: 'bar' | 'line' | 'pie' | 'table';
  chartOverrideReason?: string;
  chartConfidence?: 'high' | 'medium' | 'low';
  chartConfig: {
    xAxis: string;
    yAxis: string;
    dataKey?: string;
    seriesKeys?: string[];
  };
  dataSnapshot: unknown[];
  gridPosition: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  reportIds: mongoose.Types.ObjectId[];
  executionMetadata?: {
    rowCount?: number;
    queryDurationMs?: number;
    lastRunAt?: Date;
    cacheStatus?: 'miss' | 'hit' | 'stale';
  };
  comments: Array<{
    id: string;
    author: string;
    content: string;
    createdAt: Date;
    resolved: boolean;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const ChartSchema = new Schema<IChart>(
  {
    title: { type: String, required: true },
    prompt: { type: String, required: true },
    sql: { type: String, required: true },
    reasoning: { type: String, default: '' },
    aiExplanation: { type: String, default: '' },
    queryConfidence: {
      score: { type: Number, default: 0 },
      factors: { type: [String], default: [] },
    },
    metricLineage: [{
      metricId: { type: String, required: true },
      name: { type: String, required: true },
      description: { type: String, default: '' },
      matchedBy: { type: [String], default: [] },
    }],
    chartType: { type: String, enum: ['bar', 'line', 'pie', 'table'], default: 'bar' },
    chartOverrideReason: { type: String },
    chartConfidence: { type: String, enum: ['high', 'medium', 'low'] },
    chartConfig: {
      xAxis: { type: String, default: '' },
      yAxis: { type: String, default: '' },
      dataKey: { type: String },
      seriesKeys: { type: [String], default: [] },
    },
    dataSnapshot: { type: Schema.Types.Mixed, default: [] },
    gridPosition: {
      x: { type: Number, default: 0 },
      y: { type: Number, default: 0 },
      w: { type: Number, default: 6 },
      h: { type: Number, default: 4 },
    },
    reportIds: [{ type: Schema.Types.ObjectId, ref: 'Report', default: [] }],
    executionMetadata: {
      rowCount: { type: Number },
      queryDurationMs: { type: Number },
      lastRunAt: { type: Date },
      cacheStatus: { type: String, enum: ['miss', 'hit', 'stale'] },
    },
    comments: [{
      id: { type: String, required: true },
      author: { type: String, default: 'Analyst' },
      content: { type: String, required: true },
      createdAt: { type: Date, default: Date.now },
      resolved: { type: Boolean, default: false },
    }],
  },
  { timestamps: true },
);

export default mongoose.model<IChart>('Chart', ChartSchema);
