import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { ConflictException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
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
import { NotificationsService } from '../../src/notifications/notifications.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TasksAuthorizationService } from '../../src/tasks/tasks-authorization.service';
import { TasksContextService } from '../../src/tasks/tasks-context.service';
import { TasksRelationsService } from '../../src/tasks/tasks-relations.service';
import { TasksService } from '../../src/tasks/tasks.service';

function makeTasksService(prisma: PrismaClient): TasksService {
  const prismaService = prisma as unknown as PrismaService;
  return new TasksService(
    prismaService,
    {} as unknown as TasksAuthorizationService,
    {} as unknown as TasksRelationsService,
    {} as unknown as NotificationsService,
    new TasksContextService(prismaService),
  );
}

function longContent(label: string): string {
  return `${label} ${'avance histórico persistido contra PostgreSQL real '.repeat(7)}`;
}

function decimalToNumber(value: unknown): number {
  return Number(value);
}

async function createActiveParticipant(prisma: PrismaClient, idProyecto: number, userId: number) {
  const role = await createIntegrationProjectRole(prisma, idProyecto);
  const participation = await createIntegrationParticipation(prisma, userId, role.idRolProyecto, {
    estadoParticipacion: 'ACTIVO',
  });
  return { role, participation };
}

describeIntegration('B3 inmutabilidad de horas e histórico multi-tramo (PostgreSQL real)', () => {
  let prisma: PrismaClient;
  let scope: IntegrationCleanupScope;

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
    const assignmentIds = scope.assignmentIds ?? [];
    if (assignmentIds.length > 0) {
      await prisma.registroAvanceAsignacion.deleteMany({
        where: { idAsignacion: { in: assignmentIds } },
      });
    }
    await cleanupIntegrationFixtures(prisma, scope);
  });

  it('rechaza reescribir horasReales de un tramo cerrado desde la superficie pública de cierre', async () => {
    const leader = await createIntegrationUser(prisma);
    const assignee = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario, assignee.idUsuario];

    const project = await createIntegrationProject(prisma, leader.idUsuario);
    scope.projectIds = [project.idProyecto];

    const { role, participation } = await createActiveParticipant(prisma, project.idProyecto, assignee.idUsuario);
    scope.roleIds = [role.idRolProyecto];
    scope.participationIds = [participation.idParticipacion];

    const sprint = await createIntegrationSprint(prisma, project.idProyecto);
    scope.sprintIds = [sprint.idSprint];

    const task = await createIntegrationTask(prisma, project.idProyecto, leader.idUsuario, sprint.idSprint);
    scope.taskIds = [task.idTarea];

    const assignment = await createIntegrationTaskAssignment(
      prisma,
      task.idTarea,
      assignee.idUsuario,
      leader.idUsuario,
    );
    scope.assignmentIds = [assignment.idAsignacion];

    const service = makeTasksService(prisma);
    await service.closeAssignment(project.idProyecto, task.idTarea, assignment.idAsignacion, assignee.idUsuario, {
      horasReales: 3,
      contenidoAvance: longContent('primer cierre horas 3'),
      marcarComoHecha: false,
    });

    const closed = await prisma.asignacionTarea.findUniqueOrThrow({
      where: { idAsignacion: assignment.idAsignacion },
      select: { horasReales: true, desasignadaEn: true },
    });
    expect(decimalToNumber(closed.horasReales)).toBe(3);
    expect(closed.desasignadaEn).not.toBeNull();

    await expect(
      service.closeAssignment(project.idProyecto, task.idTarea, assignment.idAsignacion, assignee.idUsuario, {
        horasReales: 99,
        contenidoAvance: longContent('segundo intento horas 99'),
        marcarComoHecha: false,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const afterRejectedRewrite = await prisma.asignacionTarea.findUniqueOrThrow({
      where: { idAsignacion: assignment.idAsignacion },
      select: { horasReales: true, desasignadaEn: true },
    });
    expect(decimalToNumber(afterRejectedRewrite.horasReales)).toBe(3);
    expect(afterRejectedRewrite.desasignadaEn).toEqual(closed.desasignadaEn);
  });

  it('preserva tres tramos A-B-A y la suma real de Usuario A es 3 + 2 = 5 sin contaminarse con B', async () => {
    const leader = await createIntegrationUser(prisma);
    const userA = await createIntegrationUser(prisma);
    const userB = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario, userA.idUsuario, userB.idUsuario];

    const project = await createIntegrationProject(prisma, leader.idUsuario);
    scope.projectIds = [project.idProyecto];

    const participantA = await createActiveParticipant(prisma, project.idProyecto, userA.idUsuario);
    const participantB = await createActiveParticipant(prisma, project.idProyecto, userB.idUsuario);
    scope.roleIds = [participantA.role.idRolProyecto, participantB.role.idRolProyecto];
    scope.participationIds = [
      participantA.participation.idParticipacion,
      participantB.participation.idParticipacion,
    ];

    const sprint = await createIntegrationSprint(prisma, project.idProyecto);
    scope.sprintIds = [sprint.idSprint];

    const task = await createIntegrationTask(prisma, project.idProyecto, leader.idUsuario, sprint.idSprint);
    scope.taskIds = [task.idTarea];

    const service = makeTasksService(prisma);

    const tramoA1 = await createIntegrationTaskAssignment(
      prisma,
      task.idTarea,
      userA.idUsuario,
      leader.idUsuario,
    );
    await service.closeAssignment(project.idProyecto, task.idTarea, tramoA1.idAsignacion, userA.idUsuario, {
      horasReales: 3,
      contenidoAvance: longContent('tramo A1 horas 3'),
      marcarComoHecha: false,
    });

    const tramoB = await createIntegrationTaskAssignment(
      prisma,
      task.idTarea,
      userB.idUsuario,
      leader.idUsuario,
    );
    await service.closeAssignment(project.idProyecto, task.idTarea, tramoB.idAsignacion, userB.idUsuario, {
      horasReales: 8,
      contenidoAvance: longContent('tramo B horas 8'),
      marcarComoHecha: false,
    });

    const tramoA2 = await createIntegrationTaskAssignment(
      prisma,
      task.idTarea,
      userA.idUsuario,
      leader.idUsuario,
    );
    await service.closeAssignment(project.idProyecto, task.idTarea, tramoA2.idAsignacion, userA.idUsuario, {
      horasReales: 2,
      contenidoAvance: longContent('tramo A2 horas 2'),
      marcarComoHecha: false,
    });
    scope.assignmentIds = [tramoA1.idAsignacion, tramoB.idAsignacion, tramoA2.idAsignacion];

    const tramos = await prisma.asignacionTarea.findMany({
      where: { idTarea: task.idTarea },
      orderBy: { idAsignacion: 'asc' },
      select: { idAsignacion: true, idUsuario: true, horasReales: true, desasignadaEn: true },
    });
    expect(tramos).toHaveLength(3);
    expect(new Set(tramos.map((tramo) => tramo.idAsignacion)).size).toBe(3);
    expect(tramos.every((tramo) => tramo.desasignadaEn !== null)).toBe(true);

    const tramosA = tramos.filter((tramo) => tramo.idUsuario === userA.idUsuario);
    const tramosB = tramos.filter((tramo) => tramo.idUsuario === userB.idUsuario);
    expect(tramosA.map((tramo) => decimalToNumber(tramo.horasReales))).toEqual([3, 2]);
    expect(tramosB.map((tramo) => decimalToNumber(tramo.horasReales))).toEqual([8]);

    const sumA = await prisma.asignacionTarea.aggregate({
      where: {
        idTarea: task.idTarea,
        idUsuario: userA.idUsuario,
        desasignadaEn: { not: null },
      },
      _sum: { horasReales: true },
    });
    expect(decimalToNumber(sumA._sum.horasReales)).toBe(5);
  });
});
