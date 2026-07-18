import Portkey from 'portkey-ai';
import Groq from 'groq-sdk';

const apiKey = process.env.GROQ_API_KEY;
const portkeyApiKey = process.env.PORTKEY_API_KEY;

let groqClient: any;

if (portkeyApiKey) {
  groqClient = new Portkey({
    apiKey: portkeyApiKey
  });
} else if (apiKey) {
  groqClient = new Groq({ apiKey });
} else {
  // In local development we allow the server to run without a Groq API key.
  console.warn('API keys not configured — LLM client will be mocked for local dev');

  groqClient = {
    chat: {
      completions: {
        create: async () => {
          throw new Error('API key is not configured. Set GROQ_API_KEY or PORTKEY_API_KEY in backend/.env to enable LLM calls.');
        },
      },
    },
  } as unknown as Groq;
}

export default groqClient;