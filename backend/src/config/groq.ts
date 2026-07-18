import Groq from 'groq-sdk';
import { PORTKEY_GATEWAY_URL, createHeaders } from 'portkey-ai';

const apiKey = process.env.GROQ_API_KEY;

let groqClient: any;

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
  } as unknown as Groq;
} else {
  const portkeyApiKey = process.env.PORTKEY_API_KEY;
  if (portkeyApiKey) {
    groqClient = new Groq({
      apiKey,
      baseURL: PORTKEY_GATEWAY_URL,
      defaultHeaders: createHeaders({
        provider: 'groq',
        apiKey: portkeyApiKey,
        metadata: {
          environment: process.env.NODE_ENV || 'development'
        },
        retry: {
          attempts: 3
        }
      })
    });
  } else {
    groqClient = new Groq({ apiKey });
  }
}

export default groqClient;