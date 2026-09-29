import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { CLIENT_IP_HEADERS, POST, buildUpstreamHeaders } from '../app/api/[...path]/route';

/**
 * G04-C14 · OWASP25-C021. El proxy same-origin de Next (app/api/[...path])
 * no reenvía al backend metadatos de IP controlados por el cliente: con
 * TRUST_PROXY_HOPS=1 un X-Forwarded-For atacante elegiría el cubo de rate
 * limiting. Cookies, autorización y el resto de cabeceras siguen pasando.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function attackerRequest() {
  return new NextRequest('http://localhost:3000/api/auth/login?x=1', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: 'access_token=abc',
      authorization: 'Bearer token-legitimo',
      'x-forwarded-for': '203.0.113.99',
      'x-real-ip': '203.0.113.98',
      forwarded: 'for=203.0.113.97',
      'true-client-ip': '203.0.113.96',
      'cf-connecting-ip': '203.0.113.95',
      'x-client-ip': '203.0.113.94',
    },
    body: JSON.stringify({ correo: 'a@uvg.edu.gt', contrasena: 'x' }),
  });
}

describe('G04-C14: el proxy Next no reenvía X-Forwarded-For del cliente', () => {
  it('una petición con XFF atacante llega al backend sin ninguna cabecera de IP de cliente', async () => {
    const upstream = vi.fn().mockResolvedValue(new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', upstream);

    const response = await POST(attackerRequest(), { params: Promise.resolve({ path: ['auth', 'login'] }) });

    expect(response.status).toBe(201);
    const [url, init] = upstream.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/auth\/login\?x=1$/);
    const sent = new Headers(init.headers);
    for (const name of CLIENT_IP_HEADERS) {
      expect(sent.has(name), name).toBe(false);
    }
    expect(JSON.stringify([...sent.entries()])).not.toContain('203.0.113.');
    // Lo necesario para la petición legítima se conserva.
    expect(sent.get('cookie')).toBe('access_token=abc');
    expect(sent.get('authorization')).toBe('Bearer token-legitimo');
    expect(sent.get('content-type')).toBe('application/json');
  });

  it('buildUpstreamHeaders también descarta host y connection y no inventa una IP propia', () => {
    const sent = buildUpstreamHeaders(
      new Headers({ host: 'evil.example', connection: 'keep-alive', 'X-Forwarded-For': '203.0.113.1', accept: 'application/json' }),
    );
    expect([...sent.keys()]).toEqual(['accept']);
  });

  it('la lista cubre las variantes habituales de IP de cliente', () => {
    expect([...CLIENT_IP_HEADERS].sort()).toEqual(
      ['cf-connecting-ip', 'forwarded', 'true-client-ip', 'x-client-ip', 'x-forwarded-for', 'x-real-ip'].sort(),
    );
  });
});
