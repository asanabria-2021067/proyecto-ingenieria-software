import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import {
  createIntegrationParticipation,
  createIntegrationProject,
  createIntegrationProjectRole,
  createIntegrationSprint,
  createIntegrationTask,
  createIntegrationUser,
} from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';
import { makeTimeRecordsService } from '../helpers/time-records.fixture';
import { TasksService } from '../../src/tasks/tasks.service';
import { TasksContextService } from '../../src/tasks/tasks-context.service';
import { TasksRelationsService } from '../../src/tasks/tasks-relations.service';
import type { TasksAuthorizationService } from '../../src/tasks/tasks-authorization.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import type { NotificationsService } from '../../src/notifications/notifications.service';
import { ProjectTransactionService } from '../../src/common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../../src/common/project-policy/project-policy.service';
import { ProjectIdResolverService } from '../../src/common/project-policy/project-id-resolver.service';
import { ProjectReadPolicyService } from '../../src/common/project-policy/project-read-policy.service';

/**
 * HU-202/T-385: `TasksService.bulkAction` contra PostgreSQL real. Demuestra
 * lo que un mock no puede: que la operación es atómica de verdad (si una
 * tarea falla, las que ya se habían escrito en la misma transacción se
 * revierten) y que el permiso de líder y el aislamiento por proyecto se
 * aplican sobre datos reales. Se activa solo con `INTEGRATION_DATABASE_URL`;
 * sin esa variable, SKIP limpio (describeIntegration).
 */
describeIntegration('TasksService.bulkAction — acciones masivas — PostgreSQL real', () => {
  let prisma: PrismaClient;
  let service: TasksService;
  let scope: IntegrationCleanupScope;

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    const prismaService = prisma as unknown as PrismaService;
    const context = new TasksContextService(prismaService);
    service = new TasksService(
      prismaService,
      {} as unknown as TasksAuthorizationService,
      new TasksRelationsService(prismaService, context),
      { notifyUsers: vi.fn().mockResolvedValue(undefined) } as unknown as NotificationsService,
      context,
      new ProjectTransactionService(prismaService),
      new ProjectPolicyService(new ProjectIdResolverService(prismaService)),
      new ProjectReadPolicyService(prismaService),
      makeTimeRecordsService(prismaService),
    );
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    scope = {};
  });

  afterEach(async () => {
    const asignaciones = await prisma.asignacionTarea.findMany({
      where: { idTarea: { in: scope.taskIds ?? [] } },
      select: { idAsignacion: true },
    });
    scope.assignmentIds = asignaciones.map((a) => a.idAsignacion);
    await cleanupIntegrationFixtures(prisma, scope);
  });

  async function proyectoConTareas(titulos: string[]) {
    const leader = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario];
    const project = await createIntegrationProject(prisma, leader.idUsuario, { estadoProyecto: 'EN_PROGRESO' });
    scope.projectIds = [project.idProyecto];
    const sprint = await createIntegrationSprint(prisma, project.idProyecto, { estado: 'ACTIVO' });
    scope.sprintIds = [sprint.idSprint];
    const tareas = [];
    for (const tituloTarea of titulos) {
      tareas.push(await createIntegrationTask(prisma, project.idProyecto, leader.idUsuario, sprint.idSprint, { tituloTarea }));
    }
    scope.taskIds = tareas.map((t) => t.idTarea);
    return { leader, project, sprint, tareas };
  }

  it('mueve varias tareas de columna en una sola operación', async () => {
    const { leader, project, tareas } = await proyectoConTareas(['HU-202 A', 'HU-202 B']);

    const resultado = await service.bulkAction(project.idProyecto, leader.idUsuario, {
      idsTareas: tareas.map((t) => t.idTarea),
      accion: 'MOVER',
      estadoTarea: 'EN_REVISION',
    });

    expect(resultado.idsActualizadas.sort()).toEqual(tareas.map((t) => t.idTarea).sort());
    const persistidas = await prisma.tarea.findMany({ where: { idTarea: { in: scope.taskIds } } });
    expect(persistidas.every((t) => t.estadoTarea === 'EN_REVISION')).toBe(true);
  });

  it('un integrante que no es el líder recibe 403 y nada cambia', async () => {
    const { project, tareas } = await proyectoConTareas(['HU-202 permiso']);
    const otro = await createIntegrationUser(prisma);
    scope.userIds = [...(scope.userIds ?? []), otro.idUsuario];

    await expect(
      service.bulkAction(project.idProyecto, otro.idUsuario, {
        idsTareas: [tareas[0].idTarea],
        accion: 'MOVER',
        estadoTarea: 'HECHO',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const intacta = await prisma.tarea.findUniqueOrThrow({ where: { idTarea: tareas[0].idTarea } });
    expect(intacta.estadoTarea).toBe('POR_HACER');
  });

  it('una tarea de OTRO proyecto rechaza toda la operación (404) y ninguna se mueve', async () => {
    const { leader, project, tareas } = await proyectoConTareas(['HU-202 propia']);
    const ajeno = await createIntegrationProject(prisma, leader.idUsuario, { estadoProyecto: 'EN_PROGRESO' });
    scope.projectIds = [...(scope.projectIds ?? []), ajeno.idProyecto];
    const sprintAjeno = await createIntegrationSprint(prisma, ajeno.idProyecto, { estado: 'ACTIVO' });
    scope.sprintIds = [...(scope.sprintIds ?? []), sprintAjeno.idSprint];
    const tareaAjena = await createIntegrationTask(prisma, ajeno.idProyecto, leader.idUsuario, sprintAjeno.idSprint);
    scope.taskIds = [...(scope.taskIds ?? []), tareaAjena.idTarea];

    await expect(
      service.bulkAction(project.idProyecto, leader.idUsuario, {
        idsTareas: [tareas[0].idTarea, tareaAjena.idTarea],
        accion: 'MOVER',
        estadoTarea: 'HECHO',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const persistidas = await prisma.tarea.findMany({ where: { idTarea: { in: scope.taskIds } } });
    expect(persistidas.every((t) => t.estadoTarea === 'POR_HACER')).toBe(true);
  });

  it('atomicidad: si la segunda tarea no admite al integrante, la asignación de la primera se revierte', async () => {
    const { leader, project, sprint, tareas } = await proyectoConTareas(['HU-202 sin rol']);
    const rolA = await createIntegrationProjectRole(prisma, project.idProyecto);
    const rolB = await createIntegrationProjectRole(prisma, project.idProyecto);
    scope.roleIds = [rolA.idRolProyecto, rolB.idRolProyecto];
    const integrante = await createIntegrationUser(prisma);
    scope.userIds = [...(scope.userIds ?? []), integrante.idUsuario];
    const participacion = await createIntegrationParticipation(prisma, integrante.idUsuario, rolA.idRolProyecto);
    scope.participationIds = [participacion.idParticipacion];
    // El integrante solo participa en el rol A; esta tarea es del rol B.
    const tareaRolB = await createIntegrationTask(prisma, project.idProyecto, leader.idUsuario, sprint.idSprint, {
      tituloTarea: 'HU-202 rol B',
      idRolProyecto: rolB.idRolProyecto,
    });
    scope.taskIds = [...(scope.taskIds ?? []), tareaRolB.idTarea];

    const error = await service
      .bulkAction(project.idProyecto, leader.idUsuario, {
        idsTareas: [tareas[0].idTarea, tareaRolB.idTarea],
        accion: 'ASIGNAR',
        idUsuario: integrante.idUsuario,
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).message).toContain('HU-202 rol B');
    const asignaciones = await prisma.asignacionTarea.count({ where: { idTarea: { in: scope.taskIds } } });
    expect(asignaciones).toBe(0);
  });
});
