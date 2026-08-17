import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';
import {
  createIntegrationParticipation,
  createIntegrationProject,
  createIntegrationProjectRole,
  createIntegrationSprint,
  createIntegrationTask,
  createIntegrationUser,
} from './setup/fixtures';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ExitRequestsAuthorizationService } from '../../src/exit-requests/exit-requests.authorization.service';
import { ExitRequestsContextService } from '../../src/exit-requests/exit-requests.context.service';
import { ExitRequestsService } from '../../src/exit-requests/exit-requests.service';
import { HoursRecognitionService } from '../../src/sprints/hours-recognition.service';
import { SprintsContextService } from '../../src/sprints/sprints-context.service';
import { TasksAuthorizationService } from '../../src/tasks/tasks-authorization.service';
import { TasksContextService } from '../../src/tasks/tasks-context.service';
import { TasksRelationsService } from '../../src/tasks/tasks-relations.service';
import { TasksService } from '../../src/tasks/tasks.service';

/**
 * X2 — regresión cross-flow: ciclo de vida completo de una salida de
 * proyecto (B5 PREPARACION con tareas activas -> B2 cierre de tramos -> B7
 * PENDIENTE_LIDER -> B9 aprobación + retiro MULTIROL completo) y su efecto
 * real de autorización: el colaborador retirado pierde acceso a un
 * endpoint de proyecto genérico (TasksService.findAll, protegido por
 * TasksAuthorizationService.assertCanListProjectTasks ->
 * TasksContextService.assertActiveProjectParticipant), mientras que su
 * participación ACTIVO en un segundo proyecto de control permanece intacta
 * (aislamiento cross-project). Contra PostgreSQL real — ningún mock de
 * Prisma, ninguna fila de estado terminal (APROBADA/RETIRADO) insertada a
 * mano para saltarse el comportamiento real de las transiciones.
 */

function makeTasksService(prisma: PrismaClient): TasksService {
  const prismaService = prisma as unknown as PrismaService;
  const tasksContext = new TasksContextService(prismaService);
  return new TasksService(
    prismaService,
    new TasksAuthorizationService(tasksContext),
    new TasksRelationsService(prismaService, tasksContext),
    {
      notifyFromTemplate: vi.fn(),
      notifyRoleMembers: vi.fn(),
      notifyUsers: vi.fn(),
    } as unknown as NotificationsService,
    tasksContext,
  );
}

function makeExitRequestsService(prisma: PrismaClient): ExitRequestsService {
  const prismaService = prisma as unknown as PrismaService;
  const context = new ExitRequestsContextService(prismaService);
  return new ExitRequestsService(
    prismaService,
    { notifyFromTemplate: vi.fn() } as unknown as NotificationsService,
    new ExitRequestsAuthorizationService(context),
    context,
    new HoursRecognitionService(prismaService),
    new SprintsContextService(prismaService),
  );
}

function longProgressContent(label: string): string {
  return `${label} ${'avance verificado contra PostgreSQL real '.repeat(7)}`;
}

describeIntegration(
  'X2 regresión cross-flow: ciclo de vida completo de salida (PREPARACION -> PENDIENTE_LIDER -> APROBADA) y revocación real de acceso',
  () => {
    let prisma: PrismaClient;
    let tasksService: TasksService;
    let exitRequestsService: ExitRequestsService;
    let scope: IntegrationCleanupScope;
    let solicitudIds: number[];
    let horasParticipacionIds: number[];

    beforeAll(async () => {
      prisma = createIntegrationPrismaClient();
      tasksService = makeTasksService(prisma);
      exitRequestsService = makeExitRequestsService(prisma);
      await prisma.$connect();
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    beforeEach(() => {
      scope = {};
      solicitudIds = [];
      horasParticipacionIds = [];
    });

    afterEach(async () => {
      const assignmentIds = scope.assignmentIds ?? [];
      if (assignmentIds.length > 0) {
        await prisma.registroAvanceAsignacion.deleteMany({
          where: { idAsignacion: { in: assignmentIds } },
        });
      }
      if (horasParticipacionIds.length > 0) {
        await prisma.horasParticipacion.deleteMany({
          where: { idRegistroHoras: { in: horasParticipacionIds } },
        });
      }
      if (solicitudIds.length > 0) {
        await prisma.solicitudSalidaProyecto.deleteMany({
          where: { idSolicitud: { in: solicitudIds } },
        });
      }
      await cleanupIntegrationFixtures(prisma, scope);
    });

    it('colaborador multirol: PREPARACION con tarea activa -> cierre real de tramos -> PENDIENTE_LIDER -> APROBADA retira TODAS sus participaciones del proyecto objetivo, preserva su participación en un proyecto de control, y revoca acceso real a un endpoint de proyecto', async () => {
      const HORAS_REALES = 4;

      // ---------------------------------------------------------------
      // A. Arrange: proyecto objetivo (A) con líder, colaborador multirol
      // (dos ParticipacionProyecto ACTIVO), Sprint ACTIVO, y un segundo
      // proyecto de control (B) con una participación ACTIVO independiente
      // del MISMO colaborador — para la aserción de aislamiento cross-project.
      // ---------------------------------------------------------------
      const leaderA = await createIntegrationUser(prisma);
      const leaderB = await createIntegrationUser(prisma);
      const collaborator = await createIntegrationUser(prisma);
      scope.userIds = [leaderA.idUsuario, leaderB.idUsuario, collaborator.idUsuario];

      const projectA = await createIntegrationProject(prisma, leaderA.idUsuario);
      const projectB = await createIntegrationProject(prisma, leaderB.idUsuario);
      scope.projectIds = [projectA.idProyecto, projectB.idProyecto];

      const roleA1 = await createIntegrationProjectRole(prisma, projectA.idProyecto, {
        nombreRol: 'X2 Rol A1',
      });
      const roleA2 = await createIntegrationProjectRole(prisma, projectA.idProyecto, {
        nombreRol: 'X2 Rol A2',
      });
      const roleB = await createIntegrationProjectRole(prisma, projectB.idProyecto, {
        nombreRol: 'X2 Rol de control (Proyecto B)',
      });
      scope.roleIds = [roleA1.idRolProyecto, roleA2.idRolProyecto, roleB.idRolProyecto];

      const participationA1 = await createIntegrationParticipation(prisma, collaborator.idUsuario, roleA1.idRolProyecto, {
        estadoParticipacion: 'ACTIVO',
      });
      const participationA2 = await createIntegrationParticipation(prisma, collaborator.idUsuario, roleA2.idRolProyecto, {
        estadoParticipacion: 'ACTIVO',
      });
      const participationB = await createIntegrationParticipation(prisma, collaborator.idUsuario, roleB.idRolProyecto, {
        estadoParticipacion: 'ACTIVO',
      });
      scope.participationIds = [
        participationA1.idParticipacion,
        participationA2.idParticipacion,
        participationB.idParticipacion,
      ];

      const sprintA = await createIntegrationSprint(prisma, projectA.idProyecto, { estado: 'ACTIVO' });
      scope.sprintIds = [sprintA.idSprint];

      const taskA = await createIntegrationTask(prisma, projectA.idProyecto, leaderA.idUsuario, sprintA.idSprint, {
        tituloTarea: 'X2 tarea del rol A1',
        idRolProyecto: roleA1.idRolProyecto,
      });
      scope.taskIds = [taskA.idTarea];

      // ---------------------------------------------------------------
      // B. El colaborador tiene acceso real al proyecto ANTES de solicitar
      // la salida (checkpoint "antes" para evitar un falso positivo).
      // ---------------------------------------------------------------
      await expect(tasksService.findAll(projectA.idProyecto, collaborator.idUsuario)).resolves.toBeDefined();

      // ---------------------------------------------------------------
      // C. Asignación activa real (TasksService.assign — X1.1 garantiza que
      // idParticipacion queda correctamente resuelto a participationA1, el
      // rol exacto de la tarea, nunca participationA2).
      // ---------------------------------------------------------------
      await tasksService.assign(projectA.idProyecto, taskA.idTarea, leaderA.idUsuario, {
        idUsuario: collaborator.idUsuario,
      });
      const assignment = await prisma.asignacionTarea.findFirstOrThrow({
        where: { idTarea: taskA.idTarea, idUsuario: collaborator.idUsuario, desasignadaEn: null },
      });
      scope.assignmentIds = [assignment.idAsignacion];
      expect(assignment.idParticipacion).toBe(participationA1.idParticipacion);
      expect(assignment.desasignadaEn).toBeNull();

      // ---------------------------------------------------------------
      // D. B5: crear la solicitud de salida MIENTRAS la asignación sigue
      // activa — PREPARACION debe aceptarse con tareas activas.
      // ---------------------------------------------------------------
      const solicitud = await exitRequestsService.createSolicitudSalida(
        projectA.idProyecto,
        collaborator.idUsuario,
        'X2: ciclo completo de salida con retiro multirol y revocación de acceso',
      );
      solicitudIds = [solicitud.idSolicitud];
      expect(solicitud.estadoSolicitud).toBe('PREPARACION');

      const solicitudPersistida = await prisma.solicitudSalidaProyecto.findUniqueOrThrow({
        where: { idSolicitud: solicitud.idSolicitud },
        select: { estadoSolicitud: true },
      });
      expect(solicitudPersistida.estadoSolicitud).toBe('PREPARACION');

      const asignacionInmediatamenteTrasSolicitud = await prisma.asignacionTarea.findUniqueOrThrow({
        where: { idAsignacion: assignment.idAsignacion },
        select: { desasignadaEn: true },
      });
      expect(asignacionInmediatamenteTrasSolicitud.desasignadaEn).toBeNull();

      // ---------------------------------------------------------------
      // E. Blockers server-side reales (B6) y rechazo de continuación
      // prematura (B7 revalida, no confía en el cliente).
      // ---------------------------------------------------------------
      const resumenConBlockers = await exitRequestsService.getExitPreparationSummary(
        projectA.idProyecto,
        collaborator.idUsuario,
      );
      expect(resumenConBlockers.cantidadBlockers).toBe(1);
      expect(resumenConBlockers.puedeContinuar).toBe(false);
      expect(resumenConBlockers.blockers[0].idAsignacion).toBe(assignment.idAsignacion);

      await expect(
        exitRequestsService.continueExitPreparation(projectA.idProyecto, collaborator.idUsuario),
      ).rejects.toBeInstanceOf(ConflictException);

      const solicitudTrasIntentoPrematuro = await prisma.solicitudSalidaProyecto.findUniqueOrThrow({
        where: { idSolicitud: solicitud.idSolicitud },
        select: { estadoSolicitud: true },
      });
      expect(solicitudTrasIntentoPrematuro.estadoSolicitud).toBe('PREPARACION');

      // ---------------------------------------------------------------
      // F. B2: cierre real del tramo, con horas y evidencia de avance
      // válidas (nunca desasignadaEn escrito a mano vía Prisma).
      // ---------------------------------------------------------------
      await tasksService.closeAssignment(
        projectA.idProyecto,
        taskA.idTarea,
        assignment.idAsignacion,
        collaborator.idUsuario,
        {
          horasReales: HORAS_REALES,
          contenidoAvance: longProgressContent('X2 cierre real de tramo antes de PENDIENTE_LIDER'),
          marcarComoHecha: false,
        },
      );

      const asignacionCerrada = await prisma.asignacionTarea.findUniqueOrThrow({
        where: { idAsignacion: assignment.idAsignacion },
        select: { desasignadaEn: true, horasReales: true },
      });
      expect(asignacionCerrada.desasignadaEn).not.toBeNull();
      expect(Number(asignacionCerrada.horasReales)).toBe(HORAS_REALES);

      const registrosAvance = await prisma.registroAvanceAsignacion.findMany({
        where: { idAsignacion: assignment.idAsignacion },
        select: { idAutor: true, contenido: true },
      });
      expect(registrosAvance).toHaveLength(1);
      expect(registrosAvance[0].idAutor).toBe(collaborator.idUsuario);
      expect(registrosAvance[0].contenido.length).toBeGreaterThanOrEqual(200);

      const resumenSinBlockers = await exitRequestsService.getExitPreparationSummary(
        projectA.idProyecto,
        collaborator.idUsuario,
      );
      expect(resumenSinBlockers.cantidadBlockers).toBe(0);
      expect(resumenSinBlockers.puedeContinuar).toBe(true);

      // ---------------------------------------------------------------
      // G. B7: PREPARACION -> PENDIENTE_LIDER, ahora sin blockers.
      // ---------------------------------------------------------------
      const enPendienteLider = await exitRequestsService.continueExitPreparation(
        projectA.idProyecto,
        collaborator.idUsuario,
      );
      expect(enPendienteLider.estadoSolicitud).toBe('PENDIENTE_LIDER');

      const solicitudTrasContinuar = await prisma.solicitudSalidaProyecto.findUniqueOrThrow({
        where: { idSolicitud: solicitud.idSolicitud },
        select: { estadoSolicitud: true },
      });
      expect(solicitudTrasContinuar.estadoSolicitud).toBe('PENDIENTE_LIDER');

      // ---------------------------------------------------------------
      // H. B9: el líder aprueba mediante el servicio real -> APROBADA.
      // ---------------------------------------------------------------
      const aprobada = await exitRequestsService.approveSolicitudSalida(
        projectA.idProyecto,
        solicitud.idSolicitud,
        leaderA.idUsuario,
      );
      expect(aprobada.estadoSolicitud).toBe('APROBADA');

      const solicitudFinal = await prisma.solicitudSalidaProyecto.findUniqueOrThrow({
        where: { idSolicitud: solicitud.idSolicitud },
        select: { estadoSolicitud: true, resueltaEn: true, resueltaPor: true },
      });
      expect(solicitudFinal.estadoSolicitud).toBe('APROBADA');
      expect(solicitudFinal.resueltaEn).not.toBeNull();
      expect(solicitudFinal.resueltaPor).toBe(leaderA.idUsuario);

      // Reconocimiento de horas (B10) ocurre naturalmente durante la
      // aprobación; X2 solo confirma que no rompió el flujo (la invariante
      // de no-doble-conteo es responsabilidad exclusiva de X1).
      const horasParticipacionA1 = await prisma.horasParticipacion.findFirst({
        where: { idParticipacion: participationA1.idParticipacion, idSprint: sprintA.idSprint },
      });
      if (horasParticipacionA1) {
        horasParticipacionIds = [horasParticipacionA1.idRegistroHoras];
        expect(Number(horasParticipacionA1.horasCalculadas)).toBe(HORAS_REALES);
      }

      // ---------------------------------------------------------------
      // I. Invariante central: TODAS las participaciones ACTIVO del
      // colaborador en el proyecto objetivo quedan RETIRADO — nunca solo la
      // del rol de la tarea/solicitud.
      // ---------------------------------------------------------------
      const participacionesProyectoA = await prisma.participacionProyecto.findMany({
        where: {
          idUsuario: collaborator.idUsuario,
          idParticipacion: { in: [participationA1.idParticipacion, participationA2.idParticipacion] },
        },
        select: { idParticipacion: true, estadoParticipacion: true },
        orderBy: { idParticipacion: 'asc' },
      });
      expect(participacionesProyectoA).toEqual([
        expect.objectContaining({ idParticipacion: participationA1.idParticipacion, estadoParticipacion: 'RETIRADO' }),
        expect.objectContaining({ idParticipacion: participationA2.idParticipacion, estadoParticipacion: 'RETIRADO' }),
      ]);

      const conteoActivasProyectoA = await prisma.participacionProyecto.count({
        where: {
          idUsuario: collaborator.idUsuario,
          estadoParticipacion: 'ACTIVO',
          rolProyecto: { idProyecto: projectA.idProyecto },
        },
      });
      const conteoRetiradasProyectoA = await prisma.participacionProyecto.count({
        where: {
          idUsuario: collaborator.idUsuario,
          estadoParticipacion: 'RETIRADO',
          rolProyecto: { idProyecto: projectA.idProyecto },
        },
      });
      expect(conteoActivasProyectoA).toBe(0);
      expect(conteoRetiradasProyectoA).toBe(2);

      // ---------------------------------------------------------------
      // J. Aislamiento cross-project: la participación del MISMO
      // colaborador en el proyecto de control (B) permanece ACTIVO — el
      // updateMany de B9 nunca debe escapar de projectA.idProyecto.
      // ---------------------------------------------------------------
      const participacionProyectoB = await prisma.participacionProyecto.findUniqueOrThrow({
        where: { idParticipacion: participationB.idParticipacion },
        select: { estadoParticipacion: true },
      });
      expect(participacionProyectoB.estadoParticipacion).toBe('ACTIVO');

      // ---------------------------------------------------------------
      // K. Pérdida de acceso real: el mismo endpoint de proyecto
      // (TasksService.findAll, protegido por
      // TasksAuthorizationService.assertCanListProjectTasks ->
      // TasksContextService.assertActiveProjectParticipant) que aceptaba al
      // colaborador en la Fase B ahora lo rechaza.
      // ---------------------------------------------------------------
      await expect(tasksService.findAll(projectA.idProyecto, collaborator.idUsuario)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  },
);
