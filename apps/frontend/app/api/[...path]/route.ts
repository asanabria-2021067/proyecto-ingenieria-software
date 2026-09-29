import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

const BACKEND_URL =
  process.env.API_URL_INTERNAL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:3001';

/**
 * G04 (OWASP25-C021): metadatos de IP de cliente que este proxy NO reenvía.
 * Vienen del navegador (o de quien llame directo al puerto del frontend) y
 * el backend, con TRUST_PROXY_HOPS=1, tomaría el último X-Forwarded-For como
 * la IP real: reenviarlos dejaría al cliente elegir su cubo de rate limiting.
 * Sin ellos, el backend ve la dirección de este servidor Next, que nadie de
 * afuera puede falsificar.
 */
export const CLIENT_IP_HEADERS = [
  'x-forwarded-for',
  'x-real-ip',
  'forwarded',
  'true-client-ip',
  'cf-connecting-ip',
  'x-client-ip',
] as const;

export function buildUpstreamHeaders(incoming: Headers): Headers {
  const headers = new Headers(incoming);
  headers.delete('host');
  headers.delete('connection');
  for (const name of CLIENT_IP_HEADERS) {
    headers.delete(name);
  }
  return headers;
}

function buildBackendUrl(path: string[], search: string) {
  const baseUrl = BACKEND_URL.replace(/\/$/, '');
  const apiPath = path.map((segment) => encodeURIComponent(segment)).join('/');
  return `${baseUrl}/api/${apiPath}${search}`;
}

async function proxyRequest(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const headers = buildUpstreamHeaders(request.headers);

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const body = hasBody ? await request.arrayBuffer() : undefined;
  const upstream = await fetch(buildBackendUrl(path, request.nextUrl.search), {
    method: request.method,
    headers,
    body,
    cache: 'no-store',
    redirect: 'manual',
  });

  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('content-length');

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
export const OPTIONS = proxyRequest;
