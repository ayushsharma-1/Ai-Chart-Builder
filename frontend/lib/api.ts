import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002',
  timeout: 40000,
});

function readBrowserContext() {
  if (typeof window === 'undefined') {
    return {};
  }

  let accountId: string | null = null;
  let sessionId: string | null = null;

  try {
    const storedAccountId = window.localStorage.getItem('lens_account_id');
    accountId = storedAccountId && /^\d+$/.test(storedAccountId) ? storedAccountId : null;
  } catch {
    accountId = null;
  }

  try {
    const storedState = window.localStorage.getItem('lens.chat.state.v2');
    if (storedState) {
      const parsed = JSON.parse(storedState) as { activeSessionId?: string | null };
      sessionId = parsed.activeSessionId || null;
    }
  } catch {
    sessionId = null;
  }

  return { accountId, sessionId };
}

api.interceptors.request.use((config) => {
  const { accountId, sessionId } = readBrowserContext();
  const headers = config.headers as Record<string, string> | undefined;

  if (headers) {
    if (accountId) {
      headers['x-lens-account-id'] = accountId;
    }

    if (sessionId) {
      headers['x-lens-session-id'] = sessionId;
    }
  }

  return config;
});

export default api;