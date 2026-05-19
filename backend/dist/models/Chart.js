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
const ChartSchema = new mongoose_1.Schema({
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
    chartConfig: {
        xAxis: { type: String, default: '' },
        yAxis: { type: String, default: '' },
        dataKey: { type: String },
        seriesKeys: { type: [String], default: [] },
    },
    dataSnapshot: { type: mongoose_1.Schema.Types.Mixed, default: [] },
    gridPosition: {
        x: { type: Number, default: 0 },
        y: { type: Number, default: 0 },
        w: { type: Number, default: 6 },
        h: { type: Number, default: 4 },
    },
    reportIds: [{ type: mongoose_1.Schema.Types.ObjectId, ref: 'Report', default: [] }],
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
}, { timestamps: true });
exports.default = mongoose_1.default.model('Chart', ChartSchema);
