import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import multer from 'multer';
import type { Server } from 'node:http';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ADJUNTO_MAX_BYTES,
  detectarMime,
  sanitizarNombre,
  validarAdjunto,
} from '../src/chat/chat-adjuntos';
import { CHAT_UPLOAD_LIMITS } from '../src/chat/chat.controller';
import { CloudinaryChatStorageAdapter } from '../src/storage/cloudinary-chat-storage.adapter';

const PDF = 'application/pdf';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

const pdf = (total = 100) => Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(total - 9)]);
const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const ooxml = (...raices: string[]) =>
  Buffer.from(['PK\x03\x04', '[Content_Types].xml', ...raices].join('\0'), 'latin1');

describe('detectarMime (magic bytes)', () => {
  it.each([
    ['image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])],
    ['image/png', png()],
    ['image/gif', Buffer.from('GIF89a....')],
    ['image/gif', Buffer.from('GIF87a....')],
    ['image/webp', Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')])],
    [PDF, pdf()],
    [DOCX, ooxml('word/document.xml')],
    [XLSX, ooxml('xl/workbook.xml')],
    [PPTX, ooxml('ppt/presentation.xml')],
  ])('reconoce %s', (mime, buf) => {
    expect(detectarMime(buf)).toBe(mime);
  });

  it.each([
    ['ejecutable', Buffer.from('MZ\x90\x00')],
    ['html', Buffer.from('<html><script>alert(1)</script>')],
    ['vacio', Buffer.alloc(0)],
    ['RIFF que no es webp', Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt ')])],
    ['zip generico', Buffer.from('PK\x03\x04archivo.txt')],
    ['zip sin raiz office', ooxml()],
    ['zip con dos raices office', ooxml('word/document.xml', 'xl/workbook.xml')],
  ])('rechaza %s', (_n, buf) => {
    expect(detectarMime(buf)).toBeNull();
  });
});

describe('sanitizarNombre', () => {
  it.each([
    ['../../etc/passwd', 'passwd'],
    ['C:\\Users\\x\\informe.pdf', 'informe.pdf'],
    ['a\u0000b\u001f.png', 'ab.png'],
    ['.htaccess', 'htaccess'],
    ['  muchos   espacios .pdf', 'muchos espacios .pdf'],
    ['<img>:"|?*.png', 'img.png'],
    ['evil\u202Egnp.exe', 'evilgnp.exe'],
    ['', 'archivo'],
    ['...', 'archivo'],
  ])('%j -> %j', (entrada, esperado) => {
    expect(sanitizarNombre(entrada)).toBe(esperado);
  });

  it('recupera UTF-8 que multer decodifico como latin1', () => {
    const mal = Buffer.from('Reseña.pdf', 'utf8').toString('latin1');
    expect(sanitizarNombre(mal)).toBe('Reseña.pdf');
  });

  it('acota el largo conservando la extension', () => {
    const largo = `${'a'.repeat(300)}.pdf`;
    const res = sanitizarNombre(largo);
    expect(res).toHaveLength(120);
    expect(res.endsWith('.pdf')).toBe(true);
  });
});

describe('validarAdjunto', () => {
  const ok = { buffer: pdf(), mimetype: PDF, originalname: 'Informe.PDF' };

  it('acepta un PDF coherente y normaliza el nombre', () => {
    expect(validarAdjunto(ok)).toEqual({ mime: PDF, nombre: 'Informe.PDF' });
  });

  it('acepta justo 10 MB y rechaza 10 MB + 1', () => {
    expect(validarAdjunto({ ...ok, buffer: pdf(ADJUNTO_MAX_BYTES) }).mime).toBe(PDF);
    expect(() => validarAdjunto({ ...ok, buffer: pdf(ADJUNTO_MAX_BYTES + 1) })).toThrow(/10 MB/);
  });

  it('rechaza archivo vacio', () => {
    expect(() => validarAdjunto({ ...ok, buffer: Buffer.alloc(0) })).toThrow(BadRequestException);
  });

  it('rechaza contenido fuera de la lista blanca', () => {
    expect(() =>
      validarAdjunto({ buffer: Buffer.from('<html>'), mimetype: 'text/html', originalname: 'a.html' }),
    ).toThrow(/no permitido/);
  });

  it('rechaza MIME declarado distinto al contenido', () => {
    expect(() => validarAdjunto({ buffer: png(), mimetype: PDF, originalname: 'a.png' })).toThrow(/declarado/);
  });

  it('rechaza extension distinta al contenido', () => {
    expect(() => validarAdjunto({ buffer: png(), mimetype: 'image/png', originalname: 'a.pdf' })).toThrow(
      /extensión/,
    );
    expect(() => validarAdjunto({ buffer: png(), mimetype: 'image/png', originalname: 'sinextension' })).toThrow(
      /extensión/,
    );
  });

  it('un nombre malicioso se reduce al nombre base', () => {
    expect(
      validarAdjunto({ buffer: png(), mimetype: 'image/png', originalname: '../../x/\u0000foto.PNG' }).nombre,
    ).toBe('foto.PNG');
  });
});

describe('limite real de multer (CHAT_UPLOAD_LIMITS)', () => {
  let servidor: Server | null = null;
  afterEach(() => {
    servidor?.close();
    servidor = null;
  });

  async function montar(): Promise<string> {
    const app = express();
    app.post(
      '/f',
      multer({ limits: CHAT_UPLOAD_LIMITS }).single('file'),
      (req, res) => res.json({ bytes: req.file?.size ?? 0, contenido: (req.body as { contenido?: string }).contenido }),
      (err: Error & { code?: string }, _req: express.Request, res: express.Response, _n: express.NextFunction) => {
        res.status(413).json({ code: err.code });
      },
    );
    const srv = app.listen(0);
    await new Promise((r) => srv.once('listening', r));
    servidor = srv;
    return `http://127.0.0.1:${(srv.address() as { port: number }).port}/f`;
  }

  const enviar = (url: string, bytes: number, extra?: Record<string, string>) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(extra ?? {})) form.append(k, v);
    form.append('file', new Blob([Buffer.alloc(bytes)]), 'a.pdf');
    return fetch(url, { method: 'POST', body: form });
  };

  it('acepta justo 10 MB con texto (archivo + contenido)', async () => {
    const res = await enviar(await montar(), ADJUNTO_MAX_BYTES, { contenido: 'hola' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ bytes: ADJUNTO_MAX_BYTES, contenido: 'hola' });
  });

  it('rechaza 10 MB + 1', async () => {
    const res = await enviar(await montar(), ADJUNTO_MAX_BYTES + 1);
    expect(res.status).toBe(413);
    expect((await res.json()).code).toBe('LIMIT_FILE_SIZE');
  });

  it('rechaza un segundo archivo', async () => {
    const form = new FormData();
    form.append('file', new Blob([Buffer.alloc(10)]), 'a.pdf');
    form.append('file', new Blob([Buffer.alloc(10)]), 'b.pdf');
    const res = await fetch(await montar(), { method: 'POST', body: form });
    expect(res.status).toBe(413);
  });
});

describe('CloudinaryChatStorageAdapter sin configuracion', () => {
  const adapter = new CloudinaryChatStorageAdapter(new ConfigService({}));

  it('falla con error claro solo al usarlo', async () => {
    await expect(adapter.upload('chat/1/x.pdf', pdf())).rejects.toThrow(ServiceUnavailableException);
    await expect(adapter.signedUrl('chat/1/x.pdf', 60)).rejects.toThrow(/no está configurado/);
    await expect(adapter.destroy('chat/1/x.pdf')).rejects.toThrow(ServiceUnavailableException);
  });
});
