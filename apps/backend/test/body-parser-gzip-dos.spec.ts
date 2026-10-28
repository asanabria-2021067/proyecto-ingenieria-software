import 'reflect-metadata';
import { Body, Controller, Get, Module, Post, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * GHSA-27r3-jxmh-p828 (body-parser 2.0.0 - 2.3.0): DoS sin autenticación.
 * Un cuerpo con Content-Encoding: gzip y bytes basura después del flujo gzip
 * válido podía tirar el proceso o dejar la petición colgada. Corregido en
 * body-parser 2.4.0. Esta prueba usa los parsers por defecto de Nest (que
 * delegan en body-parser) y exige 4xx, sin 5xx, sin socket colgado y sin que
 * el proceso emita uncaughtException/unhandledRejection.
 */

@Controller()
class EcoController {
  @Get('vivo')
  vivo() {
    return { ok: true };
  }

  @Post('eco')
  eco(@Body() body: unknown) {
    return { recibido: body };
  }
}

@Module({ controllers: [EcoController] })
class EcoModule {}

let app: INestApplication;
let port: number;
const fatales: unknown[] = [];
const onFatal = (err: unknown) => fatales.push(err);

beforeAll(async () => {
  process.on('uncaughtException', onFatal);
  process.on('unhandledRejection', onFatal);
  app = await NestFactory.create(EcoModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  port = (app.getHttpServer().address() as AddressInfo).port;
});

afterAll(async () => {
  process.off('uncaughtException', onFatal);
  process.off('unhandledRejection', onFatal);
  await app.close();
});

function send(method: 'GET' | 'POST', path: string, body?: Buffer, headers: Record<string, string> = {}, puerto = port) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port: puerto, method, path, headers: { ...headers, ...(body ? { 'Content-Length': String(body.length) } : {}) }, agent: false, timeout: 3000 },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() }));
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout: la peticion quedo colgada')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

const gzipHeaders = { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' };
const json = Buffer.from(JSON.stringify({ hola: 'mundo' }));

describe('body-parser: cuerpo gzip con bytes basura (GHSA-27r3-jxmh-p828)', () => {
  it('gzip valido: 201 y el cuerpo llega parseado', async () => {
    const res = await send('POST', '/eco', gzipSync(json), gzipHeaders);
    expect(res.status).toBe(201);
    expect(JSON.parse(res.body)).toEqual({ recibido: { hola: 'mundo' } });
  });

  it('gzip valido + bytes basura al final: 4xx, no 5xx ni colgado', async () => {
    const res = await send('POST', '/eco', Buffer.concat([gzipSync(json), Buffer.from('basura')]), gzipHeaders);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('gzip truncado: 4xx', async () => {
    const gz = gzipSync(json);
    const res = await send('POST', '/eco', gz.subarray(0, gz.length - 6), gzipHeaders);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('gzip invalido (no es gzip): 4xx', async () => {
    const res = await send('POST', '/eco', Buffer.from('esto no es gzip'), gzipHeaders);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  // El aviso describe un cuerpo comprimido válido con bytes finales: la app puede responder con normalidad y el
  // error del decodificador llegaba después, como excepción no capturada que terminaba el proceso.
  it.each([['deflate', deflateSync], ['br', brotliCompressSync]] as const)('%s valido + bytes finales: sin 5xx y sin excepcion no capturada posterior', async (codificacion, comprimir) => {
    const res = await send('POST', '/eco', Buffer.concat([comprimir(json), Buffer.from('basura')]), { 'Content-Type': 'application/json', 'Content-Encoding': codificacion });
    expect(res.status).toBeLessThan(500);
    await new Promise((r) => setTimeout(r, 300));
    expect(fatales).toEqual([]);
    expect((await send('GET', '/vivo')).status).toBe(200);
  });

  it('el proceso sigue vivo y sin excepciones no capturadas', async () => {
    expect((await send('GET', '/vivo')).status).toBe(200);
    const res = await send('POST', '/eco', Buffer.from(JSON.stringify({ a: 1 })), { 'Content-Type': 'application/json' });
    expect(res.status).toBe(201);
    await new Promise((r) => setTimeout(r, 100));
    expect(fatales).toEqual([]);
  });
});

/**
 * Variante que sí tumba body-parser 2.3.0: con `verify` (lo que activa rawBody en Nest), un charset utf-* no
 * soportado y Content-Encoding con cuerpo inválido, 2.3.0 respondía 415 y dejaba el decodificador sin listener
 * de error (uncaughtException Z_DATA_ERROR). 2.4.0 valida el charset antes de crear el flujo de descompresión.
 * La app actual no usa rawBody, pero la prueba fija el comportamiento correcto del parser.
 */
describe('body-parser con rawBody: charset no soportado + cuerpo comprimido inválido', () => {
  let appRaw: INestApplication;
  let portRaw: number;

  beforeAll(async () => {
    appRaw = await NestFactory.create(EcoModule, { logger: false, rawBody: true });
    await appRaw.listen(0, '127.0.0.1');
    portRaw = (appRaw.getHttpServer().address() as AddressInfo).port;
  });

  afterAll(async () => {
    await appRaw.close();
  });

  it('responde 4xx y el proceso no emite excepciones no capturadas', async () => {
    const antes = fatales.length;
    const res = await send('POST', '/eco', Buffer.from('no es gzip'), { 'Content-Type': 'application/json; charset=utf-bogus', 'Content-Encoding': 'gzip' }, portRaw);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    await new Promise((r) => setTimeout(r, 300));
    expect(fatales.slice(antes)).toEqual([]);
    expect((await send('GET', '/vivo', undefined, {}, portRaw)).status).toBe(200);
  });
});
