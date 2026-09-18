import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import {
  createIntegrationUser,
  createIntegrationProject,
  createIntegrationProjectRole,
  createIntegrationParticipation,
  createIntegrationSprint,
  createIntegrationTask,
  createIntegrationTaskAssignment,
} from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';
import { SprintsService } from '../../src/sprints/sprints.service';
import { SprintsContextService } from '../../src/sprints/sprints-context.service';
import { SprintsAuthorizationService } from '../../src/sprints/sprints-authorization.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import type { NotificationsService } from '../../src/notifications/notifications.service';
import { ProjectTransactionService } from '../../src/common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../../src/common/project-policy/project-policy.service';
import { ProjectIdResolverService } from '../../src/common/project-policy/project-id-resolver.service';
import { ProjectReadPolicyService } from '../../src/common/project-policy/project-read-policy.service';

/**
 * Integración real T-239 (HU-160) contra PostgreSQL real: el hallazgo que
 * motivó esta tarea era que `getSprintsAnalytics` recalculaba SIEMPRE desde
 * `tarea`, así que corregir una tarea vieja de un Sprint cerrado reescribía
 * el pasado. Este archivo demuestra lo contrario ya arreglado: cerrar un
 * Sprint congela su fila, y una corrección posterior sobre una tarea de ESE
 * Sprint ya no cambia lo que la comparativa devuelve para él. Se activa solo
 * con `INTEGRATION_DATABASE_URL` (describeIntegration).
 */
function makeNotificationsSpy() {
  return {
    notifyProjectActiveParticipants: async () => undefined,
    notifySprintFinalizationStarted: async () => undefined,
    notifySprintClosed: async () => undefined,
  };
}

describeIntegration(
  'SprintsService — congelamiento de T-239 frente a correcciones retroactivas (PostgreSQL real)',
  () => {
    let prisma: PrismaClient;
    let scope: IntegrationCleanupScope;

    function makeService() {
      const context = new SprintsContextService(prisma as unknown as PrismaService);
      const authorization = new SprintsAuthorizationService(context);
      return new SprintsService(
        prisma as unknown as PrismaService,
        context,
        authorization,
        makeNotificationsSpy() as unknown as NotificationsService,
        new ProjectTransactionService(prisma as unknown as PrismaService),
        new ProjectPolicyService(new ProjectIdResolverService(prisma as unknown as PrismaService)),
        new ProjectReadPolicyService(prisma as unknown as PrismaService),
      );
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

    it('cierra con pendientes (HU-148 mínimo), congela cumplimiento < 100% y una corrección posterior de una tarea vieja no lo cambia', async () => {
      const leader = await createIntegrationUser(prisma);
      scope.userIds = [leader.idUsuario];
      const project = await createIntegrationProject(prisma, leader.idUsuario, { estadoProyecto: 'EN_PROGRESO' });
      scope.projectIds = [project.idProyecto];
      const sprint = await createIntegrationSprint(prisma, project.idProyecto, { estado: 'ACTIVO' });
      scope.sprintIds = [sprint.idSprint];

      const hecha = await createIntegrationTask(prisma, project.idProyecto, leader.idUsuario, sprint.idSprint, {
        estadoTarea: 'HECHO',
        puntosHistoria: 5,
      });
      const pendiente = await createIntegrationTask(prisma, project.idProyecto, leader.idUsuario, sprint.idSprint, {
        estadoTarea: 'EN_PROGRESO',
        puntosHistoria: 3,
      });
      scope.taskIds = [hecha.idTarea, pendiente.idTarea];

      const role = await createIntegrationProjectRole(prisma, project.idProyecto);
      scope.roleIds = [role.idRolProyecto];
      const participation = await createIntegrationParticipation(prisma, leader.idUsuario, role.idRolProyecto, {
        estadoParticipacion: 'ACTIVO',
      });
      scope.participationIds = [participation.idParticipacion];
      const trace = await createIntegrationTaskAssignment(prisma, hecha.idTarea, leader.idUsuario, leader.idUsuario, {
        idParticipacion: participation.idParticipacion,
        desasignadaEn: new Date('2026-09-02T12:00:00.000Z'),
        horasReales: 0,
      });
      scope.assignmentIds = [trace.idAsignacion];

      const service = makeService();

      await service.finalizeSprint(project.idProyecto, sprint.idSprint, leader.idUsuario);
      await service.closeSprint(project.idProyecto, sprint.idSprint, leader.idUsuario);

      const antes = await service.getSprintsAnalytics(project.idProyecto, leader.idUsuario);
      const filaAntes = antes.sprints.find((fila) => fila.idSprint === sprint.idSprint);
      expect(filaAntes).toMatchObject({
        tareasPlanificadas: 2,
        tareasCompletadas: 1,
        porcentajeCumplimiento: 50,
      });

      await prisma.tarea.update({
        where: { idTarea: pendiente.idTarea },
        data: { estadoTarea: 'HECHO' },
      });

      const despues = await service.getSprintsAnalytics(project.idProyecto, leader.idUsuario);
      const filaDespues = despues.sprints.find((fila) => fila.idSprint === sprint.idSprint);

      expect(filaDespues).toEqual(filaAntes);
      expect(filaDespues).toMatchObject({
        tareasPlanificadas: 2,
        tareasCompletadas: 1,
        porcentajeCumplimiento: 50,
      });
    });

    it('un Sprint ACTIVO sigue reflejando en vivo una corrección de tarea (el congelamiento es exclusivo de CERRADO)', async () => {
      const leader = await createIntegrationUser(prisma);
      scope.userIds = [leader.idUsuario];
      const project = await createIntegrationProject(prisma, leader.idUsuario, { estadoProyecto: 'EN_PROGRESO' });
      scope.projectIds = [project.idProyecto];
      const sprint = await createIntegrationSprint(prisma, project.idProyecto, { estado: 'ACTIVO' });
      scope.sprintIds = [sprint.idSprint];
      const tarea = await createIntegrationTask(prisma, project.idProyecto, leader.idUsuario, sprint.idSprint, {
        estadoTarea: 'EN_PROGRESO',
      });
      scope.taskIds = [tarea.idTarea];

      const service = makeService();

      const antes = await service.getSprintsAnalytics(project.idProyecto, leader.idUsuario);
      expect(antes.sprints.find((fila) => fila.idSprint === sprint.idSprint)).toMatchObject({
        tareasCompletadas: 0,
        porcentajeCumplimiento: 0,
      });

      await prisma.tarea.update({ where: { idTarea: tarea.idTarea }, data: { estadoTarea: 'HECHO' } });

      const despues = await service.getSprintsAnalytics(project.idProyecto, leader.idUsuario);
      expect(despues.sprints.find((fila) => fila.idSprint === sprint.idSprint)).toMatchObject({
        tareasCompletadas: 1,
        porcentajeCumplimiento: 100,
      });
    });

    it('la velocidad congelada (puntosHistoriaCompletados) coincide con la suma de puntos de las tareas HECHO', async () => {
      const leader = await createIntegrationUser(prisma);
      scope.userIds = [leader.idUsuario];
      const project = await createIntegrationProject(prisma, leader.idUsuario, { estadoProyecto: 'EN_PROGRESO' });
      scope.projectIds = [project.idProyecto];
      const sprint = await createIntegrationSprint(prisma, project.idProyecto, { estado: 'ACTIVO' });
      scope.sprintIds = [sprint.idSprint];

      const hecha = await createIntegrationTask(prisma, project.idProyecto, leader.idUsuario, sprint.idSprint, {
        estadoTarea: 'HECHO',
        puntosHistoria: 5,
      });
      const pendiente = await createIntegrationTask(prisma, project.idProyecto, leader.idUsuario, sprint.idSprint, {
        estadoTarea: 'EN_PROGRESO',
        puntosHistoria: 3,
      });
      scope.taskIds = [hecha.idTarea, pendiente.idTarea];

      const role = await createIntegrationProjectRole(prisma, project.idProyecto);
      scope.roleIds = [role.idRolProyecto];
      const participation = await createIntegrationParticipation(prisma, leader.idUsuario, role.idRolProyecto, {
        estadoParticipacion: 'ACTIVO',
      });
      scope.participationIds = [participation.idParticipacion];
      const trace = await createIntegrationTaskAssignment(prisma, hecha.idTarea, leader.idUsuario, leader.idUsuario, {
        idParticipacion: participation.idParticipacion,
        desasignadaEn: new Date('2026-09-02T12:00:00.000Z'),
        horasReales: 0,
      });
      scope.assignmentIds = [trace.idAsignacion];

      const service = makeService();
      await service.finalizeSprint(project.idProyecto, sprint.idSprint, leader.idUsuario);
      await service.closeSprint(project.idProyecto, sprint.idSprint, leader.idUsuario);

      const analytics = await service.getSprintsAnalytics(project.idProyecto, leader.idUsuario);
      const fila = analytics.sprints.find((s) => s.idSprint === sprint.idSprint);

      expect(fila).toMatchObject({ puntosHistoriaCompletados: 5 });
    });
  },
);
