"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAICall = logAICall;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const GROQ_PRICING = {
    'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
    'llama-3.1-8b-instant': { input: 0.05, output: 0.08 },
    'mixtral-8x7b-32768': { input: 0.24, output: 0.24 },
    'gemma2-9b-it': { input: 0.2, output: 0.2 },
    default: { input: 0.59, output: 0.79 },
};
function calculateCost(model, promptTokens, completionTokens) {
    const pricing = GROQ_PRICING[model] || GROQ_PRICING.default;
    const inputCostUsd = (promptTokens / 1000000) * pricing.input;
    const outputCostUsd = (completionTokens / 1000000) * pricing.output;
    return {
        inputCostUsd: parseFloat(inputCostUsd.toFixed(8)),
        outputCostUsd: parseFloat(outputCostUsd.toFixed(8)),
        totalCostUsd: parseFloat((inputCostUsd + outputCostUsd).toFixed(8)),
    };
}
const LOG_DIR = path_1.default.resolve(process.cwd(), 'logs');
function ensureLogDir() {
    if (!fs_1.default.existsSync(LOG_DIR)) {
        fs_1.default.mkdirSync(LOG_DIR, { recursive: true });
    }
}
function getLogFilePath(date) {
    return path_1.default.join(LOG_DIR, `ai-metrics-${date}.ndjson`);
}
function writeEntry(entry) {
    try {
        ensureLogDir();
        fs_1.default.appendFileSync(getLogFilePath(entry.date), `${JSON.stringify(entry)}\n`, 'utf8');
    }
    catch (error) {
        console.error('[AIMetrics] Failed to write log entry:', error?.message || error);
    }
}
function logAICall(input) {
    const now = new Date();
    const promptTokens = input.usage?.prompt_tokens || 0;
    const completionTokens = input.usage?.completion_tokens || 0;
    const totalTokens = input.usage?.total_tokens || 0;
    const entry = {
        timestamp: now.toISOString(),
        date: now.toISOString().slice(0, 10),
        callType: input.callType,
        model: input.model,
        sessionId: input.sessionId,
        userPrompt: input.userPrompt ? input.userPrompt.slice(0, 200) : undefined,
        success: input.success,
        errorMessage: input.errorMessage,
        latencyMs: input.latencyMs,
        tokens: {
            promptTokens,
            completionTokens,
            totalTokens,
        },
        cost: calculateCost(input.model, promptTokens, completionTokens),
        pipeline: input.pipeline,
    };
    writeEntry(entry);
    if (process.env.NODE_ENV !== 'production') {
        console.info(`[AI] ${entry.callType} | ${entry.model} | ${totalTokens} tokens ($${entry.cost.totalCostUsd.toFixed(6)}) | ${entry.latencyMs}ms | ${entry.success ? '✅' : '❌'}`);
    }
}
