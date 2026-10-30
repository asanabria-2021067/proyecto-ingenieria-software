import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WebSocketGateway } from '@nestjs/websockets';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildAllowRequest, SocketIoAdapter } from '../src/common/socket-io.adapter';

const FRONTEND_URL = 'http://localhost:3000';

describe('buildAllowRequest', () => {
  const allow = (origin?: string) => {
    const cb = vi.fn();
    buildAllowRequest(FRONTEND_URL)({ headers: { origin } }, cb);
    return cb;
  };

  it('rechaza Origin ajeno', () => {
    expect(allow('https://1.2.3.4.nip.io')).toHaveBeenCalledWith(null, false);
  });

  it('acepta el origen de FRONTEND_URL', () => {
    expect(allow(FRONTEND_URL)).toHaveBeenCalledWith(null, true);
  });

  it('acepta Origin ausente', () => {
    expect(allow(undefined)).toHaveBeenCalledWith(null, true);
  });
});

describe('SocketIoAdapter - handshake real', () => {
  let port = 0;
  let close: () => Promise<void>;

  beforeAll(async () => {
    @WebSocketGateway()
    class MiniGateway {}
    @Module({ providers: [MiniGateway] })
    class MiniModule {}

    const app = await NestFactory.create(MiniModule, { logger: false });
    app.useWebSocketAdapter(new SocketIoAdapter(app, FRONTEND_URL));
    await app.listen(0, '127.0.0.1');
    port = (app.getHttpServer().address() as AddressInfo).port;
    close = () => app.close();
  });

  afterAll(() => close());

  const handshake = (origin?: string) =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = request(
        { host: '127.0.0.1', port, path: '/socket.io/?EIO=4&transport=polling', headers: origin ? { origin } : {} },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
        },
      );
      req.on('error', reject);
      req.end();
    });

  it('Origin ajeno -> 403 sin sesion', async () => {
    const res = await handshake('https://1.2.3.4.nip.io');
    expect(res.status).toBe(403);
    expect(res.body).not.toContain('sid');
  });

  it('Origin propio -> 200 con sid', async () => {
    const res = await handshake(FRONTEND_URL);
    expect(res.status).toBe(200);
    expect(res.body).toContain('sid');
  });

  it('sin Origin -> 200 con sid', async () => {
    expect((await handshake()).status).toBe(200);
  });
});
