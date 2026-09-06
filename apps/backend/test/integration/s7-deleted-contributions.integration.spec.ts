import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import { backWithEntries, cleanupFlowAFixture, closedTask, flowAFixture, flowAStack } from './setup/flow-a';
import type { IntegrationCleanupScope } from './setup/cleanup';

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
 * C082 (06 v2 §15/§22/§47 T21-A): eliminar una tarea es un acto sobre el
 * TABLERO, no sobre la historia. Las horas ya trabajadas siguen existiendo,
 * siguen perteneciendo a quien las trabajó y siguen consolidándose. Lo que no
 * puede pasar es lo contrario: que una contribución desaparezca en silencio.
 */
describeIntegration('S7 contribuciones de tareas eliminadas', () => {
  let db: PrismaClient;
  let scope: IntegrationCleanupScope;
  beforeAll(async () => { db = createIntegrationPrismaClient(); await db.$connect(); });
  beforeEach(() => { scope = {}; });
  afterEach(async () => { vi.restoreAllMocks(); await cleanupFlowAFixture(db, scope); });
  afterAll(async () => { await db.$disconnect(); });

  it('T21-A: una tarea eliminada con horas se consolida y una FK de participación nula bloquea con diagnóstico', async () => {
    const f = await flowAFixture(db, scope, 'ACTIVO');
    const { service, timeRecords } = flowAStack(db);
    const base = { projectId: f.project.idProyecto, sprintId: f.sprint.idSprint, leaderId: f.leader.idUsuario };

    // Tarea 1: tramo ABIERTO con registros; se eliminará.
    const conHoras = await closedTask(db, scope, {
      ...base, userId: f.memberA.idUsuario, participationId: f.participationA.idParticipacion,
      horasReales: null, abierta: true,
    });
    await backWithEntries(db, { assignmentId: conHoras.assignment.idAsignacion, userId: f.memberA.idUsuario, horas: '4.25' });

    // Tarea 2: tramo cerrado cuya FK de participación quedó nula.
    const sinFk = await closedTask(db, scope, {
      ...base, userId: f.memberB.idUsuario, participationId: f.participationB.idParticipacion, horasReales: '2.00',
    });
    await backWithEntries(db, { assignmentId: sinFk.assignment.idAsignacion, userId: f.memberB.idUsuario, horas: '2.00' });

    // --- Eliminar la tarea 1 materializa y cierra su tramo, sin borrar nada ---
    const eliminadoEn = new Date();
    await db.$transaction(async (tx) => {
      await timeRecords.recalculateAssignment(tx, conHoras.assignment.idAsignacion);
      await tx.asignacionTarea.updateMany({
        where: { idTarea: conHoras.task.idTarea, desasignadaEn: null },
        data: { desasignadaEn: eliminadoEn },
      });
      await tx.tarea.update({ where: { idTarea: conHoras.task.idTarea }, data: { eliminadoEn } });
    });

    const tramoEliminado = await db.asignacionTarea.findUniqueOrThrow({ where: { idAsignacion: conHoras.assignment.idAsignacion } });
    expect(tramoEliminado.horasReales?.toFixed(2)).toBe('4.25');
    expect(tramoEliminado.desasignadaEn).not.toBeNull();
    // Soft delete: la fila del tramo y sus registros siguen ahí.
    expect(await db.registroTiempoTarea.count({ where: { idAsignacion: conHoras.assignment.idAsignacion } })).toBe(1);
    expect((await db.tarea.findUniqueOrThrow({ where: { idTarea: conHoras.task.idTarea } })).eliminadoEn).not.toBeNull();

    await service.finalizeSprint(f.project.idProyecto, f.sprint.idSprint, f.leader.idUsuario);

    // La FK de participación se pierde DESPUÉS de finalizar: es la deriva que
    // el cierre debe detectar y nombrar, no resolver por su cuenta.
    await db.asignacionTarea.update({ where: { idAsignacion: sinFk.assignment.idAsignacion }, data: { idParticipacion: null } });

    // --- El cierre se bloquea citando el tramo sin participación ---
    const bloqueo = await expectStatus(409, () =>
      service.closeSprint(f.project.idProyecto, f.sprint.idSprint, f.leader.idUsuario),
    );
    expect(bloqueo).toMatchObject({ code: 'TRAMOS_SIN_PARTICIPACION' });
    expect((bloqueo as { idsAsignacion: number[] }).idsAsignacion).toEqual([sinFk.assignment.idAsignacion]);
    // Cero escrituras: la atribución ambigua no se resuelve automáticamente.
    expect(await db.horasParticipacion.count({ where: { idSprint: f.sprint.idSprint } })).toBe(0);
    expect(await db.asignacionTarea.count({ where: { idAsignacion: { in: scope.assignmentIds }, reconocidoEn: { not: null } } })).toBe(0);

    // --- Corregida la FK, consolida TAMBIÉN el tramo de la tarea eliminada ---
    await db.asignacionTarea.update({
      where: { idAsignacion: sinFk.assignment.idAsignacion },
      data: { idParticipacion: f.participationB.idParticipacion },
    });

    const cerrado = await service.closeSprint(f.project.idProyecto, f.sprint.idSprint, f.leader.idUsuario);
    expect(cerrado.estado).toBe('CERRADO');

    const consolidadoEliminado = await db.asignacionTarea.findUniqueOrThrow({ where: { idAsignacion: conHoras.assignment.idAsignacion } });
    expect(consolidadoEliminado.reconocidoEn).not.toBeNull();
    // El reporte se conserva exactamente: consolidar no reescribe el importe.
    expect(consolidadoEliminado.horasReales?.toFixed(2)).toBe('4.25');
    const agregadoA = await db.horasParticipacion.findFirstOrThrow({
      where: { idParticipacion: f.participationA.idParticipacion, idSprint: f.sprint.idSprint },
    });
    expect(agregadoA.horasReportadas.toFixed(2)).toBe('4.25');
    expect(agregadoA.estadoHoras).toBe('PENDIENTE');
    const agregadoB = await db.horasParticipacion.findFirstOrThrow({
      where: { idParticipacion: f.participationB.idParticipacion, idSprint: f.sprint.idSprint },
    });
    expect(agregadoB.horasReportadas.toFixed(2)).toBe('2.00');
  });
});
