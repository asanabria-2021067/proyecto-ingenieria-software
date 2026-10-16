import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { httpTransport } from '../src/chat/link-preview/link-preview.service';

let server: http.Server;
let port: number;
let seen: http.IncomingMessage | undefined;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    seen = req;
    if (req.url === '/slow') return; // nunca responde
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<title>ok</title>');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => {
  server.closeAllConnections();
  server.close();
});

describe('httpTransport', () => {
  it('conecta a la IP fijada aunque el hostname no exista, y envia Host y User-Agent sin cookies', async () => {
    const url = new URL(`http://pinned.invalid:${port}/`);
    const res = await httpTransport(url, { address: '127.0.0.1', family: 4 }, new AbortController().signal);
    expect(res.status).toBe(200);
    let body = '';
    for await (const c of res.body) body += c;
    expect(body).toContain('ok');
    expect(seen?.headers.host).toBe(`pinned.invalid:${port}`);
    expect(seen?.headers['user-agent']).toMatch(/LinkPreview/);
    expect(seen?.headers.cookie).toBeUndefined();
    expect(seen?.headers.authorization).toBeUndefined();
  });

  it('la senal de aborto corta una peticion colgada', async () => {
    const ctrl = new AbortController();
    const p = httpTransport(new URL(`http://pinned.invalid:${port}/slow`), { address: '127.0.0.1', family: 4 }, ctrl.signal);
    setTimeout(() => ctrl.abort(), 50);
    await expect(p).rejects.toBeDefined();
  });
});
