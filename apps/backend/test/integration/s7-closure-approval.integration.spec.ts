import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { HttpException, ValidationPipe } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { ApproveClosureDto } from '../../src/project-closure/dto/closure.dto';
import type { OfficialReportCapture } from '../../src/project-closure/project-closure-report.service';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import { cleanupClosureLifecycle, closureReadyFixture } from './setup/closure-lifecycle';
import { pdfFixture, type ClosureCleanupScope } from './setup/closure-storage';
import { createIntegrationAdmin } from './setup/leadership';
import { createIntegrationParticipation, createIntegrationUser } from './setup/fixtures';
import { useSecondClient } from './setup/concurrency';

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

async function expectStatus(status: number, fn: () => Promise<unknown>): Promise<unknown> {
  try { await fn(); } catch (error) {
    if (error instanceof HttpException && error.getStatus() === status) return error.getResponse();
    throw error;
  }
  throw new Error(`Se esperaba HTTP ${status}`);
}

async function readyForApproval(db: PrismaClient, scope: ClosureCleanupScope) {
  const f = await closureReadyFixture(db, scope);
  const admin = await createIntegrationAdmin(db, scope);
  const retiredUser = await createIntegrationUser(db);
  scope.userIds = [...(scope.userIds ?? []), retiredUser.idUsuario];
  const retired = await createIntegrationParticipation(db, retiredUser.idUsuario, f.role.idRolProyecto, { estadoParticipacion: 'RETIRADO' });
  scope.participationIds = [...(scope.participationIds ?? []), retired.idParticipacion];
  await db.horasParticipacion.create({ data: {
    idParticipacion: retired.idParticipacion, periodoInicio: new Date('2026-09-01'), periodoFin: new Date('2026-09-02'),
    horasReportadas: '2.00', horasCalculadas: '2.00', estadoHoras: 'PENDIENTE', idSprint: f.sprint.idSprint,
  } });
  const evidence = await f.stack.documentos.service.reserve(f.project.idProyecto, f.leader.idUsuario, {
    revisionId: f.dto.revisionId, nombreArchivo: 'segunda-evidencia-aprobacion.pdf',
  });
  await f.stack.documentos.service.uploadAndAttach(f.project.idProyecto, f.leader.idUsuario, evidence.ticket, await pdfFixture());
  const refreshed = await f.stack.report.generateAutoReport(f.project.idProyecto, f.leader.idUsuario, f.dto.revisionId);
  const submitted = await f.stack.closure.requestClose(f.project.idProyecto, f.leader.idUsuario, {
    ...f.dto, expectedFingerprint: refreshed.fingerprintEjecucion,
  });
  return { ...f, admin, retired, retiredUser, approveDto: {
    revisionId: f.dto.revisionId, expectedFingerprint: submitted.fingerprintEntrega!,
  } };
}

describeIntegration('S7 aprobación del cierre', () => {
  let db: PrismaClient;
  let scope: ClosureCleanupScope;
  const second = useSecondClient();

  beforeAll(async () => { db = createIntegrationPrismaClient(); await db.$connect(); });
  beforeEach(() => { scope = {}; });
  afterEach(async () => { vi.restoreAllMocks(); await cleanupClosureLifecycle(db, scope); });
  afterAll(async () => { await db.$disconnect(); });

  it('T27-A: la fase uno captura el contexto oficial, fija la fecha una sola vez y reserva el documento sin cerrar el proyecto', async () => {
    const f = await closureReadyFixture(db, scope);
    const { closure, review, report, documentos } = f.stack;
    const admin = await createIntegrationAdmin(db, scope);
    const evidence = await documentos.service.reserve(f.project.idProyecto, f.leader.idUsuario, {
      revisionId: f.dto.revisionId, nombreArchivo: 'segunda-evidencia.pdf',
    });
    await documentos.service.uploadAndAttach(f.project.idProyecto, f.leader.idUsuario, evidence.ticket, await pdfFixture());
    for (const [estadoParticipacion, horas] of [['RETIRADO', '2.00'], ['COMPLETADO', '3.00']] as const) {
      const user = await createIntegrationUser(db);
      scope.userIds = [...(scope.userIds ?? []), user.idUsuario];
      const participation = await createIntegrationParticipation(db, user.idUsuario, f.role.idRolProyecto, { estadoParticipacion });
      scope.participationIds = [...(scope.participationIds ?? []), participation.idParticipacion];
      await db.horasParticipacion.create({ data: {
        idParticipacion: participation.idParticipacion, periodoInicio: new Date('2026-09-01'),
        periodoFin: new Date('2026-09-02'), horasReportadas: horas, horasCalculadas: horas,
        estadoHoras: 'PENDIENTE', idSprint: f.sprint.idSprint,
      } });
    }
    const refreshed = await report.generateAutoReport(f.project.idProyecto, f.leader.idUsuario, f.dto.revisionId);
    const submitted = await closure.requestClose(f.project.idProyecto, f.leader.idUsuario, {
      ...f.dto, expectedFingerprint: refreshed.fingerprintEjecucion,
    });
    const dto = { revisionId: f.dto.revisionId, expectedFingerprint: submitted.fingerprintEntrega! };
    const officialBefore = await db.documentoCierre.count({ where: { idProyecto: f.project.idProyecto, tipoDocumento: 'INFORME_OFICIAL_FINAL' } });
    await expectStatus(404, () => review.approveClosure(f.project.idProyecto, admin.idUsuario, { ...dto, revisionId: f.revisionAjena.idRevisionCierre }));
    await expectStatus(409, () => review.approveClosure(f.project.idProyecto, admin.idUsuario, { ...dto, expectedFingerprint: 'f'.repeat(64) }));
    await expectStatus(400, () => pipe.transform({ ...dto, horasAprobadas: 99, fechaAprobacion: '2020-01-01' }, { type: 'body', metatype: ApproveClosureDto }));
    expect(await db.documentoCierre.count({ where: { idProyecto: f.project.idProyecto, tipoDocumento: 'INFORME_OFICIAL_FINAL' } })).toBe(officialBefore);

    let capture: OfficialReportCapture | undefined;
    let renderedTexts: string[] = [];
    const originalRender = report.renderOfficial.bind(report);
    vi.spyOn(report, 'renderOfficial').mockImplementation((value) => {
      capture = value;
      const rendered = originalRender(value);
      renderedTexts = rendered.resumen.textosRenderizados;
      return rendered;
    });
    vi.spyOn(documentos.service, 'uploadGenerated').mockImplementation(async () => {
      await second().$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '1s'");
        await tx.$queryRawUnsafe('SELECT id_proyecto FROM proyecto WHERE id_proyecto = $1 FOR UPDATE NOWAIT', f.project.idProyecto);
      });
      throw new Error('fallo controlado después de fase uno');
    });
    await expect(review.approveClosure(f.project.idProyecto, admin.idUsuario, dto)).rejects.toThrow('fallo controlado después de fase uno');
    expect(capture).toBeDefined();
    expect(capture!.oficial).toMatchObject({ revisionId: f.dto.revisionId, adminId: admin.idUsuario,
      fechaAprobacion: expect.any(Date), manifiestoEntrega: expect.arrayContaining([
        expect.objectContaining({ orden: 0 }), expect.objectContaining({ orden: 1 }), expect.objectContaining({ orden: 2 }),
      ]), horasFinales: expect.arrayContaining([
        expect.objectContaining({ idParticipacion: f.participacion.idParticipacion, horas: '4.00' }),
      ]) });
    expect(capture!.oficial.horasFinales).toHaveLength(3);
    expect(capture!.contexto).toMatchObject({ variante: 'OFICIAL', aprobacion: {
      adminId: admin.idUsuario, revisionId: f.dto.revisionId,
      fechaAprobacion: (capture!.oficial.fechaAprobacion as Date).toISOString(),
    }, fechaGeneracion: (capture!.oficial.fechaAprobacion as Date).toISOString() });
    expect(renderedTexts).toEqual(expect.arrayContaining([
      `Administrador: ${admin.idUsuario}`, `Revisión: ${f.dto.revisionId}`, 'Estado final: CERRADO',
    ]));
    const official = await db.documentoCierre.findFirstOrThrow({ where: {
      idProyecto: f.project.idProyecto, idRevisionOrigen: f.dto.revisionId, tipoDocumento: 'INFORME_OFICIAL_FINAL',
    } });
    expect(official).toMatchObject({ estadoDocumento: 'RESERVADO', idAutor: admin.idUsuario,
      fingerprintEjecucion: capture!.fingerprintEjecucion, fingerprintModelo: capture!.fingerprintModelo,
      assetId: null, versionRemota: null, checksumSha256: null, cryptoMetadata: null });
    expect((await db.proyecto.findUniqueOrThrow({ where: { idProyecto: f.project.idProyecto } })).estadoProyecto).toBe('EN_SOLICITUD_CIERRE');
    expect(await db.revisionCierreProyecto.findUniqueOrThrow({ where: { idRevisionCierre: f.dto.revisionId } })).toMatchObject({ estadoRevision: 'ENVIADA', idDocumentoOficial: null });
    expect(await db.horasParticipacion.count({ where: { participacion: { rolProyecto: { idProyecto: f.project.idProyecto } }, estadoHoras: 'PENDIENTE' } })).toBe(3);
  });

  it('T27-B: la fase dos cierra el proyecto sin eliminadoEn, acredita las horas y completa las participaciones en una sola transacción', async () => {
    const f = await readyForApproval(db, scope);
    const bridgeBefore = await db.documentoRevisionCierre.findMany({
      where: { idRevisionCierre: f.dto.revisionId }, orderBy: { orden: 'asc' },
    });
    f.stack.gateway.emitToUsers.mockClear();
    f.stack.gateway.emitToUsers.mockImplementation(async () => {
      expect(await db.proyecto.findUniqueOrThrow({ where: { idProyecto: f.project.idProyecto } })).toMatchObject({ estadoProyecto: 'CERRADO', eliminadoEn: null });
      expect(await db.horasParticipacion.count({ where: { participacion: { rolProyecto: { idProyecto: f.project.idProyecto } }, estadoHoras: 'PENDIENTE' } })).toBe(0);
    });
    const result = await f.stack.review.approveClosure(f.project.idProyecto, f.admin.idUsuario, f.approveDto);
    expect(result).toMatchObject({ estadoProyecto: 'CERRADO', revisionId: f.dto.revisionId,
      informeOficialId: expect.any(Number), cantidades: { horasAcreditadas: 2, participacionesCompletadas: 1 } });
    const project = await db.proyecto.findUniqueOrThrow({ where: { idProyecto: f.project.idProyecto } });
    const revision = await db.revisionCierreProyecto.findUniqueOrThrow({ where: { idRevisionCierre: f.dto.revisionId } });
    const official = await db.documentoCierre.findUniqueOrThrow({ where: { idDocumentoCierre: result.informeOficialId! } });
    const context = official.contextoReporte as { aprobacion: { adminId: number; revisionId: number; fechaAprobacion: string } };
    expect(project).toMatchObject({ estadoProyecto: 'CERRADO', eliminadoEn: null });
    expect(revision).toMatchObject({ estadoRevision: 'APROBADA', idRevisor: f.admin.idUsuario,
      idDocumentoOficial: official.idDocumentoCierre, resueltaEn: new Date(context.aprobacion.fechaAprobacion) });
    expect(official).toMatchObject({ estadoDocumento: 'DISPONIBLE', idAutor: f.admin.idUsuario,
      disponibleEn: new Date(context.aprobacion.fechaAprobacion), assetId: expect.any(String), versionRemota: expect.any(String) });
    const hours = await db.horasParticipacion.findMany({
      where: { participacion: { rolProyecto: { idProyecto: f.project.idProyecto } } }, orderBy: { idRegistroHoras: 'asc' },
    });
    expect(hours).toHaveLength(2);
    for (const row of hours) {
      expect(row.estadoHoras).toBe('APROBADA');
      expect(row.horasAprobadas?.toFixed(2)).toBe(row.horasCalculadas?.toFixed(2));
      expect(row.aprobadoPor).toBe(f.admin.idUsuario);
      expect(row.fechaAprobacion).toEqual(revision.resueltaEn);
    }
    expect(await db.participacionProyecto.findUniqueOrThrow({ where: { idParticipacion: f.participacion.idParticipacion } })).toMatchObject({ estadoParticipacion: 'COMPLETADO' });
    expect(await db.participacionProyecto.findUniqueOrThrow({ where: { idParticipacion: f.retired.idParticipacion } })).toMatchObject({ estadoParticipacion: 'RETIRADO' });
    expect(await db.documentoRevisionCierre.findMany({ where: { idRevisionCierre: f.dto.revisionId }, orderBy: { orden: 'asc' } })).toEqual(bridgeBefore);
    expect(await db.documentoRevisionCierre.count({ where: { idDocumentoCierre: official.idDocumentoCierre } })).toBe(0);
    const read = await f.stack.closure.getRevision(f.project.idProyecto, f.admin.idUsuario, 1);
    expect(read.documentosEnviados).toHaveLength(3);
    expect(read.informeOficial).toMatchObject({ idDocumentoCierre: official.idDocumentoCierre });
    for (const action of ['PROJECT_CLOSE_REVIEW_APPROVED', 'PROJECT_HOURS_CREDITED']) {
      expect(await db.bitacoraAuditoria.count({ where: { idUsuario: f.admin.idUsuario, accion: action } })).toBe(1);
    }
    expect(await db.notificacion.count({ where: { tipoNotificacion: 'CIERRE_APROBADO', idUsuario: { in: [f.leader.idUsuario, f.miembro.idUsuario, f.retiredUser.idUsuario] } } })).toBe(3);
    expect(await db.notificacion.count({ where: { tipoNotificacion: 'HORAS_ACREDITADAS', idUsuario: { in: [f.miembro.idUsuario, f.retiredUser.idUsuario] } } })).toBe(2);
    expect(f.stack.gateway.emitToUsers.mock.calls.map((call) => call[0])).toEqual(['PROJECT_STATE_CHANGED', 'CLOSURE_REVIEW_UPDATED']);

    const failed = await readyForApproval(db, scope);
    failed.stack.gateway.emitToUsers.mockClear();
    vi.spyOn(failed.stack.review as unknown as { beforeApprovalPhaseTwoCommit: () => Promise<void> }, 'beforeApprovalPhaseTwoCommit')
      .mockRejectedValueOnce(new Error('fallo determinista al final de fase dos'));
    await expect(failed.stack.review.approveClosure(failed.project.idProyecto, failed.admin.idUsuario, failed.approveDto))
      .rejects.toThrow('fallo determinista al final de fase dos');
    expect(await db.proyecto.findUniqueOrThrow({ where: { idProyecto: failed.project.idProyecto } })).toMatchObject({ estadoProyecto: 'EN_SOLICITUD_CIERRE' });
    expect(await db.revisionCierreProyecto.findUniqueOrThrow({ where: { idRevisionCierre: failed.dto.revisionId } })).toMatchObject({ estadoRevision: 'ENVIADA', idDocumentoOficial: null });
    expect(await db.horasParticipacion.count({ where: { participacion: { rolProyecto: { idProyecto: failed.project.idProyecto } }, estadoHoras: 'PENDIENTE' } })).toBe(2);
    expect(await db.horasParticipacion.count({ where: { participacion: { rolProyecto: { idProyecto: failed.project.idProyecto } }, horasAprobadas: { not: null } } })).toBe(0);
    expect(await db.participacionProyecto.findUniqueOrThrow({ where: { idParticipacion: failed.participacion.idParticipacion } })).toMatchObject({ estadoParticipacion: 'ACTIVO' });
    expect(await db.bitacoraAuditoria.count({ where: { idUsuario: failed.admin.idUsuario, accion: { in: ['PROJECT_CLOSE_REVIEW_APPROVED', 'PROJECT_HOURS_CREDITED'] } } })).toBe(0);
    expect(await db.notificacion.count({ where: { idUsuario: { in: [failed.leader.idUsuario, failed.miembro.idUsuario, failed.retiredUser.idUsuario] }, tipoNotificacion: { in: ['CIERRE_APROBADO', 'HORAS_ACREDITADAS'] } } })).toBe(0);
    expect(failed.stack.gateway.emitToUsers).not.toHaveBeenCalled();
  });
});
