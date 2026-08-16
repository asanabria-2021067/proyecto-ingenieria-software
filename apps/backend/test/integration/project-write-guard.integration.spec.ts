import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { ConflictException, type ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import {
  createIntegrationUser,
  createIntegrationProject,
  createIntegrationProjectRole,
  createIntegrationParticipation,
  createIntegrationSprint,
  createIntegrationTask,
} from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';
import { ProjectWriteGuard } from '../../src/common/guards/project-write.guard';
import { SprintsContextService } from '../../src/sprints/sprints-context.service';
import { TasksController } from '../../src/tasks/tasks.controller';
import { TasksService } from '../../src/tasks/tasks.service';
import { TasksContextService } from '../../src/tasks/tasks-context.service';
import { TasksAuthorizationService } from '../../src/tasks/tasks-authorization.service';
import { TasksRelationsService } from '../../src/tasks/tasks-relations.service';

/**
 * Integración real A3: demuestra que ProjectWriteGuard (SYNC GATE 2) protege
 * de verdad el pipeline real de TasksController — no una llamada manual
 * aislada a `guard.canActivate(mockContext)`. Cada escenario:
 *
 *   1. lee la metadata REAL de Nest (GUARDS_METADATA) del handler REAL de
 *      TasksController para confirmar que ProjectWriteGuard está decorado
 *      ahí (lo mismo que Nest consultaría en producción antes de invocar el
 *      handler);
 *   2. ejecuta ese guard real, con SprintsContextService real, contra
 *      PostgreSQL real;
 *   3. si el guard permite continuar, invoca el método real del controller
 *      (respaldado por TasksService real, con sus colaboradores reales
 *      TasksContextService/TasksAuthorizationService/TasksRelationsService,
 *      todos contra la misma base real) y confirma que la mutación se
 *      persiste; si el guard rechaza, confirma ConflictException y que el
 *      controller nunca llegó a invocarse.
 *
 * Cubre las tres rutas representativas exigidas (CREATE, EDIT, ASSIGN) por
 * los tres estados del Sprint (sin Sprint operable, ACTIVO,
 * EN_FINALIZACION) — matriz 3x3 completa, sobre datos reales.
 *
 * NotificationsService se sustituye por un doble sin operaciones: requiere
 * un NotificationsGateway real (socket.io) que no forma parte de lo que A3
 * verifica (el guard bloquea antes de que exista cualquier mutación que
 * notificar); mismo criterio que proyectos-destacados.e2e.spec.ts
 * (colaborador ajeno al comportamiento bajo prueba, sustituido por un doble
 * ligero, nunca el propio Prisma/guard).
 */
function makeFakeNotifications() {
  return {
    notifyFromTemplate: async () => undefined,
    notifyUsers: async () => undefined,
    notifyRoleMembers: async () => undefined,
    notifyProjectActiveParticipants: async () => undefined,
  } as any;
}

function fakeExecutionContext(params: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ params }) }),
  } as unknown as ExecutionContext;
}

describeIntegration(
  'ProjectWriteGuard (SYNC GATE 2) — pipeline real de TasksController contra PostgreSQL',
  () => {
    let prisma: PrismaClient;
    let controller: TasksController;
    let guard: ProjectWriteGuard;
    let scope: IntegrationCleanupScope;

    beforeAll(async () => {
      prisma = createIntegrationPrismaClient();
      await prisma.$connect();

      const tasksContext = new TasksContextService(prisma as any);
      const tasksAuthorization = new TasksAuthorizationService(tasksContext);
      const tasksRelations = new TasksRelationsService(prisma as any, tasksContext);
      const tasksService = new TasksService(
        prisma as any,
        tasksAuthorization,
        tasksRelations,
        makeFakeNotifications(),
        tasksContext,
      );
      controller = new TasksController(tasksService);

      const sprintsContext = new SprintsContextService(prisma as any);
      guard = new ProjectWriteGuard(sprintsContext);
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

    /**
     * Reproduce exactamente lo que Nest hace antes de invocar un handler:
     * lee GUARDS_METADATA del handler real, confirma que ProjectWriteGuard
     * está presente, y lo ejecuta. Si pasa, invoca `action` (el handler real
     * del controller); si no, la excepción se propaga sin invocar `action`.
     */
    async function runThroughRealGuard<T>(
      handlerName: keyof TasksController,
      projectId: number,
      action: () => Promise<T>,
    ): Promise<T> {
      const handler = (TasksController.prototype as any)[handlerName];
      const guards = Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];
      expect(guards).toContain(ProjectWriteGuard);

      await guard.canActivate(fakeExecutionContext({ projectId: String(projectId) }));
      return action();
    }

    it('CREATE TASK: bloqueada sin Sprint operable, permitida en ACTIVO, bloqueada en EN_FINALIZACION', async () => {
      const leader = await createIntegrationUser(prisma);
      scope.userIds = [leader.idUsuario];
      const project = await createIntegrationProject(prisma, leader.idUsuario);
      scope.projectIds = [project.idProyecto];
      scope.sprintIds = [];
      scope.taskIds = [];

      const dto = {
        tituloTarea: 'Tarea A3 create',
        fechaLimite: '2099-01-01',
        prioridad: 'MEDIA',
      } as any;

      // --- SIN SPRINT OPERABLE (ningún Sprint todavía) ---
      let rejection: unknown;
      try {
        await runThroughRealGuard('create', project.idProyecto, () =>
          controller.create(project.idProyecto, { userId: leader.idUsuario }, dto),
        );
      } catch (error) {
        rejection = error;
      }
      expect(rejection).toBeInstanceOf(ConflictException);
      const countSinSprint = await prisma.tarea.count({ where: { idProyecto: project.idProyecto } });
      expect(countSinSprint).toBe(0);

      // --- ACTIVO ---
      const sprint = await createIntegrationSprint(prisma, project.idProyecto, {
        estado: 'ACTIVO',
      });
      scope.sprintIds.push(sprint.idSprint);

      const creada = await runThroughRealGuard('create', project.idProyecto, () =>
        controller.create(project.idProyecto, { userId: leader.idUsuario }, dto),
      );
      expect((creada as any).idTarea).toBeTypeOf('number');
      scope.taskIds!.push((creada as any).idTarea);

      const countActivo = await prisma.tarea.count({ where: { idProyecto: project.idProyecto } });
      expect(countActivo).toBe(1);

      // --- EN_FINALIZACION ---
      await prisma.sprint.update({
        where: { idSprint: sprint.idSprint },
        data: { estado: 'EN_FINALIZACION' },
      });

      let rejectionFinalizacion: unknown;
      try {
        await runThroughRealGuard('create', project.idProyecto, () =>
          controller.create(project.idProyecto, { userId: leader.idUsuario }, dto),
        );
      } catch (error) {
        rejectionFinalizacion = error;
      }
      expect(rejectionFinalizacion).toBeInstanceOf(ConflictException);

      const countFinal = await prisma.tarea.count({ where: { idProyecto: project.idProyecto } });
      expect(countFinal).toBe(1); // ninguna tarea nueva se creó durante EN_FINALIZACION
    });

    it('EDIT TASK: bloqueada sin Sprint operable, permitida en ACTIVO, bloqueada en EN_FINALIZACION', async () => {
      const leader = await createIntegrationUser(prisma);
      scope.userIds = [leader.idUsuario];
      const project = await createIntegrationProject(prisma, leader.idUsuario);
      scope.projectIds = [project.idProyecto];

      const sprint = await createIntegrationSprint(prisma, project.idProyecto, {
        estado: 'ACTIVO',
      });
      scope.sprintIds = [sprint.idSprint];

      const task = await createIntegrationTask(prisma, project.idProyecto, leader.idUsuario, sprint.idSprint, {
        tituloTarea: 'Titulo original',
      });
      scope.taskIds = [task.idTarea];

      // Cierra el Sprint para simular "sin Sprint operable" preservando la
      // tarea preexistente (Tarea.idSprint es NOT NULL — Foundation).
      await prisma.sprint.update({ where: { idSprint: sprint.idSprint }, data: { estado: 'CERRADO' } });

      let rejection: unknown;
      try {
        await runThroughRealGuard('update', project.idProyecto, () =>
          controller.update(
            project.idProyecto,
            task.idTarea,
            { userId: leader.idUsuario },
            { tituloTarea: 'Editado sin Sprint' } as any,
          ),
        );
      } catch (error) {
        rejection = error;
      }
      expect(rejection).toBeInstanceOf(ConflictException);
      const sinCambios = await prisma.tarea.findUnique({ where: { idTarea: task.idTarea } });
      expect(sinCambios?.tituloTarea).toBe('Titulo original');

      // --- ACTIVO: reabre el Sprint ---
      await prisma.sprint.update({ where: { idSprint: sprint.idSprint }, data: { estado: 'ACTIVO' } });

      await runThroughRealGuard('update', project.idProyecto, () =>
        controller.update(
          project.idProyecto,
          task.idTarea,
          { userId: leader.idUsuario },
          { tituloTarea: 'Editado en ACTIVO' } as any,
        ),
      );
      const editada = await prisma.tarea.findUnique({ where: { idTarea: task.idTarea } });
      expect(editada?.tituloTarea).toBe('Editado en ACTIVO');

      // --- EN_FINALIZACION ---
      await prisma.sprint.update({
        where: { idSprint: sprint.idSprint },
        data: { estado: 'EN_FINALIZACION' },
      });

      let rejectionFinalizacion: unknown;
      try {
        await runThroughRealGuard('update', project.idProyecto, () =>
          controller.update(
            project.idProyecto,
            task.idTarea,
            { userId: leader.idUsuario },
            { tituloTarea: 'Editado en finalizacion' } as any,
          ),
        );
      } catch (error) {
        rejectionFinalizacion = error;
      }
      expect(rejectionFinalizacion).toBeInstanceOf(ConflictException);
      const sinCambiosFinalizacion = await prisma.tarea.findUnique({ where: { idTarea: task.idTarea } });
      expect(sinCambiosFinalizacion?.tituloTarea).toBe('Editado en ACTIVO');
    });

    it('ASSIGN TASK: bloqueada sin Sprint operable, permitida en ACTIVO, bloqueada en EN_FINALIZACION', async () => {
      const leader = await createIntegrationUser(prisma);
      const assignee = await createIntegrationUser(prisma);
      scope.userIds = [leader.idUsuario, assignee.idUsuario];
      const project = await createIntegrationProject(prisma, leader.idUsuario);
      scope.projectIds = [project.idProyecto];

      const role = await createIntegrationProjectRole(prisma, project.idProyecto);
      scope.roleIds = [role.idRolProyecto];
      const participation = await createIntegrationParticipation(
        prisma,
        assignee.idUsuario,
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

      // --- SIN SPRINT OPERABLE ---
      await prisma.sprint.update({ where: { idSprint: sprint.idSprint }, data: { estado: 'CERRADO' } });

      let rejection: unknown;
      try {
        await runThroughRealGuard('assign', project.idProyecto, () =>
          controller.assign(
            project.idProyecto,
            task.idTarea,
            { userId: leader.idUsuario },
            { idUsuario: assignee.idUsuario } as any,
          ),
        );
      } catch (error) {
        rejection = error;
      }
      expect(rejection).toBeInstanceOf(ConflictException);
      const conteoSinSprint = await prisma.asignacionTarea.count({
        where: { idTarea: task.idTarea, desasignadaEn: null },
      });
      expect(conteoSinSprint).toBe(0);

      // --- ACTIVO ---
      await prisma.sprint.update({ where: { idSprint: sprint.idSprint }, data: { estado: 'ACTIVO' } });

      await runThroughRealGuard('assign', project.idProyecto, () =>
        controller.assign(
          project.idProyecto,
          task.idTarea,
          { userId: leader.idUsuario },
          { idUsuario: assignee.idUsuario } as any,
        ),
      );
      const asignacionActiva = await prisma.asignacionTarea.findFirst({
        where: { idTarea: task.idTarea, desasignadaEn: null },
      });
      expect(asignacionActiva?.idUsuario).toBe(assignee.idUsuario);
      scope.assignmentIds = [asignacionActiva!.idAsignacion];

      // --- EN_FINALIZACION ---
      await prisma.sprint.update({
        where: { idSprint: sprint.idSprint },
        data: { estado: 'EN_FINALIZACION' },
      });

      let rejectionFinalizacion: unknown;
      try {
        await runThroughRealGuard('assign', project.idProyecto, () =>
          controller.assign(
            project.idProyecto,
            task.idTarea,
            { userId: leader.idUsuario },
            { idUsuario: leader.idUsuario } as any,
          ),
        );
      } catch (error) {
        rejectionFinalizacion = error;
      }
      expect(rejectionFinalizacion).toBeInstanceOf(ConflictException);
      const asignacionSinCambios = await prisma.asignacionTarea.findFirst({
        where: { idTarea: task.idTarea, desasignadaEn: null },
      });
      expect(asignacionSinCambios?.idUsuario).toBe(assignee.idUsuario); // no cambió durante EN_FINALIZACION
    });
  },
);
