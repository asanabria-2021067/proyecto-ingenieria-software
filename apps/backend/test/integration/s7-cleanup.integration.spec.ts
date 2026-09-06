import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { HttpException, ValidationPipe } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ClosureCleanupService } from '../../src/project-closure/closure-cleanup.service';
import { SweepDto } from '../../src/project-closure/dto/closure.dto';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import { cleanupClosureLifecycle } from './setup/closure-lifecycle';
import {
  closureDocumentsStack,
  closureDraftFixture,
  pdfFixture,
  type ClosureCleanupScope,
} from './setup/closure-storage';
import { createIntegrationAdmin } from './setup/leadership';
import { useSecondClient, withDeadline } from './setup/concurrency';

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const OLD = new Date('2026-01-01T00:00:00.000Z');
const OLD_DEADLINE = new Date('2026-01-02T00:00:00.000Z');

async function expectStatus(status: number, operation: Promise<unknown>): Promise<void> {
  try { await operation; } catch (error) {
    if (error instanceof HttpException && error.getStatus() === status) return;
    throw error;
  }
  throw new Error(`Se esperaba HTTP ${status}`);
}

describeIntegration('S7 barrido de documentos de cierre', () => {
  let db: PrismaClient;
  let scope: ClosureCleanupScope;
  const second = useSecondClient();

  beforeAll(async () => { db = createIntegrationPrismaClient(); await db.$connect(); });
  beforeEach(() => { scope = {}; });
  afterEach(async () => { vi.restoreAllMocks(); await cleanupClosureLifecycle(db, scope); });
  afterAll(async () => { await db.$disconnect(); });

  it('T31: la reserva de purga y el vínculo compiten y jamás producen un documento vinculado y purgado', async () => {
    const admin = await createIntegrationAdmin(db, scope);

    const losingUpload = await closureDraftFixture(db, scope);
    const losingStack = closureDocumentsStack(db);
    const cleanup = new ClosureCleanupService(
      db as unknown as PrismaService, losingStack.runner, losingStack.policy,
    );
    const grant = await losingStack.service.reserve(losingUpload.project.idProyecto, losingUpload.leader.idUsuario, {
      revisionId: losingUpload.revision.idRevisionCierre, nombreArchivo: 'carga-que-pierde.pdf',
    });
    const originalUpload = losingStack.storage.uploadImmutable.getMockImplementation()!;
    let signalUpload: () => void = () => undefined;
    let releaseUpload: () => void = () => undefined;
    const uploadReached = new Promise<void>((resolve) => { signalUpload = resolve; });
    const uploadReleased = new Promise<void>((resolve) => { releaseUpload = resolve; });
    losingStack.storage.uploadImmutable.mockImplementation(async (...args) => {
      signalUpload();
      await uploadReleased;
      return originalUpload(...args);
    });
    const lateAttach = losingStack.service.uploadAndAttach(
      losingUpload.project.idProyecto, losingUpload.leader.idUsuario, grant.ticket, await pdfFixture(),
    );
    await withDeadline(uploadReached, 8_000, 'upload retenido antes del vínculo');
    await second().documentoCierre.update({
      where: { idDocumentoCierre: grant.documentId },
      data: { cargaIniciadaEn: OLD, cargaLimiteEn: OLD_DEADLINE },
    });
    const swept = await cleanup.sweep(admin.idUsuario, { dryRun: false, limit: 50 });
    expect(swept.candidatos).toEqual([grant.documentId]);
    releaseUpload();
    await expectStatus(409, lateAttach);
    expect(await db.documentoCierre.findUniqueOrThrow({
      where: { idDocumentoCierre: grant.documentId },
    })).toMatchObject({ estadoDocumento: 'PURGA_PENDIENTE', purgaSolicitadaEn: expect.any(Date), purgadoEn: null });
    expect(await db.documentoRevisionCierre.count({ where: { idDocumentoCierre: grant.documentId } })).toBe(0);

    const linked = await closureDraftFixture(db, scope);
    const linkedStack = closureDocumentsStack(db);
    const linkedGrant = await linkedStack.service.reserve(linked.project.idProyecto, linked.leader.idUsuario, {
      revisionId: linked.revision.idRevisionCierre, nombreArchivo: 'historico-vinculado.pdf',
    });
    await linkedStack.service.uploadAndAttach(
      linked.project.idProyecto, linked.leader.idUsuario, linkedGrant.ticket, await pdfFixture(),
    );
    await db.documentoCierre.update({
      where: { idDocumentoCierre: linkedGrant.documentId }, data: { creadoEn: OLD, disponibleEn: OLD },
    });
    const linkedCleanup = new ClosureCleanupService(
      db as unknown as PrismaService, linkedStack.runner, linkedStack.policy,
    );
    const linkedSweep = await linkedCleanup.sweep(admin.idUsuario, { dryRun: false, limit: 50 });
    expect(linkedSweep.candidatos).not.toContain(linkedGrant.documentId);
    expect(await db.documentoCierre.findUniqueOrThrow({
      where: { idDocumentoCierre: linkedGrant.documentId },
    })).toMatchObject({ estadoDocumento: 'DISPONIBLE', purgaSolicitadaEn: null });
    expect(await db.documentoRevisionCierre.count({ where: { idDocumentoCierre: linkedGrant.documentId } })).toBe(1);

    const unlinked = await closureDraftFixture(db, scope);
    const unlinkedStack = closureDocumentsStack(db);
    const unlinkedGrant = await unlinkedStack.service.reserve(unlinked.project.idProyecto, unlinked.leader.idUsuario, {
      revisionId: unlinked.revision.idRevisionCierre, nombreArchivo: 'candidato-dry-run.pdf',
    });
    await unlinkedStack.service.uploadAndAttach(
      unlinked.project.idProyecto, unlinked.leader.idUsuario, unlinkedGrant.ticket, await pdfFixture(),
    );
    await unlinkedStack.service.detach(
      unlinked.project.idProyecto, unlinked.leader.idUsuario, unlinked.revision.idRevisionCierre, unlinkedGrant.documentId,
    );
    await db.documentoCierre.update({
      where: { idDocumentoCierre: unlinkedGrant.documentId }, data: { creadoEn: OLD, disponibleEn: OLD },
    });
    const unlinkedCleanup = new ClosureCleanupService(
      db as unknown as PrismaService, unlinkedStack.runner, unlinkedStack.policy,
    );
    const dryRun = await unlinkedCleanup.sweep(admin.idUsuario, {});
    expect(dryRun).toMatchObject({ dryRun: true, purgados: [], fallidos: [] });
    expect(dryRun.candidatos).toContain(unlinkedGrant.documentId);
    expect(await db.documentoCierre.findUniqueOrThrow({
      where: { idDocumentoCierre: unlinkedGrant.documentId },
    })).toMatchObject({ estadoDocumento: 'DISPONIBLE', purgaSolicitadaEn: null });

    const officialReference = await closureDraftFixture(db, scope);
    const officialStack = closureDocumentsStack(db);
    const officialGrant = await officialStack.service.reserve(
      officialReference.project.idProyecto, officialReference.leader.idUsuario,
      { revisionId: officialReference.revision.idRevisionCierre, nombreArchivo: 'referencia-oficial.pdf' },
    );
    await officialStack.service.uploadAndAttach(
      officialReference.project.idProyecto, officialReference.leader.idUsuario, officialGrant.ticket, await pdfFixture(),
    );
    await officialStack.service.detach(
      officialReference.project.idProyecto, officialReference.leader.idUsuario,
      officialReference.revision.idRevisionCierre, officialGrant.documentId,
    );
    await db.documentoCierre.update({
      where: { idDocumentoCierre: officialGrant.documentId }, data: { creadoEn: OLD, disponibleEn: OLD },
    });
    await db.revisionCierreProyecto.update({
      where: { idRevisionCierre: officialReference.revision.idRevisionCierre },
      data: { estadoRevision: 'APROBADA', idSolicitante: officialReference.leader.idUsuario,
        enviadaEn: OLD, fingerprintEntrega: 'a'.repeat(64), idRevisor: admin.idUsuario,
        resueltaEn: OLD, idDocumentoOficial: officialGrant.documentId },
    });
    const officialCleanup = new ClosureCleanupService(
      db as unknown as PrismaService, officialStack.runner, officialStack.policy,
    );
    expect((await officialCleanup.dryRun(admin.idUsuario, { limit: 50 })).candidatos)
      .not.toContain(officialGrant.documentId);

    const defaults = await pipe.transform({}, { type: 'body', metatype: SweepDto });
    expect(defaults).toMatchObject({ dryRun: true, limit: 50 });
    await expectStatus(400, pipe.transform({ limit: 101 }, { type: 'body', metatype: SweepDto }));
    await expectStatus(400, unlinkedCleanup.sweep(admin.idUsuario, { dryRun: false, limit: 101 }));
    expect([...dryRun.candidatos]).toEqual([...dryRun.candidatos].sort((a, b) => a - b));
  });
});
