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
  return `${label} ${'avance verificado contra PostgreSQL real '.repeat(7)}`;
}

function decimalToNumber(value: unknown): number {
  return Number(value);
}

describeIntegration('B3 cierre concurrente de AsignacionTarea (PostgreSQL real)', () => {
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

  it('dos cierres simultáneos del mismo tramo producen exactamente un éxito y un rechazo sin escritura parcial', async () => {
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
    const requestA = {
      horasReales: 3,
      contenidoAvance: longContent('request A horas 3'),
      marcarComoHecha: false,
    };
    const requestB = {
      horasReales: 7,
      contenidoAvance: longContent('request B horas 7'),
      marcarComoHecha: false,
    };

    const results = await Promise.allSettled([
      service.closeAssignment(
        project.idProyecto,
        task.idTarea,
        assignment.idAsignacion,
        assignee.idUsuario,
        requestA,
      ),
      service.closeAssignment(
        project.idProyecto,
        task.idTarea,
        assignment.idAsignacion,
        assignee.idUsuario,
        requestB,
      ),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);

    const finalAssignment = await prisma.asignacionTarea.findUniqueOrThrow({
      where: { idAsignacion: assignment.idAsignacion },
      select: { desasignadaEn: true, horasReales: true },
    });
    expect(finalAssignment.desasignadaEn).not.toBeNull();

    const finalHours = decimalToNumber(finalAssignment.horasReales);
    expect([requestA.horasReales, requestB.horasReales]).toContain(finalHours);

    const progressRecords = await prisma.registroAvanceAsignacion.findMany({
      where: { idAsignacion: assignment.idAsignacion },
      select: { idAutor: true, contenido: true },
    });
    expect(progressRecords).toHaveLength(1);
    expect(progressRecords[0].idAutor).toBe(assignee.idUsuario);
    expect(progressRecords[0].contenido).toBe(
      finalHours === requestA.horasReales ? requestA.contenidoAvance : requestB.contenidoAvance,
    );
  });
});
