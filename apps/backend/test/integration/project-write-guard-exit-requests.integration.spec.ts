import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { ConflictException, HttpStatus, type ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import {
  createIntegrationParticipation,
  createIntegrationProject,
  createIntegrationProjectRole,
  createIntegrationSprint,
  createIntegrationTask,
  createIntegrationTaskAssignment,
  createIntegrationUser,
} from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';
import {
  FINALIZING_SPRINT_MESSAGE,
  ProjectWriteGuard,
} from '../../src/common/guards/project-write.guard';
import { PrismaService } from '../../src/prisma/prisma.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { SprintsContextService } from '../../src/sprints/sprints-context.service';
import { ExitRequestsAuthorizationService } from '../../src/exit-requests/exit-requests.authorization.service';
import { ExitRequestsContextService } from '../../src/exit-requests/exit-requests.context.service';
import { ExitRequestsController } from '../../src/exit-requests/exit-requests.controller';
import { ExitRequestsService } from '../../src/exit-requests/exit-requests.service';
import { ProgressRecordsController } from '../../src/progress-records/progress-records.controller';
import { ProgressRecordsService } from '../../src/progress-records/progress-records.service';
import { TasksAuthorizationService } from '../../src/tasks/tasks-authorization.service';
import { TasksContextService } from '../../src/tasks/tasks-context.service';
import { TasksController } from '../../src/tasks/tasks.controller';
import { TasksRelationsService } from '../../src/tasks/tasks-relations.service';
import { TasksService } from '../../src/tasks/tasks.service';

const LONG_CONTENT = 'avance '.repeat(40);

type B15CleanupScope = IntegrationCleanupScope & {
  progressRecordIds?: number[];
  exitRequestIds?: number[];
};

function makeFakeNotifications(): NotificationsService {
  return {
    notifyFromTemplate: async () => undefined,
    notifyUsers: async () => undefined,
    notifyRoleMembers: async () => undefined,
    notifyProjectActiveParticipants: async () => undefined,
  } as unknown as NotificationsService;
}

function fakeExecutionContext(params: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ params }) }),
  } as unknown as ExecutionContext;
}

function guardsOf(controller: object, handlerName: string): unknown[] {
  const prototype = Object.getPrototypeOf(controller) as Record<string, unknown>;
  const handler = prototype[handlerName];
  return Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];
}

describeIntegration(
  'B15 — ProjectWriteGuard en exit-requests/progress-records contra PostgreSQL',
  () => {
    let prisma: PrismaClient;
    let guard: ProjectWriteGuard;
    let exitController: ExitRequestsController;
    let progressController: ProgressRecordsController;
    let tasksController: TasksController;
    let scope: B15CleanupScope;

    beforeAll(async () => {
      prisma = createIntegrationPrismaClient();
      await prisma.$connect();
      const prismaService = prisma as unknown as PrismaService;

      const notifications = makeFakeNotifications();
      const sprintsContext = new SprintsContextService(prismaService);
      guard = new ProjectWriteGuard(sprintsContext);

      const exitContext = new ExitRequestsContextService(prismaService);
      const exitAuthorization = new ExitRequestsAuthorizationService(exitContext);
      const exitService = new ExitRequestsService(
        prismaService,
        notifications,
        exitAuthorization,
        exitContext,
      );
      exitController = new ExitRequestsController(exitService);

      const tasksContext = new TasksContextService(prismaService);
      const progressService = new ProgressRecordsService(prismaService, tasksContext);
      progressController = new ProgressRecordsController(progressService);

      const tasksAuthorization = new TasksAuthorizationService(tasksContext);
      const tasksRelations = new TasksRelationsService(prismaService, tasksContext);
      const tasksService = new TasksService(
        prismaService,
        tasksAuthorization,
        tasksRelations,
        notifications,
        tasksContext,
      );
      tasksController = new TasksController(tasksService);
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    beforeEach(() => {
      scope = {};
    });

    afterEach(async () => {
      if (scope.progressRecordIds?.length) {
        await prisma.registroAvanceAsignacion.deleteMany({
          where: { idRegistroAvance: { in: scope.progressRecordIds } },
        });
      }
      if (scope.exitRequestIds?.length) {
        await prisma.solicitudSalidaProyecto.deleteMany({
          where: { idSolicitud: { in: scope.exitRequestIds } },
        });
      }
      await cleanupIntegrationFixtures(prisma, scope);
    });

    async function runThroughRealGuard<T>(
      controller: object,
      handlerName: string,
      projectId: number,
      action: () => Promise<T>,
    ): Promise<T> {
      expect(guardsOf(controller, handlerName)).toContain(ProjectWriteGuard);

      await guard.canActivate(fakeExecutionContext({ projectId: String(projectId) }));
      return action();
    }

    async function createProjectWithMember(sprintState: 'ACTIVO' | 'EN_FINALIZACION') {
      const leader = await createIntegrationUser(prisma);
      const member = await createIntegrationUser(prisma);
      scope.userIds = [leader.idUsuario, member.idUsuario];

      const project = await createIntegrationProject(prisma, leader.idUsuario);
      scope.projectIds = [project.idProyecto];

      const role = await createIntegrationProjectRole(prisma, project.idProyecto);
      scope.roleIds = [role.idRolProyecto];

      const participation = await createIntegrationParticipation(
        prisma,
        member.idUsuario,
        role.idRolProyecto,
        { estadoParticipacion: 'ACTIVO' },
      );
      scope.participationIds = [participation.idParticipacion];

      const sprint = await createIntegrationSprint(prisma, project.idProyecto, {
        estado: sprintState,
      });
      scope.sprintIds = [sprint.idSprint];

      return { leader, member, project, role, participation, sprint };
    }

    it('aplica ProjectWriteGuard solo a mutaciones B15 y conserva la lectura de preparación', () => {
      const exitWrites = [
        'createExitRequest',
        'approveExitRequest',
        'rejectExitRequest',
        'continueExitPreparation',
        'cancelExitPreparation',
      ];
      for (const handlerName of exitWrites) {
        expect(guardsOf(exitController, handlerName)).toContain(ProjectWriteGuard);
      }
      expect(guardsOf(exitController, 'getExitPreparationSummary')).not.toContain(ProjectWriteGuard);

      expect(guardsOf(progressController, 'create')).toContain(ProjectWriteGuard);
      expect(guardsOf(progressController, 'update')).toContain(ProjectWriteGuard);
    });

    it('bloquea continuar salida en EN_FINALIZACION con 409 y deja la solicitud en PREPARACION', async () => {
      const { member, project } = await createProjectWithMember('EN_FINALIZACION');
      const solicitud = await prisma.solicitudSalidaProyecto.create({
        data: {
          idProyecto: project.idProyecto,
          idUsuario: member.idUsuario,
          motivo: 'Salida preparada para gate B15',
          estadoSolicitud: 'PREPARACION',
        },
      });
      scope.exitRequestIds = [solicitud.idSolicitud];

      let rejection: unknown;
      try {
        await runThroughRealGuard(exitController, 'continueExitPreparation', project.idProyecto, () =>
          exitController.continueExitPreparation(project.idProyecto, { userId: member.idUsuario }),
        );
      } catch (error) {
        rejection = error;
      }

      expect(rejection).toBeInstanceOf(ConflictException);
      expect((rejection as ConflictException).getStatus()).toBe(HttpStatus.CONFLICT);
      expect((rejection as Error).message).toBe(FINALIZING_SPRINT_MESSAGE);

      const unchanged = await prisma.solicitudSalidaProyecto.findUnique({
        where: { idSolicitud: solicitud.idSolicitud },
      });
      expect(unchanged?.estadoSolicitud).toBe('PREPARACION');
    });

    it('permite continuar salida en ACTIVO y demuestra que el guard no bloquea permanentemente', async () => {
      const { member, project } = await createProjectWithMember('ACTIVO');
      const solicitud = await prisma.solicitudSalidaProyecto.create({
        data: {
          idProyecto: project.idProyecto,
          idUsuario: member.idUsuario,
          motivo: 'Salida preparada con Sprint activo',
          estadoSolicitud: 'PREPARACION',
        },
      });
      scope.exitRequestIds = [solicitud.idSolicitud];

      await runThroughRealGuard(exitController, 'continueExitPreparation', project.idProyecto, () =>
        exitController.continueExitPreparation(project.idProyecto, { userId: member.idUsuario }),
      );

      const updated = await prisma.solicitudSalidaProyecto.findUnique({
        where: { idSolicitud: solicitud.idSolicitud },
      });
      expect(updated?.estadoSolicitud).toBe('PENDIENTE_LIDER');
    });

    it('mantiene accesible el GET de preparación durante EN_FINALIZACION', async () => {
      const { member, project } = await createProjectWithMember('EN_FINALIZACION');
      const solicitud = await prisma.solicitudSalidaProyecto.create({
        data: {
          idProyecto: project.idProyecto,
          idUsuario: member.idUsuario,
          motivo: 'Lectura de preparación durante finalización',
          estadoSolicitud: 'PREPARACION',
        },
      });
      scope.exitRequestIds = [solicitud.idSolicitud];

      const result = await exitController.getExitPreparationSummary(project.idProyecto, {
        userId: member.idUsuario,
      });

      expect(result.solicitud.idSolicitud).toBe(solicitud.idSolicitud);
      expect(result.cantidadBlockers).toBe(0);
    });

    it('bloquea creación de registro de avance en EN_FINALIZACION con 409 y no persiste registro', async () => {
      const { leader, member, project, sprint } = await createProjectWithMember('EN_FINALIZACION');
      const task = await createIntegrationTask(
        prisma,
        project.idProyecto,
        leader.idUsuario,
        sprint.idSprint,
      );
      scope.taskIds = [task.idTarea];
      const assignment = await createIntegrationTaskAssignment(
        prisma,
        task.idTarea,
        member.idUsuario,
        leader.idUsuario,
      );
      scope.assignmentIds = [assignment.idAsignacion];

      const beforeCount = await prisma.registroAvanceAsignacion.count({
        where: { idAsignacion: assignment.idAsignacion },
      });

      let rejection: unknown;
      try {
        await runThroughRealGuard(progressController, 'create', project.idProyecto, () =>
          progressController.create(
            project.idProyecto,
            task.idTarea,
            assignment.idAsignacion,
            { userId: member.idUsuario },
            { contenido: LONG_CONTENT },
          ),
        );
      } catch (error) {
        rejection = error;
      }

      expect(rejection).toBeInstanceOf(ConflictException);
      expect((rejection as ConflictException).getStatus()).toBe(HttpStatus.CONFLICT);
      expect((rejection as Error).message).toBe(FINALIZING_SPRINT_MESSAGE);

      const afterCount = await prisma.registroAvanceAsignacion.count({
        where: { idAsignacion: assignment.idAsignacion },
      });
      expect(afterCount).toBe(beforeCount);
    });

    it('permite crear registro de avance en ACTIVO', async () => {
      const { leader, member, project, sprint } = await createProjectWithMember('ACTIVO');
      const task = await createIntegrationTask(
        prisma,
        project.idProyecto,
        leader.idUsuario,
        sprint.idSprint,
      );
      scope.taskIds = [task.idTarea];
      const assignment = await createIntegrationTaskAssignment(
        prisma,
        task.idTarea,
        member.idUsuario,
        leader.idUsuario,
      );
      scope.assignmentIds = [assignment.idAsignacion];

      const record = await runThroughRealGuard(progressController, 'create', project.idProyecto, () =>
        progressController.create(
          project.idProyecto,
          task.idTarea,
          assignment.idAsignacion,
          { userId: member.idUsuario },
          { contenido: LONG_CONTENT },
        ),
      );
      const createdRecord = record as { idRegistroAvance: number; contenido: string };
      scope.progressRecordIds = [createdRecord.idRegistroAvance];

      expect(createdRecord.contenido).toBe(LONG_CONTENT);
    });

    it('preserva el bloqueo A3 de cierre de tramo en EN_FINALIZACION sin tocar TasksController', async () => {
      const { leader, member, project, sprint } = await createProjectWithMember('EN_FINALIZACION');
      const task = await createIntegrationTask(
        prisma,
        project.idProyecto,
        leader.idUsuario,
        sprint.idSprint,
      );
      scope.taskIds = [task.idTarea];
      const assignment = await createIntegrationTaskAssignment(
        prisma,
        task.idTarea,
        member.idUsuario,
        leader.idUsuario,
      );
      scope.assignmentIds = [assignment.idAsignacion];

      let rejection: unknown;
      try {
        await runThroughRealGuard(tasksController, 'closeAssignment', project.idProyecto, () =>
          tasksController.closeAssignment(
            project.idProyecto,
            task.idTarea,
            { assignmentId: String(assignment.idAsignacion) },
            { userId: leader.idUsuario },
            { horasReales: 2 },
          ),
        );
      } catch (error) {
        rejection = error;
      }

      expect(rejection).toBeInstanceOf(ConflictException);
      expect((rejection as ConflictException).getStatus()).toBe(HttpStatus.CONFLICT);

      const unchanged = await prisma.asignacionTarea.findUnique({
        where: { idAsignacion: assignment.idAsignacion },
      });
      expect(unchanged?.desasignadaEn).toBeNull();
      expect(unchanged?.horasReales).toBeNull();
    });
  },
);
