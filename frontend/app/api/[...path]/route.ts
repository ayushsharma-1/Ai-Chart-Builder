const backendBaseUrl = process.env.BACKEND_API_URL || 'http://localhost:3001';

const hopByHopHeaders = new Set([
  'connection',
  'content-length',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function buildTargetUrl(request: Request, pathSegments: string[]) {
  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(`${backendBaseUrl.replace(/\/$/, '')}/api/${pathSegments.join('/')}`);
  targetUrl.search = incomingUrl.search;
  return targetUrl;
}

async function proxyRequest(request: Request, context: { params: { path?: string[] } }) {
  const pathSegments = context.params.path || [];
  const targetUrl = buildTargetUrl(request, pathSegments);

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('content-length');
  headers.delete('accept-encoding');
  headers.set('ngrok-skip-browser-warning', 'true');

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: 'manual',
    cache: 'no-store',
  });

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!hopByHopHeaders.has(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
export const OPTIONS = proxyRequest;
