import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApplicationsService } from '../../src/applications/applications.service';
import { RevisionesService } from '../../src/revisiones/revisiones.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ProjectReadPolicyService } from '../../src/common/project-policy/project-read-policy.service';
import { canonicalDigest } from '../../src/project-closure/closure-report-model';
import { createIntegrationUser } from './setup/fixtures';
import { createIntegrationAdmin } from './setup/leadership';
import { createBarrier, useSecondClient, withDeadline } from './setup/concurrency';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import {
  cleanupClosureLifecycle,
  closureLifecycleStack,
  proyectoConIncumplimientos,
  proyectoListoParaGenerar,
} from './setup/closure-lifecycle';
import { pdfFixture, type ClosureCleanupScope } from './setup/closure-storage';

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
 * C129+ (06 v2 §21/§22/§24/§47 T12-T13): preparación del cierre y sus
 * carreras. Cerrar un proyecto es un acto administrativo con precondiciones
 * verificables: quien no puede cerrarlo merece saber TODO lo que falta.
 */
describeIntegration('S7 carreras y preparación del cierre', () => {
  const second = useSecondClient();
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
    await cleanupClosureLifecycle(db, scope);
  });
  afterAll(async () => {
    await db.$disconnect();
  });

  it('T14: solicitar el cierre rechaza todas las postulaciones pendientes con conteo exacto y no deja ninguna superviviente', async () => {
    const f = await proyectoListoParaGenerar(db, scope);
    const stack = closureLifecycleStack(db);
    const { closure, report, documentos, readiness, notifications, gateway, runner, policy } = stack;
    const generated = await report.generateAutoReport(f.project.idProyecto, f.leader.idUsuario, f.revision.idRevisionCierre);
    for (let n = 0; n < 2; n++) {
      const grant = await documentos.service.reserve(f.project.idProyecto, f.leader.idUsuario, {
        revisionId: f.revision.idRevisionCierre, nombreArchivo: `evidencia-${n}.pdf`,
      });
      await documentos.service.uploadAndAttach(f.project.idProyecto, f.leader.idUsuario, grant.ticket, await pdfFixture());
    }
    const admin = await createIntegrationAdmin(db, scope);
    const applicants = [];
    for (let n = 0; n < 8; n++) {
      const user = await createIntegrationUser(db);
      scope.userIds = [...scope.userIds!, user.idUsuario];
      applicants.push(user);
    }
    const applications = [];
    for (let n = 0; n < 7; n++) applications.push(await db.postulacion.create({ data: {
      idUsuarioPostulante: applicants[n].idUsuario, idRolProyecto: f.role.idRolProyecto,
      justificacion: 'Solicitud de integración', estadoPostulacion: n < 5 ? 'PENDIENTE' : 'RECHAZADA',
    } }));
    const originalLinks = await db.documentoRevisionCierre.findMany({
      where: { idRevisionCierre: f.revision.idRevisionCierre }, orderBy: { orden: 'asc' }, include: { documento: true },
    });
    const secondStack = closureLifecycleStack(second());
    const prisma2 = second() as unknown as PrismaService;
    const candidateService = new ApplicationsService(prisma2, secondStack.notifications, new EventEmitter2(),
      secondStack.runner, secondStack.policy, new ProjectReadPolicyService(prisma2));
    const locked = createBarrier(1);
    const contenderRead = createBarrier(1);
    const evaluate = readiness.assertReady.bind(readiness);
    vi.spyOn(readiness, 'assertReady').mockImplementationOnce(async (...args) => {
      const result = await evaluate(...args);
      await locked.arrive();
      await contenderRead.wait();
      return result;
    });
    const runSecond = secondStack.runner.run.bind(secondStack.runner);
    vi.spyOn(secondStack.runner, 'run').mockImplementation(async (...args) => {
      await contenderRead.arrive();
      return runSecond(...args);
    });
    gateway.emitToUsers.mockImplementation(async () => {
      expect((await second().proyecto.findUniqueOrThrow({ where: { idProyecto: f.project.idProyecto } })).estadoProyecto).toBe('EN_SOLICITUD_CIERRE');
    });
    const submit = closure.requestClose(f.project.idProyecto, f.leader.idUsuario, {
      revisionId: f.revision.idRevisionCierre, confirmado: true, expectedFingerprint: generated.fingerprintEjecucion,
    });
    await withDeadline(locked.wait(), 5000);
    const concurrent = expectStatus(409, () => candidateService.create({ idRolProyecto: f.role.idRolProyecto,
      justificacion: 'Concurrente' }, applicants[7].idUsuario));
    const [result] = await withDeadline(Promise.all([submit, concurrent]), 10000);
    expect(result.cantidades.postulacionesRechazadas).toBe(5);
    const revision = await db.revisionCierreProyecto.findUniqueOrThrow({ where: { idRevisionCierre: f.revision.idRevisionCierre } });
    expect(revision).toMatchObject({ estadoRevision: 'ENVIADA', idSolicitante: f.leader.idUsuario, enviadaEn: expect.any(Date),
      fingerprintEntrega: canonicalDigest({ revisionId: revision.idRevisionCierre, executionFingerprint: generated.fingerprintEjecucion,
        documentos: originalLinks.map((link) => ({ id: link.idDocumentoCierre, checksum: link.documento.checksumSha256, orden: link.orden })) }) });
    for (let n = 0; n < applications.length; n++) {
      const row = await db.postulacion.findUniqueOrThrow({ where: { idPostulacion: applications[n].idPostulacion } });
      if (n >= 5) expect(row).toEqual(applications[n]);
      else {
        expect(row).toMatchObject({ estadoPostulacion: 'RECHAZADA', resueltaPor: f.leader.idUsuario, fechaResolucion: revision.enviadaEn,
          comentarioResolucion: 'Rechazada automáticamente por solicitud de cierre del proyecto' });
        const notices = await db.notificacion.findMany({ where: { idUsuario: applicants[n].idUsuario, tipoNotificacion: 'POSTULACION_RECHAZADA_POR_CIERRE' } });
        expect(notices).toHaveLength(1);
        expect(notices[0].mensajeNotificacion).toBe('Tu postulación fue rechazada automáticamente porque el proyecto inició su proceso de cierre');
      }
    }
    expect(await db.postulacion.count({ where: { rolProyecto: { idProyecto: f.project.idProyecto }, estadoPostulacion: 'PENDIENTE' } })).toBe(0);
    expect(await db.notificacion.count({ where: { idUsuario: admin.idUsuario, tipoNotificacion: 'SOLICITUD_CIERRE_PROYECTO' } })).toBe(1);
    for (const accion of ['PROJECT_CLOSE_REQUESTED', 'POSTULATIONS_AUTO_REJECTED']) {
      expect(await db.bitacoraAuditoria.count({ where: { accion, idUsuario: f.leader.idUsuario } })).toBe(1);
    }
    expect(gateway.emitToUsers.mock.calls.map((call) => call[0])).toEqual(['PROJECT_STATE_CHANGED', 'CLOSURE_REVIEW_UPDATED']);
    const prisma = db as unknown as PrismaService;
    const inbox = await new RevisionesService(prisma, notifications, runner, policy, new ProjectReadPolicyService(prisma)).findAdminInbox(admin.idUsuario);
    expect(inbox.cierresPendientes).toEqual(expect.arrayContaining([expect.objectContaining({ idRevisionCierre: revision.idRevisionCierre })]));
    expect(await db.documentoRevisionCierre.findMany({ where: { idRevisionCierre: revision.idRevisionCierre }, orderBy: { orden: 'asc' }, include: { documento: true } })).toEqual(originalLinks);
    expect((await db.horasParticipacion.findFirstOrThrow({ where: { idParticipacion: f.participacion.idParticipacion } })).estadoHoras).toBe('PENDIENTE');
  });

  it('T13-B: readiness enumera todos los blockers sin cambiar estado y prepare devuelve un único borrador consecutivo', async () => {
    const f = await proyectoConIncumplimientos(db, scope);
    const { closure, readiness } = closureLifecycleStack(db);

    const estadoAntes = await db.proyecto.findUniqueOrThrow({
      where: { idProyecto: f.project.idProyecto },
      select: { estadoProyecto: true, fechaActualizacion: true },
    });
    const revisionesAntes = await db.revisionCierreProyecto.count({
      where: { idProyecto: f.project.idProyecto },
    });

    // Consultar enumera TODOS los incumplimientos, no solo el primero.
    const resumen = await closure.readiness(f.project.idProyecto, f.leader.idUsuario, 'REQUEST');
    const codigos = resumen.blockers.map((blocker) => blocker.code);
    for (const esperado of [
      'SPRINTS_NO_CERRADOS',
      'TRAMOS_ABIERTOS',
      'TAREAS_SIN_TERMINAR',
      'SALIDAS_ABIERTAS',
      'APELACION_PENDIENTE',
      'REVISION_INVALIDA',
    ]) {
      expect(codigos, esperado).toContain(esperado);
    }
    expect(resumen.canSubmit).toBe(false);
    // Cada blocker trae diagnóstico utilizable: código, mensaje, ids y cantidad.
    for (const blocker of resumen.blockers) {
      expect(typeof blocker.message).toBe('string');
      expect(blocker.message.length).toBeGreaterThan(0);
      expect(Array.isArray(blocker.ids)).toBe(true);
      expect(blocker.cantidad).toBe(blocker.ids.length);
    }
    const sprintsNoCerrados = resumen.blockers.find((b) => b.code === 'SPRINTS_NO_CERRADOS')!;
    expect(sprintsNoCerrados.ids).toContain(f.sprint.idSprint);

    // La advertencia informa y NO bloquea.
    expect(resumen.warnings).toHaveLength(1);
    expect(resumen.warnings[0].code).toBe('POSTULACIONES_PENDIENTES');
    expect(resumen.warnings[0].cantidad).toBe(1);
    expect(resumen.warnings[0].ids).toContain(f.postulacion.idPostulacion);
    expect(codigos).not.toContain('POSTULACIONES_PENDIENTES');

    // Consultar no cambia NADA.
    expect(
      await db.proyecto.findUniqueOrThrow({
        where: { idProyecto: f.project.idProyecto },
        select: { estadoProyecto: true, fechaActualizacion: true },
      }),
    ).toEqual(estadoAntes);
    expect(
      await db.revisionCierreProyecto.count({ where: { idProyecto: f.project.idProyecto } }),
    ).toBe(revisionesAntes);

    // Solo el líder consulta su preparación.
    for (const ajeno of [f.miembro.idUsuario, f.externo.idUsuario]) {
      await expectStatus(403, () =>
        closure.readiness(f.project.idProyecto, ajeno, 'REQUEST'),
      );
    }

    // Un proyecto en E no admite la fase de aprobación.
    const enAprobacion = await closure.readiness(
      f.project.idProyecto,
      f.leader.idUsuario,
      'APPROVE',
    );
    expect(enAprobacion.blockers.map((b) => b.code)).toContain('PROYECTO_ESTADO_INVALIDO');

    // Preparar es idempotente: dos veces, un solo borrador consecutivo.
    // El Sprint operable se cierra primero porque la preparación lo exige.
    await db.sprint.update({
      where: { idSprint: f.sprint.idSprint },
      data: { estado: 'CERRADO', fechaCierre: new Date() },
    });
    const primero = await closure.prepare(f.project.idProyecto, f.leader.idUsuario);
    expect(primero.numeroRevision).toBe(1);
    expect(primero.estadoRevision).toBe('BORRADOR');
    scope.revisionIds = [primero.idRevisionCierre];

    const segundo = await closure.prepare(f.project.idProyecto, f.leader.idUsuario);
    expect(segundo.idRevisionCierre).toBe(primero.idRevisionCierre);
    expect(
      await db.revisionCierreProyecto.count({ where: { idProyecto: f.project.idProyecto } }),
    ).toBe(1);
    // Un solo evento: el segundo prepare no creó nada que registrar.
    expect(
      await db.bitacoraAuditoria.count({
        where: {
          accion: 'CLOSURE_DRAFT_CREATED',
          idObjeto: String(primero.idRevisionCierre),
        },
      }),
    ).toBe(1);

    // Ni el participante ni el externo preparan el cierre.
    for (const ajeno of [f.miembro.idUsuario, f.externo.idUsuario]) {
      await expectStatus(403, () => closure.prepare(f.project.idProyecto, ajeno));
    }

    // Con el borrador ya creado, la revisión deja de ser un bloqueo y el
    // resto de incumplimientos sigue enumerándose.
    const conBorrador = await readiness.evaluate(undefined, f.project.idProyecto, {
      phase: 'REQUEST',
    });
    expect(conBorrador.revisionId).toBe(primero.idRevisionCierre);
    expect(conBorrador.blockers.map((b) => b.code)).not.toContain('REVISION_INVALIDA');
    expect(conBorrador.blockers.map((b) => b.code)).toContain('INFORME_INVALIDO');
    expect(conBorrador.blockers.map((b) => b.code)).toContain('EVIDENCIAS_INVALIDAS');
    expect(conBorrador.canSubmit).toBe(false);
  });
});
