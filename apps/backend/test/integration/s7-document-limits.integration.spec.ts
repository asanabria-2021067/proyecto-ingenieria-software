import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import {
  cleanupClosureFixture,
  closureDocumentsStack,
  closureDraftFixture,
  pdfDeTamanoExacto,
  type ClosureCleanupScope,
} from './setup/closure-storage';
import {
  MAX_DOCUMENT_SIZE,
  MULTIPART_OVERHEAD_BYTES,
} from '../../src/project-closure/project-closure-documents.service';

async function expectStatus(status: number, fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof HttpException && error.getStatus() === status) {
      return error.getResponse();
    }
    throw new Error(
      `Se esperaba HTTP ${status} pero la operación falló con: ${
        error instanceof HttpException ? `HTTP ${error.getStatus()}` : String(error)
      }`,
    );
  }
  throw new Error(`Se esperaba HTTP ${status} pero la operación se resolvió sin error.`);
}

/**
 * C116 (06 v2 §25/§26/§47 TC01): el límite de tamaño de un documento de
 * cierre. Es inclusivo y exacto: 10485760 bytes se aceptan y 10485761 no.
 */
describeIntegration('S7 límites de documentos de cierre', () => {
  let db: PrismaClient;
  let scope: ClosureCleanupScope;

  beforeAll(async () => {
    db = createIntegrationPrismaClient();
    await db.$connect();
  });
  beforeEach(() => {
    scope = {};
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupClosureFixture(db, scope);
  });
  afterAll(async () => {
    await db.$disconnect();
  });

  it('TC01-A: un PDF de 10485760 bytes se acepta y uno de 10485761 devuelve 413 antes de subir', async () => {
    const f = await closureDraftFixture(db, scope);
    const { service, storage } = closureDocumentsStack(db);
    scope.documentIds = [];

    const reservar = async (nombre: string) => {
      const grant = await service.reserve(f.project.idProyecto, f.leader.idUsuario, {
        revisionId: f.revision.idRevisionCierre,
        nombreArchivo: nombre,
      });
      scope.documentIds!.push(grant.documentId);
      return grant;
    };
    const liberar = async (documentId: number) => {
      await db.documentoCierre.delete({ where: { idDocumentoCierre: documentId } });
      scope.documentIds = scope.documentIds!.filter((id) => id !== documentId);
    };

    // El número del contrato, sin interpretaciones.
    expect(MAX_DOCUMENT_SIZE).toBe(10485760);
    expect(MULTIPART_OVERHEAD_BYTES).toBe(65536);

    const justo = await pdfDeTamanoExacto(MAX_DOCUMENT_SIZE);
    const unoDeMas = await pdfDeTamanoExacto(MAX_DOCUMENT_SIZE + 1);
    expect(justo.length).toBe(10485760);
    expect(unoDeMas.length).toBe(10485761);

    // El permiso de carga anuncia el mismo número que el servidor aplica.
    const enElLimite = await reservar('exacto.pdf');
    expect(enElLimite.maxBytes).toBe(MAX_DOCUMENT_SIZE);

    const documento = await service.uploadAndAttach(
      f.project.idProyecto,
      f.leader.idUsuario,
      enElLimite.ticket,
      justo,
    );
    expect(documento.estadoDocumento).toBe('DISPONIBLE');
    expect(documento.tamanoBytes).toBe(MAX_DOCUMENT_SIZE);

    // El ciphertext mide EXACTAMENTE lo mismo: IV y tag van aparte, así que
    // el límite no necesita ningún margen criptográfico.
    const subido = storage.uploadImmutable.mock.calls[0][1] as Buffer;
    expect(subido.length).toBe(MAX_DOCUMENT_SIZE);
    const persistido = await db.documentoCierre.findUniqueOrThrow({
      where: { idDocumentoCierre: enElLimite.documentId },
    });
    expect(Number(persistido.tamanoCifradoBytes)).toBe(MAX_DOCUMENT_SIZE);
    const metadata = persistido.cryptoMetadata as Record<string, string>;
    expect(Buffer.from(metadata.iv, 'base64')).toHaveLength(12);
    expect(Buffer.from(metadata.tag, 'base64')).toHaveLength(16);

    const subidasTrasElLimite = storage.uploadImmutable.mock.calls.length;

    // Un byte más: 413 ANTES de contactar al proveedor.
    const excedido = await reservar('excedido.pdf');
    const respuesta = await expectStatus(413, () =>
      service.uploadAndAttach(f.project.idProyecto, f.leader.idUsuario, excedido.ticket, unoDeMas),
    );
    expect(respuesta).toMatchObject({ code: 'DOCUMENTO_DEMASIADO_GRANDE' });
    expect(storage.uploadImmutable.mock.calls.length).toBe(subidasTrasElLimite);
    expect(
      (await db.documentoCierre.findUniqueOrThrow({ where: { idDocumentoCierre: excedido.documentId } }))
        .estadoDocumento,
    ).toBe('RESERVADO');
    await liberar(excedido.documentId);

    // Cero bytes tampoco es un documento.
    const vacio = await reservar('vacio.pdf');
    await expectStatus(400, () =>
      service.uploadAndAttach(
        f.project.idProyecto,
        f.leader.idUsuario,
        vacio.ticket,
        Buffer.alloc(0),
      ),
    );
    expect(storage.uploadImmutable.mock.calls.length).toBe(subidasTrasElLimite);
    await liberar(vacio.documentId);

    // Un tamaño DECLARADO menor que los bytes reales no permite colarse: lo
    // que se mide es el buffer recibido, no lo que dijo el cliente.
    const mentiroso = await reservar('mentiroso.pdf');
    const conTamanoFalso = Object.assign(Buffer.from(unoDeMas), { size: 10 });
    await expectStatus(413, () =>
      service.uploadAndAttach(
        f.project.idProyecto,
        f.leader.idUsuario,
        mentiroso.ticket,
        conTamanoFalso,
      ),
    );
    expect(storage.uploadImmutable.mock.calls.length).toBe(subidasTrasElLimite);
    expect(
      (await db.documentoCierre.findUniqueOrThrow({ where: { idDocumentoCierre: mentiroso.documentId } }))
        .estadoDocumento,
    ).toBe('RESERVADO');
    await liberar(mentiroso.documentId);

    // Ningún exceso produjo un documento disponible ni un vínculo.
    expect(
      await db.documentoCierre.count({
        where: { idProyecto: f.project.idProyecto, estadoDocumento: 'DISPONIBLE' },
      }),
    ).toBe(1);
    expect(
      await db.documentoRevisionCierre.count({
        where: { idRevisionCierre: f.revision.idRevisionCierre },
      }),
    ).toBe(1);
  });
});
