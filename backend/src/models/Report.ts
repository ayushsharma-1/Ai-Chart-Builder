import mongoose, { Document, Schema } from 'mongoose';

export type ReportVisibility = 'private' | 'internal' | 'public';

export interface ReportChartRef {
  chartId: mongoose.Types.ObjectId;
  layout: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  addedAt: Date;
}

export interface IReport extends Document {
  title: string;
  description: string;
  owner: string;
  charts: ReportChartRef[];
  layout: Record<string, unknown>;
  visibility: ReportVisibility;
  share: {
    enabled: boolean;
    token?: string;
    createdAt?: Date;
    expiresAt?: Date;
  };
  aiSummary: {
    status: 'idle' | 'generating' | 'ready' | 'error';
    summary?: string;
    insights: Array<{
      id: string;
      type: 'trend' | 'anomaly' | 'change' | 'metric';
      title: string;
      detail: string;
      severity: 'info' | 'warning' | 'success';
      chartId?: mongoose.Types.ObjectId;
    }>;
    generatedAt?: Date;
    sourceHash?: string;
  };
  refreshPolicy: {
    mode: 'manual' | 'scheduled';
    intervalMinutes?: number;
    staleAfterSeconds: number;
  };
  comments: Array<{
    id: string;
    author: string;
    body: string;
    chartId?: mongoose.Types.ObjectId;
    createdAt: Date;
  }>;
  annotations: Array<{
    id: string;
    chartId: mongoose.Types.ObjectId;
    body: string;
    createdAt: Date;
  }>;
  versions: Array<{
    version: number;
    actor: string;
    reason: string;
    snapshot: Record<string, unknown>;
    createdAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const LayoutSchema = new Schema(
  {
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    w: { type: Number, default: 6 },
    h: { type: Number, default: 4 },
  },
  { _id: false },
);

const ReportSchema = new Schema<IReport>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    owner: { type: String, default: 'analytics' },
    charts: [{
      chartId: { type: Schema.Types.ObjectId, ref: 'Chart', required: true },
      layout: { type: LayoutSchema, default: () => ({}) },
      addedAt: { type: Date, default: Date.now },
    }],
    layout: { type: Schema.Types.Mixed, default: {} },
    visibility: { type: String, enum: ['private', 'internal', 'public'], default: 'private' },
    share: {
      enabled: { type: Boolean, default: false },
      token: { type: String, index: true },
      createdAt: { type: Date },
      expiresAt: { type: Date },
    },
    aiSummary: {
      status: { type: String, enum: ['idle', 'generating', 'ready', 'error'], default: 'idle' },
      summary: { type: String, default: '' },
      insights: [{
        id: { type: String, required: true },
        type: { type: String, enum: ['trend', 'anomaly', 'change', 'metric'], default: 'metric' },
        title: { type: String, required: true },
        detail: { type: String, required: true },
        severity: { type: String, enum: ['info', 'warning', 'success'], default: 'info' },
        chartId: { type: Schema.Types.ObjectId, ref: 'Chart' },
      }],
      generatedAt: { type: Date },
      sourceHash: { type: String },
    },
    refreshPolicy: {
      mode: { type: String, enum: ['manual', 'scheduled'], default: 'manual' },
      intervalMinutes: { type: Number },
      staleAfterSeconds: { type: Number, default: 300 },
    },
    comments: [{
      id: { type: String, required: true },
      author: { type: String, default: 'analytics' },
      body: { type: String, required: true },
      chartId: { type: Schema.Types.ObjectId, ref: 'Chart' },
      createdAt: { type: Date, default: Date.now },
    }],
    annotations: [{
      id: { type: String, required: true },
      chartId: { type: Schema.Types.ObjectId, ref: 'Chart', required: true },
      body: { type: String, required: true },
      createdAt: { type: Date, default: Date.now },
    }],
    versions: [{
      version: { type: Number, required: true },
      actor: { type: String, default: 'system' },
      reason: { type: String, default: 'update' },
      snapshot: { type: Schema.Types.Mixed, required: true },
      createdAt: { type: Date, default: Date.now },
    }],
  },
  { timestamps: true },
);

ReportSchema.index({ owner: 1, updatedAt: -1 });

export default mongoose.model<IReport>('Report', ReportSchema);
