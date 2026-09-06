import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import { useSecondClient } from './setup/concurrency';
import {
  cleanupClosureFixture,
  closureDocumentsStack,
  closureDraftFixture,
  pdfFixture,
  type ClosureCleanupScope,
} from './setup/closure-storage';
import { MAX_DOCUMENT_SIZE } from '../../src/project-closure/project-closure-documents.service';

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

describeIntegration('S7 seguridad del almacenamiento de cierre', () => {
  let db: PrismaClient;
  let scope: ClosureCleanupScope;
  const second = useSecondClient();

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

  it('T30-A: un ticket consumido no puede reutilizarse y el reintento del mismo actor es idempotente sin volver a subir', async () => {
    const f = await closureDraftFixture(db, scope);
    const { service, tickets, storage } = closureDocumentsStack(db);
    const pdf = pdfFixture();

    // La reserva entrega un permiso de aplicación, no una firma del proveedor.
    const grant = await service.reserve(f.project.idProyecto, f.leader.idUsuario, {
      revisionId: f.revision.idRevisionCierre,
      nombreArchivo: 'evidencia final.pdf',
    });
    scope.documentIds = [grant.documentId];
    expect(grant.documentId).toBeGreaterThan(0);
    expect(grant.uploadUrl).toBe(`/proyectos/${f.project.idProyecto}/cierre/documentos`);
    expect(grant.maxBytes).toBe(MAX_DOCUMENT_SIZE);
    expect(grant.maxBytes).toBe(10485760);
    expect(grant.expiraEn.getTime()).toBeGreaterThan(Date.now());
    const grantSerializado = JSON.stringify(grant);
    expect(grantSerializado).not.toContain('secreto-sintetico-de-prueba');
    expect(grantSerializado).not.toContain('signature');
    expect(grantSerializado).not.toContain('api_key');
    expect(grantSerializado).not.toContain('cloudinary');

    const reservado = await db.documentoCierre.findUniqueOrThrow({
      where: { idDocumentoCierre: grant.documentId },
    });
    expect(reservado.estadoDocumento).toBe('RESERVADO');
    expect(reservado.externalId).toMatch(/^uvgenius\/cierre\/\d+\/[0-9a-f-]{36}\.enc$/);

    // Durante la transmisión NO puede haber una transacción abierta sobre el
    // proyecto: la segunda conexión toma su lock sin esperar.
    let lockLibreDuranteLaCarga = false;
    const uploadOriginal = storage.uploadImmutable.getMockImplementation()!;
    storage.uploadImmutable.mockImplementation(async (identity, ciphertext, params) => {
      await second().$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '1s'");
        await tx.$queryRawUnsafe(
          'SELECT id_proyecto FROM proyecto WHERE id_proyecto = $1 FOR UPDATE NOWAIT',
          f.project.idProyecto,
        );
        lockLibreDuranteLaCarga = true;
      });
      return uploadOriginal(identity, ciphertext, params);
    });

    const documento = await service.uploadAndAttach(
      f.project.idProyecto,
      f.leader.idUsuario,
      grant.ticket,
      pdf,
    );
    expect(lockLibreDuranteLaCarga).toBe(true);
    expect(documento.estadoDocumento).toBe('DISPONIBLE');
    expect(documento.tamanoBytes).toBe(pdf.length);
    expect(documento.assetId).not.toBeNull();
    expect(storage.uploadImmutable).toHaveBeenCalledTimes(1);

    // Lo subido es CIPHERTEXT: nunca el PDF en claro.
    const subido = storage.uploadImmutable.mock.calls[0][1] as Buffer;
    expect(subido.length).toBe(pdf.length);
    expect(subido.equals(pdf)).toBe(false);
    expect(subido.subarray(0, 5).toString('latin1')).not.toBe('%PDF-');

    // El vínculo con el borrador y el evento existen.
    const vinculo = await db.documentoRevisionCierre.findFirstOrThrow({
      where: { idDocumentoCierre: grant.documentId },
    });
    expect(vinculo.idRevisionCierre).toBe(f.revision.idRevisionCierre);
    expect(
      await db.bitacoraAuditoria.count({
        where: { accion: 'CLOSURE_DOCUMENT_ADDED', idObjeto: String(grant.documentId) },
      }),
    ).toBe(1);

    // La metadata criptográfica se guardó sin ninguna clave en claro.
    const persistido = await db.documentoCierre.findUniqueOrThrow({
      where: { idDocumentoCierre: grant.documentId },
    });
    const metadata = persistido.cryptoMetadata as Record<string, string>;
    expect(Object.keys(metadata).sort()).toEqual(
      ['format', 'iv', 'keyId', 'tag', 'wrapIv', 'wrapTag', 'wrappedDek'].sort(),
    );
    expect(JSON.stringify(metadata)).not.toContain(Buffer.alloc(32, 3).toString('base64'));

    // Reintento del MISMO actor: mismo resultado, sin segunda carga.
    const repetido = await service.uploadAndAttach(
      f.project.idProyecto,
      f.leader.idUsuario,
      grant.ticket,
      pdf,
    );
    expect(repetido).toEqual(documento);
    expect(storage.uploadImmutable).toHaveBeenCalledTimes(1);
    expect(await db.documentoRevisionCierre.count({ where: { idDocumentoCierre: grant.documentId } })).toBe(1);

    // Otro actor con el mismo ticket: conflicto, sin carga ni vínculo nuevo.
    await expectStatus(409, () =>
      service.uploadAndAttach(f.project.idProyecto, f.otro.idUsuario, grant.ticket, pdf),
    );
    expect(storage.uploadImmutable).toHaveBeenCalledTimes(1);

    // Tres reservas seguidas sin consumir: la tercera se rechaza.
    const primera = await service.reserve(f.project.idProyecto, f.leader.idUsuario, {
      revisionId: f.revision.idRevisionCierre,
      nombreArchivo: 'otra.pdf',
    });
    const segunda = await service.reserve(f.project.idProyecto, f.leader.idUsuario, {
      revisionId: f.revision.idRevisionCierre,
      nombreArchivo: 'otra-mas.pdf',
    });
    scope.documentIds.push(primera.documentId, segunda.documentId);
    const tercera = await expectStatus(409, () =>
      service.reserve(f.project.idProyecto, f.leader.idUsuario, {
        revisionId: f.revision.idRevisionCierre,
        nombreArchivo: 'tercera.pdf',
      }),
    );
    expect(tercera).toMatchObject({ code: 'RESERVA_NO_DISPONIBLE' });

    // Ticket expirado y ticket manipulado: 401 y ninguna escritura.
    const documentosAntes = await db.documentoCierre.count({
      where: { idProyecto: f.project.idProyecto },
    });
    const vencido = tickets.sign(
      {
        purpose: 'upload',
        documentId: primera.documentId,
        projectId: f.project.idProyecto,
        revisionId: f.revision.idRevisionCierre,
        actorId: f.leader.idUsuario,
      },
      -10,
    );
    await expectStatus(401, () =>
      service.uploadAndAttach(f.project.idProyecto, f.leader.idUsuario, vencido.ticket, pdf),
    );
    const manipulado = `${primera.ticket.slice(0, -2)}${primera.ticket.slice(-2) === 'AA' ? 'BB' : 'AA'}`;
    await expectStatus(401, () =>
      service.uploadAndAttach(f.project.idProyecto, f.leader.idUsuario, manipulado, pdf),
    );
    expect(await db.documentoCierre.count({ where: { idProyecto: f.project.idProyecto } })).toBe(
      documentosAntes,
    );
    expect(
      (await db.documentoCierre.findUniqueOrThrow({ where: { idDocumentoCierre: primera.documentId } }))
        .estadoDocumento,
    ).toBe('RESERVADO');
    expect(storage.uploadImmutable).toHaveBeenCalledTimes(1);
  });
});
