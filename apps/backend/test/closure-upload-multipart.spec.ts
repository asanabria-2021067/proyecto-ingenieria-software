import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import multer from 'multer';
import type { Server } from 'node:http';
import { CLOSURE_UPLOAD_LIMITS } from '../src/project-closure/closure-documents.controller';

/**
 * E107 se sube por HTTP con `FileInterceptor`, y toda la cobertura previa
 * llamaba a `uploadAndAttach` directamente: multer nunca se ejecutaba, así que
 * un límite mal puesto no rompía ningún test aunque dejara la carga de
 * evidencias completamente inservible en producción («Too many parts»).
 *
 * Aquí se monta multer con los límites REALES del controlador y se le manda un
 * multipart de verdad. `express`/`multer` llegan con `@nestjs/platform-express`,
 * que es justo la pieza cuya configuración se está fijando.
 */

let servidor: Server | null = null;

afterEach(() => {
  servidor?.close();
  servidor = null;
});

/** Levanta el endpoint con los límites del contrato y devuelve su URL. */
async function montarEndpoint(): Promise<string> {
  const app = express();
  const upload = multer({ limits: CLOSURE_UPLOAD_LIMITS });
  app.post(
    '/documentos',
    upload.single('file'),
    (req, res) => {
      res.json({ ok: true, ticket: (req.body as { ticket?: string }).ticket, bytes: req.file?.size ?? 0 });
    },
    (err: Error & { code?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(400).json({ error: err.message, code: err.code });
    },
  );
  const srv = app.listen(0);
  await new Promise((resolve) => srv.once('listening', resolve));
  servidor = srv;
  const { port } = srv.address() as { port: number };
  return `http://127.0.0.1:${port}/documentos`;
}

function pdf(bytes: number): Blob {
  return new Blob([Buffer.alloc(bytes)], { type: 'application/pdf' });
}

describe('E107 — límites del multipart de evidencias', () => {
  it('acepta el cuerpo del contrato: ticket + file', async () => {
    const url = await montarEndpoint();
    const form = new FormData();
    form.append('ticket', 'ticket-firmado');
    form.append('file', pdf(2048), 'evidencia.pdf');

    const res = await fetch(url, { method: 'POST', body: form });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ticket: 'ticket-firmado', bytes: 2048 });
  });

  it('rechaza una tercera parte: el contrato son exactamente dos', async () => {
    const url = await montarEndpoint();
    const form = new FormData();
    form.append('ticket', 'ticket-firmado');
    form.append('colado', 'x');
    form.append('file', pdf(2048), 'evidencia.pdf');

    const res = await fetch(url, { method: 'POST', body: form });

    expect(res.status).toBe(400);
  });

  it('rechaza un segundo archivo', async () => {
    const url = await montarEndpoint();
    const form = new FormData();
    form.append('ticket', 'ticket-firmado');
    form.append('file', pdf(1024), 'a.pdf');
    form.append('file', pdf(1024), 'b.pdf');

    const res = await fetch(url, { method: 'POST', body: form });

    expect(res.status).toBe(400);
  });

  it('`parts` cuenta una de más: debe dejar sitio a ticket, file y el corte de busboy', () => {
    // Fija la razón del valor para que nadie lo «corrija» de vuelta a 2.
    expect(CLOSURE_UPLOAD_LIMITS.fields).toBe(1);
    expect(CLOSURE_UPLOAD_LIMITS.files).toBe(1);
    expect(CLOSURE_UPLOAD_LIMITS.parts).toBe(3);
  });
});
