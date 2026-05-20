"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const LayoutSchema = new mongoose_1.Schema({
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    w: { type: Number, default: 6 },
    h: { type: Number, default: 4 },
}, { _id: false });
const ReportSchema = new mongoose_1.Schema({
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    owner: { type: String, default: 'analytics' },
    charts: [{
            chartId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Chart', required: true },
            layout: { type: LayoutSchema, default: () => ({}) },
            addedAt: { type: Date, default: Date.now },
        }],
    layout: { type: mongoose_1.Schema.Types.Mixed, default: {} },
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
                chartId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Chart' },
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
            chartId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Chart' },
            createdAt: { type: Date, default: Date.now },
        }],
    annotations: [{
            id: { type: String, required: true },
            chartId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Chart', required: true },
            body: { type: String, required: true },
            createdAt: { type: Date, default: Date.now },
        }],
    versions: [{
            version: { type: Number, required: true },
            actor: { type: String, default: 'system' },
            reason: { type: String, default: 'update' },
            snapshot: { type: mongoose_1.Schema.Types.Mixed, required: true },
            createdAt: { type: Date, default: Date.now },
        }],
}, { timestamps: true });
ReportSchema.index({ owner: 1, updatedAt: -1 });
exports.default = mongoose_1.default.model('Report', ReportSchema);
