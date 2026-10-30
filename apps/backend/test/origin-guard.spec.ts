import 'reflect-metadata';
import { Body, Controller, Module, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { isAllowedOrigin, originGuard } from '../src/common/origin-guard';

const FRONTEND_URL = 'http://localhost:3000';

function run(method: string, headers: Record<string, string> = {}) {
  const json = vi.fn();
  const res = { status: vi.fn(() => ({ json })) };
  const next = vi.fn();
  originGuard(FRONTEND_URL)({ method, headers } as any, res as any, next);
  return { next, status: res.status, json };
}

describe('isAllowedOrigin', () => {
  it('acepta ausente y el origen propio, rechaza "null", ajenos e invalidos', () => {
    expect(isAllowedOrigin(undefined, FRONTEND_URL)).toBe(true);
    expect(isAllowedOrigin('http://localhost:3000', FRONTEND_URL)).toBe(true);
    expect(isAllowedOrigin('null', FRONTEND_URL)).toBe(false);
    expect(isAllowedOrigin('https://1.2.3.4.nip.io', FRONTEND_URL)).toBe(false);
    expect(isAllowedOrigin('no es una url', FRONTEND_URL)).toBe(false);
  });
});

describe('originGuard', () => {
  it('POST con Origin ajeno -> 403', () => {
    const r = run('POST', { origin: 'https://1.2.3.4.nip.io', 'content-type': 'application/json' });
    expect(r.status).toHaveBeenCalledWith(403);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(r.next).not.toHaveBeenCalled();
  });

  it('POST con Origin "null" -> 403', () => {
    expect(run('POST', { origin: 'null' }).status).toHaveBeenCalledWith(403);
  });

  it.each(['same-site', 'cross-site'])('POST sin Origin con Sec-Fetch-Site %s -> 403', (site) => {
    const r = run('POST', { 'sec-fetch-site': site });
    expect(r.status).toHaveBeenCalledWith(403);
    expect(r.next).not.toHaveBeenCalled();
  });

  it('POST desde FRONTEND_URL -> next()', () => {
    const r = run('POST', { origin: FRONTEND_URL, 'sec-fetch-site': 'same-origin' });
    expect(r.next).toHaveBeenCalled();
    expect(r.status).not.toHaveBeenCalled();
  });

  it('POST sin Origin ni Sec-Fetch-Site -> next()', () => {
    expect(run('POST', { 'content-type': 'application/json', 'content-length': '2' }).next).toHaveBeenCalled();
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])('%s con Origin ajeno -> next()', (method) => {
    const r = run(method, { origin: 'https://evil.example' });
    expect(r.next).toHaveBeenCalled();
    expect(r.status).not.toHaveBeenCalled();
  });

  it.each(['application/x-www-form-urlencoded', 'text/plain'])('POST %s con cuerpo -> 415', (type) => {
    const r = run('POST', { origin: FRONTEND_URL, 'content-type': type, 'content-length': '5' });
    expect(r.status).toHaveBeenCalledWith(415);
    expect(r.next).not.toHaveBeenCalled();
  });

  it('POST con transfer-encoding y text/plain -> 415', () => {
    expect(run('POST', { 'content-type': 'text/plain', 'transfer-encoding': 'chunked' }).status).toHaveBeenCalledWith(415);
  });

  it('POST sin cuerpo y sin content-type -> next()', () => {
    expect(run('POST', { origin: FRONTEND_URL }).next).toHaveBeenCalled();
  });

  it.each(['multipart/form-data; boundary=x', 'application/json; charset=utf-8'])('POST %s con cuerpo -> next()', (type) => {
    expect(run('POST', { origin: FRONTEND_URL, 'content-type': type, 'content-length': '10' }).next).toHaveBeenCalled();
  });
});

describe('originGuard sobre HTTP real (antes de los parsers de Nest)', () => {
  let url = '';
  let close: () => Promise<void>;

  beforeAll(async () => {
    @Controller()
    class EcoController {
      @Post('eco')
      eco(@Body() body: unknown) {
        return { body };
      }
    }
    @Module({ controllers: [EcoController] })
    class EcoModule {}

    const app = await NestFactory.create(EcoModule, { logger: false });
    app.setGlobalPrefix('api');
    app.use(originGuard(FRONTEND_URL));
    await app.listen(0, '127.0.0.1');
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/eco`;
    close = () => app.close();
  });

  afterAll(() => close());

  const post = (headers: Record<string, string>, body = '{"a":1}') => fetch(url, { method: 'POST', headers, body });

  it('Origin ajeno con JSON -> 403', async () => {
    const res = await post({ origin: 'https://1.2.3.4.nip.io', 'content-type': 'application/json' });
    expect(res.status).toBe(403);
  });

  it('Origin "null" -> 403', async () => {
    const res = await post({ origin: 'null', 'content-type': 'application/json' });
    expect(res.status).toBe(403);
  });

  it('FRONTEND_URL con JSON -> 201 y el cuerpo llega parseado', async () => {
    const res = await post({ origin: FRONTEND_URL, 'content-type': 'application/json' });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ body: { a: 1 } });
  });

  it('JSON sin Origin -> 201', async () => {
    const res = await post({ 'content-type': 'application/json' });
    expect(res.status).toBe(201);
  });

  it('x-www-form-urlencoded con cuerpo -> 415 aun desde el origen propio', async () => {
    const res = await post({ origin: FRONTEND_URL, 'content-type': 'application/x-www-form-urlencoded' }, 'a=1');
    expect(res.status).toBe(415);
  });
});
