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

describeIntegration('S7 Flow A — consolidación de Sprint', () => {
  let db: PrismaClient;
  let scope: IntegrationCleanupScope;
  beforeAll(async () => { db = createIntegrationPrismaClient(); await db.$connect(); });
  beforeEach(() => { scope = {}; });
  afterEach(async () => { vi.restoreAllMocks(); await cleanupFlowAFixture(db, scope); });
  afterAll(async () => { await db.$disconnect(); });

  it('T08-A: finalizeSprint revalida F1-F4 incluyendo tareas eliminadas y transiciona una sola vez', async () => {
    const f = await flowAFixture(db, scope, 'ACTIVO');
    const { service, notifyFinalization } = flowAStack(db);

    // Tramo normal cerrado, con registros que respaldan la caché.
    const normal = await closedTask(db, scope, {
      projectId: f.project.idProyecto, sprintId: f.sprint.idSprint, leaderId: f.leader.idUsuario,
      userId: f.memberA.idUsuario, participationId: f.participationA.idParticipacion, horasReales: '3.00',
    });
    await backWithEntries(db, { assignmentId: normal.assignment.idAsignacion, userId: f.memberA.idUsuario, horas: '3.00' });

    // Tramo cerrado GRANULAR sin registros y con caché nula: la normalización
    // previa debe materializarlo a 0, no dejarlo fuera por ser NULL.
    const vacio = await closedTask(db, scope, {
      projectId: f.project.idProyecto, sprintId: f.sprint.idSprint, leaderId: f.leader.idUsuario,
      userId: f.memberB.idUsuario, participationId: f.participationB.idParticipacion, horasReales: null,
    });

    // Tarea SOFT-DELETED con un tramo todavía ABIERTO: es el caso que F2 debe
    // atrapar y que un filtro de eliminadoEn dejaría pasar.
    const eliminada = await closedTask(db, scope, {
      projectId: f.project.idProyecto, sprintId: f.sprint.idSprint, leaderId: f.leader.idUsuario,
      userId: f.memberA.idUsuario, participationId: f.participationA.idParticipacion,
      horasReales: null, eliminada: true, abierta: true,
    });

    const antes = await db.asignacionTarea.findMany({
      where: { idAsignacion: { in: scope.assignmentIds } },
      orderBy: { idAsignacion: 'asc' },
    });

    const bloqueo = await expectStatus(409, () =>
      service.finalizeSprint(f.project.idProyecto, f.sprint.idSprint, f.leader.idUsuario),
    );
    expect(bloqueo).toMatchObject({ code: 'SPRINT_F2_ASIGNACIONES_ABIERTAS' });
    expect((bloqueo as { idsAsignacion: number[] }).idsAsignacion).toEqual([eliminada.assignment.idAsignacion]);
    // Cero escrituras: ni la normalización previa corrió.
    expect(
      await db.asignacionTarea.findMany({ where: { idAsignacion: { in: scope.assignmentIds } }, orderBy: { idAsignacion: 'asc' } }),
    ).toEqual(antes);
    expect(await db.sprint.findUniqueOrThrow({ where: { idSprint: f.sprint.idSprint } })).toMatchObject({ estado: 'ACTIVO' });
    expect(notifyFinalization).not.toHaveBeenCalled();

    // Se cierra ese tramo y ahora sí puede finalizar.
    await db.asignacionTarea.update({
      where: { idAsignacion: eliminada.assignment.idAsignacion },
      data: { desasignadaEn: new Date('2026-09-03T10:00:00.000Z') },
    });

    const finalizado = await service.finalizeSprint(f.project.idProyecto, f.sprint.idSprint, f.leader.idUsuario);
    expect(finalizado.estado).toBe('EN_FINALIZACION');
    expect(finalizado.fechaFinalizacionIniciada).not.toBeNull();

    // Normalización previa: las cachés granulares vacías quedan en 0.00.
    expect((await db.asignacionTarea.findUniqueOrThrow({ where: { idAsignacion: vacio.assignment.idAsignacion } })).horasReales?.toFixed(2)).toBe('0.00');
    expect((await db.asignacionTarea.findUniqueOrThrow({ where: { idAsignacion: eliminada.assignment.idAsignacion } })).horasReales?.toFixed(2)).toBe('0.00');
    // El tramo con registros conserva exactamente su reporte.
    expect((await db.asignacionTarea.findUniqueOrThrow({ where: { idAsignacion: normal.assignment.idAsignacion } })).horasReales?.toFixed(2)).toBe('3.00');
    // Finalizar NO consume horas ni acredita nada.
    expect(await db.asignacionTarea.count({ where: { idAsignacion: { in: scope.assignmentIds }, reconocidoEn: { not: null } } })).toBe(0);
    expect(await db.horasParticipacion.count({ where: { idSprint: f.sprint.idSprint } })).toBe(0);

    const eventos = await db.bitacoraAuditoria.findMany({
      where: { idUsuario: f.leader.idUsuario, accion: 'SPRINT_FINALIZED' },
    });
    expect(eventos).toHaveLength(1);
    const detalle = eventos[0].detalleJson as { valorNuevo: { predicados: Record<string, number> } };
    expect(detalle.valorNuevo.predicados).toEqual({ f1: 2, f2: 0, f3: 3, f4: 3 });

    // Segunda finalización: 409 y ningún evento ni notificación adicional.
    await expectStatus(409, () =>
      service.finalizeSprint(f.project.idProyecto, f.sprint.idSprint, f.leader.idUsuario),
    );
    expect(await db.bitacoraAuditoria.count({ where: { idUsuario: f.leader.idUsuario, accion: 'SPRINT_FINALIZED' } })).toBe(1);
    expect(notifyFinalization).toHaveBeenCalledTimes(1);
  });
});
