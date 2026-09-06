import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import { backWithEntries, cleanupFlowAFixture, closedTask, flowAFixture, flowAStack } from './setup/flow-a';
import type { IntegrationCleanupScope } from './setup/cleanup';
import { historicalStack } from './setup/historical-read';
import { createIntegrationUser } from './setup/fixtures';
import { tasksStack } from './setup/tasks-stack';

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

  it('T21-B: la proyección histórica devuelve las contribuciones de tareas eliminadas sin hacerlas operativas ni duplicar totales', async () => {
    const f = await flowAFixture(db, scope, 'CERRADO');
    const { service } = historicalStack(db);
    const { tasks } = tasksStack(db);

    // Una tarea ELIMINADA con DOS tramos del mismo usuario: la reasignación
    // no puede convertirse en dos tareas al contar.
    const eliminada = await closedTask(db, scope, {
      projectId: f.project.idProyecto,
      sprintId: f.sprint.idSprint,
      leaderId: f.leader.idUsuario,
      userId: f.memberA.idUsuario,
      participationId: f.participationA.idParticipacion,
      horasReales: '2.00',
      reconocidoEn: new Date('2026-09-03T10:00:00.000Z'),
      eliminada: true,
    });
    const registroEfectivo = await backWithEntries(db, {
      assignmentId: eliminada.assignment.idAsignacion,
      userId: f.memberA.idUsuario,
      horas: '2.00',
    });
    // Un registro REVOCADO del mismo tramo: se conserva como evidencia.
    const registroRevocado = await backWithEntries(db, {
      assignmentId: eliminada.assignment.idAsignacion,
      userId: f.memberA.idUsuario,
      horas: '1.00',
    });
    await db.registroTiempoTarea.update({
      where: { idRegistroTiempo: registroRevocado.idRegistroTiempo },
      data: { revocadoEn: new Date('2026-09-02T09:00:00.000Z'), revocadoPor: f.memberA.idUsuario },
    });
    // Un ajuste vigente del líder sobre ese tramo.
    const ajuste = await db.ajusteHoraTarea.create({
      data: {
        idAsignacion: eliminada.assignment.idAsignacion,
        deltaHoras: '-0.50',
        horasBase: '2.00',
        justificacion: 'ajuste del líder sobre el tramo eliminado',
        idAutor: f.leader.idUsuario,
      },
    });

    // Segundo tramo de la MISMA tarea eliminada y del mismo usuario.
    const segundoTramo = await db.asignacionTarea.create({
      data: {
        idTarea: eliminada.task.idTarea,
        idUsuario: f.memberA.idUsuario,
        asignadoPor: f.leader.idUsuario,
        idParticipacion: f.participationA.idParticipacion,
        desasignadaEn: new Date('2026-09-04T12:00:00.000Z'),
        horasReales: '3.00',
      },
    });
    scope.assignmentIds = [...(scope.assignmentIds ?? []), segundoTramo.idAsignacion];
    await backWithEntries(db, {
      assignmentId: segundoTramo.idAsignacion,
      userId: f.memberA.idUsuario,
      horas: '3.00',
    });

    for (const [quien, actorId] of [
      ['líder', f.leader.idUsuario],
      ['participante', f.memberA.idUsuario],
    ] as const) {
      const proyeccion = await service.deletedContributions(
        f.project.idProyecto,
        actorId,
        f.sprint.idSprint,
      );

      // Los DOS tramos de la tarea eliminada, con su tarea, usuario y rol
      // histórico por participación.
      expect(proyeccion, quien).toHaveLength(2);
      for (const fila of proyeccion) {
        expect((fila.tarea as { idTarea: number }).idTarea, quien).toBe(eliminada.task.idTarea);
        expect((fila.usuario as { idUsuario: number }).idUsuario, quien).toBe(f.memberA.idUsuario);
        expect((fila.rolHistorico as { idParticipacion: number }).idParticipacion, quien).toBe(
          f.participationA.idParticipacion,
        );
        expect((fila.rolHistorico as { nombreRol: string }).nombreRol, quien).toBe(f.role.nombreRol);
        // Marcada como histórica, con la fecha de eliminación.
        expect(fila.contribucionHistorica, quien).toBe(true);
        expect(fila.eliminadaEn, quien).not.toBeNull();
        expect(fila.asignadaEn, quien).toBeDefined();
        expect(fila.desasignadaEn, quien).not.toBeNull();
        expect(fila.origenReporte, quien).toBe('GRANULAR');
      }

      // El primer tramo trae registros efectivos y revocados, ajustes y el
      // importe consumido; el segundo no se consumió.
      const primero = proyeccion.find(
        (fila) => fila.idAsignacion === eliminada.assignment.idAsignacion,
      )!;
      expect((primero.registrosEfectivos as unknown[]).length, quien).toBe(1);
      expect(
        (primero.registrosEfectivos as Array<{ idRegistroTiempo: number }>)[0].idRegistroTiempo,
        quien,
      ).toBe(registroEfectivo.idRegistroTiempo);
      expect((primero.registrosRevocados as unknown[]).length, quien).toBe(1);
      expect(
        (primero.registrosRevocados as Array<{ idRegistroTiempo: number }>)[0].idRegistroTiempo,
        quien,
      ).toBe(registroRevocado.idRegistroTiempo);
      expect((primero.ajustes as Array<{ idAjusteHora: number }>)[0].idAjusteHora, quien).toBe(
        ajuste.idAjusteHora,
      );
      expect(primero.ajusteVigente, quien).toBe('-0.50');
      expect(primero.cache, quien).toBe('2.00');
      expect(primero.importeConsumido, quien).toBe('2.00');

      const segundo = proyeccion.find((fila) => fila.idAsignacion === segundoTramo.idAsignacion)!;
      expect(segundo.importeConsumido, quien).toBeNull();
      expect(segundo.cache, quien).toBe('3.00');

      // Las HORAS suman los dos tramos, pero las TAREAS distintas son una.
      const horas = proyeccion.reduce((acc, fila) => acc + Number(fila.cache ?? 0), 0);
      expect(horas, quien).toBe(5);
      const tareasDistintas = new Set(
        proyeccion.map((fila) => (fila.tarea as { idTarea: number }).idTarea),
      );
      expect(tareasDistintas.size, quien).toBe(1);
    }

    // Un externo no lee la proyección histórica.
    const externo = await createIntegrationUser(db);
    scope.userIds = [...(scope.userIds ?? []), externo.idUsuario];
    await expectStatus(403, () =>
      service.deletedContributions(f.project.idProyecto, externo.idUsuario, f.sprint.idSprint),
    );

    // El tablero operativo sigue sin la tarea eliminada: leerla no la reabre.
    const tablero = await tasks.findAll(f.project.idProyecto, f.leader.idUsuario);
    expect(
      (tablero as Array<{ idTarea: number }>).some(
        (tarea) => tarea.idTarea === eliminada.task.idTarea,
      ),
    ).toBe(false);
  });
});
