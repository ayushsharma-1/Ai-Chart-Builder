"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const groq_sdk_1 = __importDefault(require("groq-sdk"));
const apiKey = process.env.GROQ_API_KEY;
let groqClient;
if (!apiKey) {
    // In local development we allow the server to run without a Groq API key.
    // The services that call Groq will receive a clear runtime error if used.
    console.warn('GROQ_API_KEY is not configured — Groq client will be mocked for local dev');
    groqClient = {
        chat: {
            completions: {
                create: async () => {
                    throw new Error('GROQ_API_KEY is not configured. Set GROQ_API_KEY in backend/.env to enable LLM calls.');
                },
            },
        },
    };
}
else {
    groqClient = new groq_sdk_1.default({ apiKey });
}
exports.default = groqClient;
