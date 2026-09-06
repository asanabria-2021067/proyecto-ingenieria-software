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
});
