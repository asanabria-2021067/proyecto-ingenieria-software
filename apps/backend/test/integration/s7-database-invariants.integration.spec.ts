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
  });

  afterEach(async () => {
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

    return { assignment, hours };
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
});
