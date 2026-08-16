import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { describeIntegration } from './setup/database';
import {
  createIntegrationUser,
  createIntegrationProject,
  createIntegrationProjectRole,
  createIntegrationParticipation,
  createIntegrationSprint,
  createIntegrationTask,
} from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';
import { PrismaService } from '../../src/prisma/prisma.service';
import { HoursRecognitionService } from '../../src/sprints/hours-recognition.service';

/**
 * SYNC GATE 1 (corrección): wrapper de SOLO TEST que envuelve `$transaction`
 * — deja correr el callback real (recognizeParticipationHours ejecutando
 * escrituras reales contra el `tx` real: marca de reconocidoEn +
 * persistencia de HorasParticipacion) hasta que resuelve, y justo DESPUÉS
 * de que resuelve lanza una excepción de test. Esa excepción hace que la
 * función pasada al `$transaction` REAL de Prisma rechace, así que
 * PostgreSQL hace ROLLBACK real de la transacción completa — incluyendo
 * las escrituras que ya se habían ejecutado. Cero cambios en código de
 * producción (mismo patrón ya usado en
 * sprint-closure.integration.spec.ts, A9).
 */
function wrapWithRollbackAfterRealWrite(realPrisma: PrismaService, injectedError: Error): PrismaService {
  return {
    $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
      realPrisma.$transaction(async (tx) => {
        await callback(tx);
        throw injectedError;
      }),
  } as unknown as PrismaService;
}

/**
 * Integración real A6: demuestra que la primitiva persistida por A5.1
 * (`AsignacionTarea.reconocidoEn`) permite marcar un tramo como reconocido
 * de forma atómica e idempotente en PostgreSQL real, y que
 * `HoursRecognitionService.calculateRecognizableHours` (A5.2, sin
 * modificar) refleja correctamente ese cambio de estado — cerrando la
 * mitad que A5 dejaba pendiente para SYNC GATE 1: A5 calcula, A6 demuestra
 * que la marca en sí es segura contra doble consumo.
 *
 * No se crea ningún servicio productivo de "marcar reconocido": el helper
 * `markAssignmentRecognized` de más abajo es local a este archivo,
 * deliberadamente, porque A6 solo prueba la primitiva de persistencia —
 * quién la invoque en producción (A9/B10) es una decisión de una tarea
 * futura.
 *
 * Se activa solo con `INTEGRATION_DATABASE_URL`; sin esa variable, SKIP
 * limpio (describeIntegration), mismo patrón que el resto de
 * test/integration/.
 */
function createIntegrationPrismaService(): PrismaService {
  return new PrismaService({
    datasources: { db: { url: process.env.INTEGRATION_DATABASE_URL } },
  });
}

/**
 * Primitiva de persistencia bajo prueba: un `updateMany` condicionado por
 * `reconocidoEn: null` es atómico en PostgreSQL — dos ejecuciones
 * concurrentes o secuenciales sobre la misma fila nunca pueden marcarla
 * "reconocida" dos veces. `count === 1` significa que ESTA llamada ganó la
 * marca; `count === 0` significa que la fila ya estaba reconocida (por
 * esta misma llamada previa o por cualquier otro proceso).
 */
async function markAssignmentRecognized(
  prisma: PrismaService,
  idAsignacion: number,
  recognizedAt: Date,
) {
  return prisma.asignacionTarea.updateMany({
    where: {
      idAsignacion,
      reconocidoEn: null,
    },
    data: {
      reconocidoEn: recognizedAt,
    },
  });
}

describeIntegration(
  'HoursRecognitionService — idempotencia real de reconocidoEn (SYNC GATE 1 / A6)',
  () => {
    let prisma: PrismaService;
    let hoursRecognition: HoursRecognitionService;
    let scope: IntegrationCleanupScope;
    let horasParticipacionIds: number[];

    beforeAll(async () => {
      prisma = createIntegrationPrismaService();
      hoursRecognition = new HoursRecognitionService(prisma);
      await prisma.$connect();
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    beforeEach(() => {
      scope = {};
      horasParticipacionIds = [];
    });

    afterEach(async () => {
      // HorasParticipacion no forma parte de IntegrationCleanupScope (T15):
      // se limpia manualmente ANTES de cleanupIntegrationFixtures (mismo
      // patrón que A7.1/A8/A9), porque
      // horas_participacion_id_participacion_fkey es ON DELETE RESTRICT.
      if (horasParticipacionIds.length > 0) {
        await prisma.horasParticipacion.deleteMany({
          where: { idRegistroHoras: { in: horasParticipacionIds } },
        });
      }
      await cleanupIntegrationFixtures(prisma, scope);
    });

    it('un mismo tramo solo puede reconocerse una vez: la segunda marca es un no-op y el total no vuelve a cambiar', async () => {
      const leader = await createIntegrationUser(prisma);
      scope.userIds = [leader.idUsuario];
      const project = await createIntegrationProject(prisma, leader.idUsuario);
      scope.projectIds = [project.idProyecto];
      const role = await createIntegrationProjectRole(prisma, project.idProyecto);
      scope.roleIds = [role.idRolProyecto];
      const participation = await createIntegrationParticipation(
        prisma,
        leader.idUsuario,
        role.idRolProyecto,
        { estadoParticipacion: 'ACTIVO' },
      );
      scope.participationIds = [participation.idParticipacion];
      const sprint = await createIntegrationSprint(prisma, project.idProyecto, {
        estado: 'ACTIVO',
      });
      scope.sprintIds = [sprint.idSprint];
      const task = await createIntegrationTask(prisma, project.idProyecto, leader.idUsuario, sprint.idSprint);
      scope.taskIds = [task.idTarea];

      // Tramo cerrado, con horas reales, no reconocido — el fixture mínimo
      // elegible para calculateRecognizableHours.
      const assignment = await prisma.asignacionTarea.create({
        data: {
          idTarea: task.idTarea,
          idUsuario: leader.idUsuario,
          asignadoPor: leader.idUsuario,
          idParticipacion: participation.idParticipacion,
          desasignadaEn: new Date('2026-01-01T00:00:00.000Z'),
          horasReales: 3,
        },
      });
      scope.assignmentIds = [assignment.idAsignacion];

      const input = {
        projectId: project.idProyecto,
        sprintId: sprint.idSprint,
        participationId: participation.idParticipacion,
      };

      // --- ESTADO INICIAL ---
      const initialRow = await prisma.asignacionTarea.findUniqueOrThrow({
        where: { idAsignacion: assignment.idAsignacion },
      });
      expect(initialRow.reconocidoEn).toBeNull();

      const totalBefore = await hoursRecognition.calculateRecognizableHours(input);
      expect(totalBefore).toBe(3);

      // --- PRIMER RECONOCIMIENTO ---
      const firstRecognizedAt = new Date('2026-06-01T10:00:00.000Z');
      const first = await markAssignmentRecognized(prisma, assignment.idAsignacion, firstRecognizedAt);
      expect(first.count).toBe(1);

      const afterFirstRow = await prisma.asignacionTarea.findUniqueOrThrow({
        where: { idAsignacion: assignment.idAsignacion },
      });
      expect(afterFirstRow.reconocidoEn).not.toBeNull();
      expect(afterFirstRow.reconocidoEn?.getTime()).toBe(firstRecognizedAt.getTime());

      const totalAfterFirstMark = await hoursRecognition.calculateRecognizableHours(input);
      expect(totalAfterFirstMark).toBe(0);

      // --- SEGUNDO RECONOCIMIENTO DEL MISMO TRAMO (no-op esperado) ---
      const secondAttemptAt = new Date('2026-06-02T10:00:00.000Z');
      const second = await markAssignmentRecognized(prisma, assignment.idAsignacion, secondAttemptAt);
      expect(second.count).toBe(0);

      const afterSecondRow = await prisma.asignacionTarea.findUniqueOrThrow({
        where: { idAsignacion: assignment.idAsignacion },
      });
      // El timestamp de la primera marca NUNCA se reemplaza por el segundo intento.
      expect(afterSecondRow.reconocidoEn?.getTime()).toBe(firstRecognizedAt.getTime());
      expect(afterSecondRow.reconocidoEn?.getTime()).not.toBe(secondAttemptAt.getTime());

      const totalAfterSecondMark = await hoursRecognition.calculateRecognizableHours(input);
      expect(totalAfterSecondMark).toBe(0);
    });

    it('multi-tramo: reconocer un tramo no consume ni afecta el otro tramo de la misma participación', async () => {
      const leader = await createIntegrationUser(prisma);
      scope.userIds = [leader.idUsuario];
      const project = await createIntegrationProject(prisma, leader.idUsuario);
      scope.projectIds = [project.idProyecto];
      const role = await createIntegrationProjectRole(prisma, project.idProyecto);
      scope.roleIds = [role.idRolProyecto];
      const participation = await createIntegrationParticipation(
        prisma,
        leader.idUsuario,
        role.idRolProyecto,
        { estadoParticipacion: 'ACTIVO' },
      );
      scope.participationIds = [participation.idParticipacion];
      const sprint = await createIntegrationSprint(prisma, project.idProyecto, {
        estado: 'ACTIVO',
      });
      scope.sprintIds = [sprint.idSprint];
      const taskA = await createIntegrationTask(prisma, project.idProyecto, leader.idUsuario, sprint.idSprint);
      const taskB = await createIntegrationTask(prisma, project.idProyecto, leader.idUsuario, sprint.idSprint);
      scope.taskIds = [taskA.idTarea, taskB.idTarea];

      const tramoA = await prisma.asignacionTarea.create({
        data: {
          idTarea: taskA.idTarea,
          idUsuario: leader.idUsuario,
          asignadoPor: leader.idUsuario,
          idParticipacion: participation.idParticipacion,
          desasignadaEn: new Date('2026-01-01T00:00:00.000Z'),
          horasReales: 3,
        },
      });
      const tramoB = await prisma.asignacionTarea.create({
        data: {
          idTarea: taskB.idTarea,
          idUsuario: leader.idUsuario,
          asignadoPor: leader.idUsuario,
          idParticipacion: participation.idParticipacion,
          desasignadaEn: new Date('2026-01-02T00:00:00.000Z'),
          horasReales: 2,
        },
      });
      scope.assignmentIds = [tramoA.idAsignacion, tramoB.idAsignacion];

      const input = {
        projectId: project.idProyecto,
        sprintId: sprint.idSprint,
        participationId: participation.idParticipacion,
      };

      const totalInitial = await hoursRecognition.calculateRecognizableHours(input);
      expect(totalInitial).toBe(5);

      // --- reconoce únicamente el tramo A ---
      const firstAMark = await markAssignmentRecognized(
        prisma,
        tramoA.idAsignacion,
        new Date('2026-06-01T10:00:00.000Z'),
      );
      expect(firstAMark.count).toBe(1);

      const totalAfterAFirstMark = await hoursRecognition.calculateRecognizableHours(input);
      expect(totalAfterAFirstMark).toBe(2);

      const rowA = await prisma.asignacionTarea.findUniqueOrThrow({
        where: { idAsignacion: tramoA.idAsignacion },
      });
      const rowB = await prisma.asignacionTarea.findUniqueOrThrow({
        where: { idAsignacion: tramoB.idAsignacion },
      });
      expect(rowA.reconocidoEn).not.toBeNull();
      expect(rowB.reconocidoEn).toBeNull();

      // --- reconocer A otra vez: no-op, B sigue disponible ---
      const secondAMark = await markAssignmentRecognized(
        prisma,
        tramoA.idAsignacion,
        new Date('2026-06-02T10:00:00.000Z'),
      );
      expect(secondAMark.count).toBe(0);

      const totalAfterASecondMark = await hoursRecognition.calculateRecognizableHours(input);
      expect(totalAfterASecondMark).toBe(2);
    });

    it('SYNC GATE 1: recognizeParticipationHours productivo — primera invocación reconoce y persiste, segunda es no-op real', async () => {
      const leader = await createIntegrationUser(prisma);
      scope.userIds = [leader.idUsuario];
      const project = await createIntegrationProject(prisma, leader.idUsuario);
      scope.projectIds = [project.idProyecto];
      const role = await createIntegrationProjectRole(prisma, project.idProyecto);
      scope.roleIds = [role.idRolProyecto];
      const participation = await createIntegrationParticipation(
        prisma,
        leader.idUsuario,
        role.idRolProyecto,
        { estadoParticipacion: 'ACTIVO' },
      );
      scope.participationIds = [participation.idParticipacion];
      const sprint = await createIntegrationSprint(prisma, project.idProyecto, { estado: 'ACTIVO' });
      scope.sprintIds = [sprint.idSprint];
      const taskA = await createIntegrationTask(prisma, project.idProyecto, leader.idUsuario, sprint.idSprint);
      const taskB = await createIntegrationTask(prisma, project.idProyecto, leader.idUsuario, sprint.idSprint);
      scope.taskIds = [taskA.idTarea, taskB.idTarea];

      const tramoA = await prisma.asignacionTarea.create({
        data: {
          idTarea: taskA.idTarea,
          idUsuario: leader.idUsuario,
          asignadoPor: leader.idUsuario,
          idParticipacion: participation.idParticipacion,
          desasignadaEn: new Date('2026-01-01T00:00:00.000Z'),
          horasReales: 3,
        },
      });
      const tramoB = await prisma.asignacionTarea.create({
        data: {
          idTarea: taskB.idTarea,
          idUsuario: leader.idUsuario,
          asignadoPor: leader.idUsuario,
          idParticipacion: participation.idParticipacion,
          desasignadaEn: new Date('2026-01-02T00:00:00.000Z'),
          horasReales: 2,
        },
      });
      scope.assignmentIds = [tramoA.idAsignacion, tramoB.idAsignacion];

      const input = {
        projectId: project.idProyecto,
        sprintId: sprint.idSprint,
        participationId: participation.idParticipacion,
      };

      // --- PRIMERA INVOCACIÓN productiva, dentro de una transacción real ---
      const primero = await prisma.$transaction((tx) =>
        hoursRecognition.recognizeParticipationHours(tx, input),
      );

      expect(primero.horasReconocidas).toBe(5);
      expect(primero.idsAsignacionesReconocidas.sort()).toEqual(
        [tramoA.idAsignacion, tramoB.idAsignacion].sort(),
      );
      expect(primero.horasParticipacion).not.toBeNull();
      horasParticipacionIds.push(primero.horasParticipacion!.idRegistroHoras);

      const rowAAfter = await prisma.asignacionTarea.findUniqueOrThrow({
        where: { idAsignacion: tramoA.idAsignacion },
      });
      const rowBAfter = await prisma.asignacionTarea.findUniqueOrThrow({
        where: { idAsignacion: tramoB.idAsignacion },
      });
      expect(rowAAfter.reconocidoEn).not.toBeNull();
      expect(rowBAfter.reconocidoEn).not.toBeNull();

      const horasRow = await prisma.horasParticipacion.findUniqueOrThrow({
        where: { idRegistroHoras: primero.horasParticipacion!.idRegistroHoras },
      });
      expect(horasRow.idParticipacion).toBe(participation.idParticipacion);
      expect(horasRow.idSprint).toBe(sprint.idSprint);
      expect(Number(horasRow.horasCalculadas)).toBe(5);

      // --- SEGUNDA INVOCACIÓN: los mismos tramos ya están reconocidos ---
      // (excluidos por reconocidoEn IS NOT NULL, el mismo filtro que A5) —
      // debe ser un no-op real, sin duplicar horas ni tocar la fila.
      const segundo = await prisma.$transaction((tx) =>
        hoursRecognition.recognizeParticipationHours(tx, input),
      );

      expect(segundo).toEqual({
        horasReconocidas: 0,
        idsAsignacionesReconocidas: [],
        horasParticipacion: null,
      });

      const horasRowSinCambios = await prisma.horasParticipacion.findUniqueOrThrow({
        where: { idRegistroHoras: primero.horasParticipacion!.idRegistroHoras },
      });
      expect(Number(horasRowSinCambios.horasCalculadas)).toBe(5);
    });

    it('SYNC GATE 1: recognizeParticipationHours acumula (increment) cuando aparecen tramos nuevos en una invocación posterior', async () => {
      const leader = await createIntegrationUser(prisma);
      scope.userIds = [leader.idUsuario];
      const project = await createIntegrationProject(prisma, leader.idUsuario);
      scope.projectIds = [project.idProyecto];
      const role = await createIntegrationProjectRole(prisma, project.idProyecto);
      scope.roleIds = [role.idRolProyecto];
      const participation = await createIntegrationParticipation(
        prisma,
        leader.idUsuario,
        role.idRolProyecto,
        { estadoParticipacion: 'ACTIVO' },
      );
      scope.participationIds = [participation.idParticipacion];
      const sprint = await createIntegrationSprint(prisma, project.idProyecto, { estado: 'ACTIVO' });
      scope.sprintIds = [sprint.idSprint];
      const taskA = await createIntegrationTask(prisma, project.idProyecto, leader.idUsuario, sprint.idSprint);
      scope.taskIds = [taskA.idTarea];

      const tramoA = await prisma.asignacionTarea.create({
        data: {
          idTarea: taskA.idTarea,
          idUsuario: leader.idUsuario,
          asignadoPor: leader.idUsuario,
          idParticipacion: participation.idParticipacion,
          desasignadaEn: new Date('2026-01-01T00:00:00.000Z'),
          horasReales: 3,
        },
      });
      scope.assignmentIds = [tramoA.idAsignacion];

      const input = {
        projectId: project.idProyecto,
        sprintId: sprint.idSprint,
        participationId: participation.idParticipacion,
      };

      const primero = await prisma.$transaction((tx) =>
        hoursRecognition.recognizeParticipationHours(tx, input),
      );
      expect(primero.horasReconocidas).toBe(3);
      horasParticipacionIds.push(primero.horasParticipacion!.idRegistroHoras);

      // Aparece un segundo tramo elegible DESPUÉS del primer reconocimiento
      // (p. ej. el líder cerró otro tramo más tarde).
      const taskB = await createIntegrationTask(prisma, project.idProyecto, leader.idUsuario, sprint.idSprint);
      scope.taskIds!.push(taskB.idTarea);
      const tramoB = await prisma.asignacionTarea.create({
        data: {
          idTarea: taskB.idTarea,
          idUsuario: leader.idUsuario,
          asignadoPor: leader.idUsuario,
          idParticipacion: participation.idParticipacion,
          desasignadaEn: new Date('2026-02-01T00:00:00.000Z'),
          horasReales: 4,
        },
      });
      scope.assignmentIds!.push(tramoB.idAsignacion);

      const segundo = await prisma.$transaction((tx) =>
        hoursRecognition.recognizeParticipationHours(tx, input),
      );

      expect(segundo.horasReconocidas).toBe(4);
      expect(segundo.idsAsignacionesReconocidas).toEqual([tramoB.idAsignacion]);
      // MISMA fila (idRegistroHoras) — se incrementó, no se creó una segunda.
      expect(segundo.horasParticipacion!.idRegistroHoras).toBe(primero.horasParticipacion!.idRegistroHoras);

      const horasRowFinal = await prisma.horasParticipacion.findUniqueOrThrow({
        where: { idRegistroHoras: primero.horasParticipacion!.idRegistroHoras },
      });
      // 3 (primera invocación) + 4 (segunda) = 7 — el total previo se
      // conserva y se ACUMULA, nunca se sobrescribe.
      expect(Number(horasRowFinal.horasCalculadas)).toBe(7);

      const rowCount = await prisma.horasParticipacion.count({
        where: { idParticipacion: participation.idParticipacion, idSprint: sprint.idSprint },
      });
      expect(rowCount).toBe(1);
    });

    it('SYNC GATE 1: rollback real — una excepción inyectada DESPUÉS de las escrituras reales revierte AsignacionTarea.reconocidoEn y HorasParticipacion', async () => {
      const leader = await createIntegrationUser(prisma);
      scope.userIds = [leader.idUsuario];
      const project = await createIntegrationProject(prisma, leader.idUsuario);
      scope.projectIds = [project.idProyecto];
      const role = await createIntegrationProjectRole(prisma, project.idProyecto);
      scope.roleIds = [role.idRolProyecto];
      const participation = await createIntegrationParticipation(
        prisma,
        leader.idUsuario,
        role.idRolProyecto,
        { estadoParticipacion: 'ACTIVO' },
      );
      scope.participationIds = [participation.idParticipacion];
      const sprint = await createIntegrationSprint(prisma, project.idProyecto, { estado: 'ACTIVO' });
      scope.sprintIds = [sprint.idSprint];
      const task = await createIntegrationTask(prisma, project.idProyecto, leader.idUsuario, sprint.idSprint);
      scope.taskIds = [task.idTarea];

      const tramo = await prisma.asignacionTarea.create({
        data: {
          idTarea: task.idTarea,
          idUsuario: leader.idUsuario,
          asignadoPor: leader.idUsuario,
          idParticipacion: participation.idParticipacion,
          desasignadaEn: new Date('2026-01-01T00:00:00.000Z'),
          horasReales: 6,
        },
      });
      scope.assignmentIds = [tramo.idAsignacion];

      const input = {
        projectId: project.idProyecto,
        sprintId: sprint.idSprint,
        participationId: participation.idParticipacion,
      };

      const injectedError = new Error('SYNC GATE 1 rollback test: fallo inyectado DESPUÉS de la escritura real');
      const rollbackPrisma = wrapWithRollbackAfterRealWrite(prisma, injectedError);

      await expect(
        rollbackPrisma.$transaction((tx) => hoursRecognition.recognizeParticipationHours(tx, input)),
      ).rejects.toBe(injectedError);

      // Consulta con el cliente REAL, fuera de la transacción que hizo
      // rollback: si las escrituras hubieran sobrevivido, esto las vería.
      const rowTrasRollback = await prisma.asignacionTarea.findUniqueOrThrow({
        where: { idAsignacion: tramo.idAsignacion },
      });
      expect(rowTrasRollback.reconocidoEn).toBeNull();

      const totalTrasRollback = await hoursRecognition.calculateRecognizableHours(input);
      expect(totalTrasRollback).toBe(6);

      const filasHorasParticipacion = await prisma.horasParticipacion.count({
        where: { idParticipacion: participation.idParticipacion, idSprint: sprint.idSprint },
      });
      expect(filasHorasParticipacion).toBe(0);
    });
  },
);
