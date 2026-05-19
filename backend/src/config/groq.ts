import Groq from 'groq-sdk';

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
  groqClient = new Groq({ apiKey });
}

export default groqClient;