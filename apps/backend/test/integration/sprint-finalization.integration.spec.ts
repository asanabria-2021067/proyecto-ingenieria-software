import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import {
  createIntegrationUser,
  createIntegrationProject,
  createIntegrationSprint,
  createIntegrationTask,
} from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';
import { SprintsService } from '../../src/sprints/sprints.service';
import { SprintsContextService } from '../../src/sprints/sprints-context.service';
import { SprintsAuthorizationService } from '../../src/sprints/sprints-authorization.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import type { NotificationsService } from '../../src/notifications/notifications.service';

/**
 * Integración real A4: SprintsService.finalizeSprint contra PostgreSQL real
 * — persistencia (Proyecto/Sprint/Tarea) real de principio a fin; el único
 * colaborador sustituido por un doble es NotificationsService (requiere
 * NotificationsGateway/socket.io real, ajeno a lo que A4 verifica aquí:
 * la transición de estado, la precondición de tareas y la concurrencia).
 * Se activa solo con `INTEGRATION_DATABASE_URL`; sin esa variable, SKIP
 * limpio (describeIntegration), mismo patrón que
 * sprint-operable.integration.spec.ts (A2) y
 * project-write-guard.integration.spec.ts (A3).
 */
function makeNotificationsSpy() {
  return {
    notifyProjectActiveParticipants: async () => undefined,
    notifySprintFinalizationStarted: async () => undefined,
  };
}

describeIntegration(
  'SprintsService.finalizeSprint — PostgreSQL real (precondición de tareas + concurrencia)',
  () => {
    let prisma: PrismaClient;
    let scope: IntegrationCleanupScope;

    function makeService(notifications = makeNotificationsSpy()) {
      const context = new SprintsContextService(prisma as unknown as PrismaService);
      const authorization = new SprintsAuthorizationService(context);
      return {
        service: new SprintsService(
          prisma as unknown as PrismaService,
          context,
          authorization,
          notifications as unknown as NotificationsService,
        ),
        notifications,
      };
    }

    beforeAll(async () => {
      prisma = createIntegrationPrismaClient();
      await prisma.$connect();
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    beforeEach(() => {
      scope = {};
    });

    afterEach(async () => {
      await cleanupIntegrationFixtures(prisma, scope);
    });

    it('tarea pendiente: finalizeSprint rechaza con ConflictException y el Sprint permanece ACTIVO sin fechaFinalizacionIniciada', async () => {
      const leader = await createIntegrationUser(prisma);
      scope.userIds = [leader.idUsuario];
      const project = await createIntegrationProject(prisma, leader.idUsuario);
      scope.projectIds = [project.idProyecto];
      const sprint = await createIntegrationSprint(prisma, project.idProyecto, { estado: 'ACTIVO' });
      scope.sprintIds = [sprint.idSprint];
      const task = await createIntegrationTask(prisma, project.idProyecto, leader.idUsuario, sprint.idSprint, {
        estadoTarea: 'EN_PROGRESO',
      });
      scope.taskIds = [task.idTarea];

      const { service, notifications } = makeService();
      let calledNotify = false;
      notifications.notifyProjectActiveParticipants = async () => {
        calledNotify = true;
      };

      await expect(
        service.finalizeSprint(project.idProyecto, sprint.idSprint, leader.idUsuario),
      ).rejects.toBeInstanceOf(ConflictException);

      const sprintFinal = await prisma.sprint.findUnique({ where: { idSprint: sprint.idSprint } });
      expect(sprintFinal?.estado).toBe('ACTIVO');
      expect(sprintFinal?.fechaFinalizacionIniciada).toBeNull();
      expect(calledNotify).toBe(false);
    });

    it('todas las tareas HECHO: finalizeSprint transiciona a EN_FINALIZACION y persiste fechaFinalizacionIniciada', async () => {
      const leader = await createIntegrationUser(prisma);
      scope.userIds = [leader.idUsuario];
      const project = await createIntegrationProject(prisma, leader.idUsuario);
      scope.projectIds = [project.idProyecto];
      const sprint = await createIntegrationSprint(prisma, project.idProyecto, { estado: 'ACTIVO' });
      scope.sprintIds = [sprint.idSprint];
      const task = await createIntegrationTask(prisma, project.idProyecto, leader.idUsuario, sprint.idSprint, {
        estadoTarea: 'HECHO',
      });
      scope.taskIds = [task.idTarea];

      const { service } = makeService();

      const resultado = await service.finalizeSprint(project.idProyecto, sprint.idSprint, leader.idUsuario);
      expect(resultado.estado).toBe('EN_FINALIZACION');

      const sprintFinal = await prisma.sprint.findUnique({ where: { idSprint: sprint.idSprint } });
      expect(sprintFinal?.estado).toBe('EN_FINALIZACION');
      expect(sprintFinal?.fechaFinalizacionIniciada).not.toBeNull();
    });

    it('concurrencia real: exactamente una de dos finalizaciones simultáneas gana, con exactamente una notificación', async () => {
      const leader = await createIntegrationUser(prisma);
      scope.userIds = [leader.idUsuario];
      const project = await createIntegrationProject(prisma, leader.idUsuario);
      scope.projectIds = [project.idProyecto];
      const sprint = await createIntegrationSprint(prisma, project.idProyecto, { estado: 'ACTIVO' });
      scope.sprintIds = [sprint.idSprint];
      const task = await createIntegrationTask(prisma, project.idProyecto, leader.idUsuario, sprint.idSprint, {
        estadoTarea: 'HECHO',
      });
      scope.taskIds = [task.idTarea];

      let notificationCalls = 0;
      const { service } = makeService({
        notifyProjectActiveParticipants: async () => {
          notificationCalls += 1;
        },
        notifySprintFinalizationStarted: async () => undefined,
      });

      const [r1, r2] = await Promise.allSettled([
        service.finalizeSprint(project.idProyecto, sprint.idSprint, leader.idUsuario),
        service.finalizeSprint(project.idProyecto, sprint.idSprint, leader.idUsuario),
      ]);

      const fulfilled = [r1, r2].filter((r) => r.status === 'fulfilled');
      const rejected = [r1, r2].filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);

      // No basta con Promise.allSettled: se consulta PostgreSQL real
      // después de la carrera para confirmar el estado final persistido.
      const sprintFinal = await prisma.sprint.findUnique({ where: { idSprint: sprint.idSprint } });

      expect(sprintFinal?.estado).toBe('EN_FINALIZACION');
      expect(sprintFinal?.fechaFinalizacionIniciada).not.toBeNull();
      expect(notificationCalls).toBe(1);
    });
  },
);
