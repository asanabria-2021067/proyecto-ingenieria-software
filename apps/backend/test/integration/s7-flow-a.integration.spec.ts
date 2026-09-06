import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import { backWithEntries, cleanupFlowAFixture, closedTask, flowAFixture, flowAStack } from './setup/flow-a';
import type { IntegrationCleanupScope } from './setup/cleanup';
import { createIntegrationParticipation, createIntegrationUser } from './setup/fixtures';

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

  it('T08-B: la lista de participaciones elegibles se deriva de los tramos e incluye retirados y completados con contribuciones no consumidas', async () => {
    const f = await flowAFixture(db, scope, 'EN_FINALIZACION');
    const { recognition } = flowAStack(db);

    // Un tercer y cuarto miembro: uno RETIRADO y otro COMPLETADO, ambos con
    // contribuciones que nadie ha consumido todavía.
    const retirado = await createIntegrationUser(db);
    const completado = await createIntegrationUser(db);
    f.collect('userIds', [retirado.idUsuario, completado.idUsuario]);
    const participacionRetirado = await createIntegrationParticipation(db, retirado.idUsuario, f.role.idRolProyecto, { estadoParticipacion: 'RETIRADO' });
    const participacionCompletado = await createIntegrationParticipation(db, completado.idUsuario, f.role.idRolProyecto, { estadoParticipacion: 'COMPLETADO' });
    f.collect('participationIds', [participacionRetirado.idParticipacion, participacionCompletado.idParticipacion]);

    const base = {
      projectId: f.project.idProyecto, sprintId: f.sprint.idSprint, leaderId: f.leader.idUsuario,
    };
    // A: participante ACTIVO con horas → elegible.
    await closedTask(db, scope, { ...base, userId: f.memberA.idUsuario, participationId: f.participationA.idParticipacion, horasReales: '3.00' });
    // RETIRADO con horas no consumidas → elegible.
    await closedTask(db, scope, { ...base, userId: retirado.idUsuario, participationId: participacionRetirado.idParticipacion, horasReales: '2.00' });
    // COMPLETADO con horas no consumidas → elegible.
    await closedTask(db, scope, { ...base, userId: completado.idUsuario, participationId: participacionCompletado.idParticipacion, horasReales: '1.00' });
    // B: tramo YA consumido por una salida anticipada → NO elegible.
    await closedTask(db, scope, {
      ...base, userId: f.memberB.idUsuario, participationId: f.participationB.idParticipacion,
      horasReales: '4.00', reconocidoEn: new Date('2026-09-01T08:00:00.000Z'),
    });
    // El participante B no tiene ningún otro tramo, y hay un quinto miembro
    // ACTIVO sin ningún tramo en absoluto.
    const sinTramos = await createIntegrationUser(db);
    f.collect('userIds', [sinTramos.idUsuario]);
    const participacionSinTramos = await createIntegrationParticipation(db, sinTramos.idUsuario, f.role.idRolProyecto, { estadoParticipacion: 'ACTIVO' });
    f.collect('participationIds', [participacionSinTramos.idParticipacion]);

    const elegibles = await db.$transaction((tx) =>
      recognition.listEligibleParticipationsTx(tx, { projectId: f.project.idProyecto, sprintId: f.sprint.idSprint }),
    );

    const esperadas = [
      f.participationA.idParticipacion,
      participacionRetirado.idParticipacion,
      participacionCompletado.idParticipacion,
    ].sort((a, b) => a - b);
    expect(elegibles).toEqual(esperadas);
    // El activo sin tramos no aparece; el consumido por Flow B tampoco.
    expect(elegibles).not.toContain(participacionSinTramos.idParticipacion);
    expect(elegibles).not.toContain(f.participationB.idParticipacion);
    // Enumerar no escribe: ningún estado de participación cambió.
    expect((await db.participacionProyecto.findUniqueOrThrow({ where: { idParticipacion: participacionRetirado.idParticipacion } })).estadoParticipacion).toBe('RETIRADO');
    expect((await db.participacionProyecto.findUniqueOrThrow({ where: { idParticipacion: participacionCompletado.idParticipacion } })).estadoParticipacion).toBe('COMPLETADO');
    expect(await db.horasParticipacion.count({ where: { idSprint: f.sprint.idSprint } })).toBe(0);
  });

  it('T08-C: el reconocimiento marca los tramos con conteo exacto y deja un agregado PENDIENTE con reportadas y propuestas separadas', async () => {
    const f = await flowAFixture(db, scope, 'EN_FINALIZACION');
    const { recognition } = flowAStack(db);
    const base = { projectId: f.project.idProyecto, sprintId: f.sprint.idSprint, leaderId: f.leader.idUsuario };

    // Tres tramos cerrados de A, uno de ellos de una tarea eliminada.
    const t1 = await closedTask(db, scope, { ...base, userId: f.memberA.idUsuario, participationId: f.participationA.idParticipacion, horasReales: '3.00' });
    const t2 = await closedTask(db, scope, { ...base, userId: f.memberA.idUsuario, participationId: f.participationA.idParticipacion, horasReales: '2.00' });
    const t3 = await closedTask(db, scope, { ...base, userId: f.memberA.idUsuario, participationId: f.participationA.idParticipacion, horasReales: '1.50', eliminada: true });
    // Un tramo ABIERTO de A que no debe entrar en el reconocimiento.
    const abierto = await closedTask(db, scope, { ...base, userId: f.memberA.idUsuario, participationId: f.participationA.idParticipacion, horasReales: '9.00', abierta: true });
    // Ajuste vigente de +0.50 sobre t2, con base igual a su caché.
    await db.ajusteHoraTarea.create({
      data: {
        idAsignacion: t2.assignment.idAsignacion,
        deltaHoras: '0.50',
        horasBase: '2.00',
        justificacion: 'media hora verificada de más',
        idAutor: f.leader.idUsuario,
      },
    });

    // Un agregado APROBADA de OTRO Sprint que no debe tocarse.
    const otroSprint = await db.sprint.create({ data: { idProyecto: f.project.idProyecto, numero: 9, estado: 'CERRADO' } });
    f.collect('sprintIds', [otroSprint.idSprint]);
    const intocable = await db.horasParticipacion.create({
      data: {
        idParticipacion: f.participationA.idParticipacion, idSprint: otroSprint.idSprint,
        periodoInicio: new Date('2026-01-01'), periodoFin: new Date('2026-01-31'),
        horasReportadas: '7.00', horasCalculadas: '7.00', horasAprobadas: '7.00', estadoHoras: 'APROBADA',
      },
    });

    const resultado = await db.$transaction((tx) =>
      recognition.recognizeParticipationHours(tx, {
        projectId: f.project.idProyecto, sprintId: f.sprint.idSprint, participationId: f.participationA.idParticipacion,
      }),
    );

    expect(resultado.idsAsignacionesReconocidas.sort()).toEqual(
      [t1.assignment.idAsignacion, t2.assignment.idAsignacion, t3.assignment.idAsignacion].sort(),
    );
    const marcados = await db.asignacionTarea.findMany({
      where: { idAsignacion: { in: resultado.idsAsignacionesReconocidas } },
    });
    // Una sola fecha común para todo el lote.
    const fechas = new Set(marcados.map((fila) => fila.reconocidoEn!.toISOString()));
    expect(fechas.size).toBe(1);
    // El tramo abierto no se marca.
    expect((await db.asignacionTarea.findUniqueOrThrow({ where: { idAsignacion: abierto.assignment.idAsignacion } })).reconocidoEn).toBeNull();

    const agregado = await db.horasParticipacion.findFirstOrThrow({
      where: { idParticipacion: f.participationA.idParticipacion, idSprint: f.sprint.idSprint },
    });
    expect(agregado.estadoHoras).toBe('PENDIENTE');
    // Reportadas = suma de cachés; propuestas = suma de (caché + ajuste vigente).
    expect(agregado.horasReportadas.toFixed(2)).toBe('6.50');
    expect(agregado.horasCalculadas?.toFixed(2)).toBe('7.00');
    // Reconocer NO acredita.
    expect(agregado.horasAprobadas).toBeNull();
    expect(agregado.fechaAprobacion).toBeNull();
    expect(agregado.aprobadoPor).toBeNull();
    expect(agregado.idSprint).not.toBeNull();
    // El agregado del otro Sprint queda intacto.
    expect(await db.horasParticipacion.findUniqueOrThrow({ where: { idRegistroHoras: intocable.idRegistroHoras } })).toEqual(intocable);

    // Participación sin tramos elegibles: no-op real, sin fila cero ficticia.
    const vacio = await db.$transaction((tx) =>
      recognition.recognizeParticipationHours(tx, {
        projectId: f.project.idProyecto, sprintId: f.sprint.idSprint, participationId: f.participationB.idParticipacion,
      }),
    );
    expect(vacio.horasParticipacion).toBeNull();
    expect(await db.horasParticipacion.count({ where: { idParticipacion: f.participationB.idParticipacion } })).toBe(0);

    // Agregado APROBADA del MISMO Sprint: 409 sin escribir.
    await db.horasParticipacion.update({ where: { idRegistroHoras: agregado.idRegistroHoras }, data: { estadoHoras: 'APROBADA' } });
    const nuevo = await closedTask(db, scope, { ...base, userId: f.memberA.idUsuario, participationId: f.participationA.idParticipacion, horasReales: '1.00' });
    await expectStatus(409, () =>
      db.$transaction((tx) =>
        recognition.recognizeParticipationHours(tx, {
          projectId: f.project.idProyecto, sprintId: f.sprint.idSprint, participationId: f.participationA.idParticipacion,
        }),
      ),
    );
    // Cero escrituras: el tramo nuevo sigue sin reconocer y el agregado no cambió.
    expect((await db.asignacionTarea.findUniqueOrThrow({ where: { idAsignacion: nuevo.assignment.idAsignacion } })).reconocidoEn).toBeNull();
    const tras409 = await db.horasParticipacion.findUniqueOrThrow({ where: { idRegistroHoras: agregado.idRegistroHoras } });
    expect(tras409.horasReportadas.toFixed(2)).toBe('6.50');
    expect(tras409.horasCalculadas?.toFixed(2)).toBe('7.00');
    // El Sprint nunca cambia de estado por reconocer.
    expect((await db.sprint.findUniqueOrThrow({ where: { idSprint: f.sprint.idSprint } })).estado).toBe('EN_FINALIZACION');
    expect(await db.horasParticipacion.count({ where: { idSprint: null } })).toBe(0);
  });
});
