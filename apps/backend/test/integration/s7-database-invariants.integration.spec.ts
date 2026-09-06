import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import type { Prisma, PrismaClient } from '@prisma/client';
import { EstadoSprint, OrigenReporteTramo } from '@prisma/client';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';
import {
  createIntegrationParticipation,
  createIntegrationProject,
  createIntegrationProjectRole,
  createIntegrationSprint,
  createIntegrationTask,
  createIntegrationTaskAssignment,
  createIntegrationUser,
} from './setup/fixtures';

/**
 * T38 — invariantes SQL manuales del Sprint 7 (06 v2 §36 y §47), una
 * subdivisión por migración M1…M6. Cada contraejemplo se escribe con SQL
 * directo dentro de una transacción propia que revierte, y se afirma por
 * NOMBRE de constraint para que un CHECK renombrado o ausente falle en voz
 * alta. Los CHECK NOT VALID de tablas pobladas no se validan aquí: solo se
 * demuestra que rechazan filas nuevas o modificadas.
 */

type RawStatement = (tx: Prisma.TransactionClient) => Promise<unknown>;

async function expectCheckViolation(
  prisma: PrismaClient,
  constraint: string,
  statement: RawStatement,
): Promise<void> {
  const outcome = await prisma
    .$transaction(async (tx) => {
      await statement(tx);
    })
    .then(
      () => null,
      (error: unknown) => error,
    );
  expect(outcome, `se esperaba una violación de ${constraint}`).toBeInstanceOf(Error);
  expect(String((outcome as Error).message)).toContain(`check constraint "${constraint}"`);
}

describeIntegration('S7 database invariants (T38)', () => {
  let prisma: PrismaClient;
  let scope: IntegrationCleanupScope;
  let hoursIds: number[];
  let recordIds: number[];

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    scope = {};
    hoursIds = [];
    recordIds = [];
  });

  afterEach(async () => {
    if (recordIds.length > 0) {
      await prisma.registroTiempoTarea.deleteMany({ where: { idRegistroTiempo: { in: recordIds } } });
    }
    if (hoursIds.length > 0) {
      await prisma.horasParticipacion.deleteMany({ where: { idRegistroHoras: { in: hoursIds } } });
    }
    await cleanupIntegrationFixtures(prisma, scope);
  });

  async function seedAssignmentWithHours() {
    const leader = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario];
    const project = await createIntegrationProject(prisma, leader.idUsuario);
    scope.projectIds = [project.idProyecto];
    const role = await createIntegrationProjectRole(prisma, project.idProyecto);
    scope.roleIds = [role.idRolProyecto];
    const participation = await createIntegrationParticipation(prisma, leader.idUsuario, role.idRolProyecto);
    scope.participationIds = [participation.idParticipacion];
    const sprint = await createIntegrationSprint(prisma, project.idProyecto, { estado: EstadoSprint.ACTIVO });
    scope.sprintIds = [sprint.idSprint];
    const task = await createIntegrationTask(prisma, project.idProyecto, leader.idUsuario, sprint.idSprint, {
      idRolProyecto: role.idRolProyecto,
    });
    scope.taskIds = [task.idTarea];
    const created = await createIntegrationTaskAssignment(prisma, task.idTarea, leader.idUsuario, leader.idUsuario);
    scope.assignmentIds = [created.idAsignacion];

    const assignment = await prisma.asignacionTarea.update({
      where: { idAsignacion: created.idAsignacion },
      data: { idParticipacion: participation.idParticipacion, horasReales: '2.50' },
    });
    const hours = await prisma.horasParticipacion.create({
      data: {
        idParticipacion: participation.idParticipacion,
        idSprint: sprint.idSprint,
        periodoInicio: new Date('2026-09-01T00:00:00.000Z'),
        periodoFin: new Date('2026-09-30T00:00:00.000Z'),
        horasReportadas: '2.50',
        horasCalculadas: '2.50',
      },
    });
    hoursIds.push(hours.idRegistroHoras);

    return { leader, assignment, hours };
  }

  it('T38-A: CK04, CK05 y CK31 rechazan cache negativa, LEGACY sin importe y horas de participación negativas', async () => {
    const { assignment, hours } = await seedAssignmentWithHours();
    const assignmentId = assignment.idAsignacion;
    const hoursId = hours.idRegistroHoras;

    // Cuatro contraejemplos directos, cada uno en su propia transacción revertida.
    await expectCheckViolation(
      prisma,
      's7_ck_04',
      (tx) => tx.$executeRaw`UPDATE asignacion_tarea SET horas_reales = -1 WHERE id_asignacion = ${assignmentId}`,
    );
    await expectCheckViolation(
      prisma,
      's7_ck_05',
      (tx) =>
        tx.$executeRaw`UPDATE asignacion_tarea SET origen_reporte = 'LEGACY', horas_reales = NULL WHERE id_asignacion = ${assignmentId}`,
    );
    await expectCheckViolation(
      prisma,
      's7_ck_31',
      (tx) =>
        tx.$executeRaw`UPDATE horas_participacion SET horas_reportadas = -1 WHERE id_registro_horas = ${hoursId}`,
    );
    await expectCheckViolation(
      prisma,
      's7_ck_31',
      (tx) =>
        tx.$executeRaw`UPDATE horas_participacion SET horas_calculadas = -1 WHERE id_registro_horas = ${hoursId}`,
    );

    // Ninguna fila queda modificada tras los rechazos.
    const untouchedAssignment = await prisma.asignacionTarea.findUniqueOrThrow({
      where: { idAsignacion: assignmentId },
    });
    expect(Number(untouchedAssignment.horasReales)).toBe(2.5);
    expect(untouchedAssignment.origenReporte).toBe(OrigenReporteTramo.GRANULAR);
    const untouchedHours = await prisma.horasParticipacion.findUniqueOrThrow({
      where: { idRegistroHoras: hoursId },
    });
    expect(Number(untouchedHours.horasReportadas)).toBe(2.5);
    expect(Number(untouchedHours.horasCalculadas)).toBe(2.5);
    expect(untouchedHours.horasAprobadas).toBeNull();

    // Los valores límite válidos se aceptan.
    await prisma.$executeRaw`UPDATE asignacion_tarea SET horas_reales = 0 WHERE id_asignacion = ${assignmentId}`;
    await prisma.$executeRaw`UPDATE horas_participacion SET horas_calculadas = NULL, horas_aprobadas = NULL WHERE id_registro_horas = ${hoursId}`;
    const boundaryAssignment = await prisma.asignacionTarea.findUniqueOrThrow({
      where: { idAsignacion: assignmentId },
    });
    expect(Number(boundaryAssignment.horasReales)).toBe(0);
    const boundaryHours = await prisma.horasParticipacion.findUniqueOrThrow({
      where: { idRegistroHoras: hoursId },
    });
    expect(boundaryHours.horasCalculadas).toBeNull();
    expect(boundaryHours.horasAprobadas).toBeNull();
  });
  it('T38-B: CK01, CK02 y CK03 rechazan horas no positivas, revocación incoherente y revocador distinto del autor', async () => {
    const { leader, assignment } = await seedAssignmentWithHours();
    const authorId = leader.idUsuario;
    const assignmentId = assignment.idAsignacion;
    const otherUser = await createIntegrationUser(prisma);
    scope.userIds = [...(scope.userIds ?? []), otherUser.idUsuario];

    // Registro efectivo de referencia del autor, con nota y justificación.
    const record = await prisma.registroTiempoTarea.create({
      data: {
        idAsignacion: assignmentId,
        idUsuario: authorId,
        horas: '1.25',
        fecha: new Date('2026-09-02T00:00:00.000Z'),
        nota: 'nota de referencia',
        justificacionExceso: 'cruza la estimación de la tarea',
      },
    });
    recordIds.push(record.idRegistroTiempo);
    const recordId = record.idRegistroTiempo;

    // Cinco contraejemplos, cada uno en su propia transacción revertida.
    await expectCheckViolation(
      prisma,
      's7_ck_01',
      (tx) =>
        tx.$executeRaw`INSERT INTO registro_tiempo_tarea (id_asignacion, id_usuario, horas, fecha) VALUES (${assignmentId}, ${authorId}, 0, DATE '2026-09-03')`,
    );
    await expectCheckViolation(
      prisma,
      's7_ck_01',
      (tx) =>
        tx.$executeRaw`INSERT INTO registro_tiempo_tarea (id_asignacion, id_usuario, horas, fecha) VALUES (${assignmentId}, ${authorId}, -2, DATE '2026-09-03')`,
    );
    await expectCheckViolation(
      prisma,
      's7_ck_02',
      (tx) => tx.$executeRaw`UPDATE registro_tiempo_tarea SET revocado_en = NOW() WHERE id_registro_tiempo = ${recordId}`,
    );
    await expectCheckViolation(
      prisma,
      's7_ck_02',
      (tx) =>
        tx.$executeRaw`UPDATE registro_tiempo_tarea SET revocado_por = ${authorId} WHERE id_registro_tiempo = ${recordId}`,
    );
    await expectCheckViolation(
      prisma,
      's7_ck_03',
      (tx) =>
        tx.$executeRaw`UPDATE registro_tiempo_tarea SET revocado_en = NOW(), revocado_por = ${otherUser.idUsuario} WHERE id_registro_tiempo = ${recordId}`,
    );

    // Tras los rechazos el registro sigue efectivo e intacto.
    const untouched = await prisma.registroTiempoTarea.findUniqueOrThrow({ where: { idRegistroTiempo: recordId } });
    expect(untouched.revocadoEn).toBeNull();
    expect(untouched.revocadoPor).toBeNull();
    expect(await prisma.registroTiempoTarea.count({ where: { idAsignacion: assignmentId } })).toBe(1);

    // La revocación coherente (fecha + revocador = autor) se acepta y conserva importe, fecha, nota y justificación.
    await prisma.$executeRaw`UPDATE registro_tiempo_tarea SET revocado_en = NOW(), revocado_por = ${authorId} WHERE id_registro_tiempo = ${recordId}`;
    const revoked = await prisma.registroTiempoTarea.findUniqueOrThrow({ where: { idRegistroTiempo: recordId } });
    expect(revoked.revocadoEn).not.toBeNull();
    expect(revoked.revocadoPor).toBe(authorId);
    expect(Number(revoked.horas)).toBe(1.25);
    expect(revoked.fecha.toISOString()).toBe('2026-09-02T00:00:00.000Z');
    expect(revoked.nota).toBe('nota de referencia');
    expect(revoked.justificacionExceso).toBe('cruza la estimación de la tarea');
  });
});
