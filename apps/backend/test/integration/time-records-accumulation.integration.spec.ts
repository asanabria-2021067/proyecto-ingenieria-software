import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
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
import { TimeRecordsService } from '../../src/time-records/time-records.service';

function decimalToNumber(value: unknown): number {
  return Number(value);
}

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

function makeTimeRecordsService(prisma: PrismaClient): TimeRecordsService {
  const prismaService = prisma as unknown as PrismaService;
  const notifications = { notifyTaskHoursLogged: async () => undefined } as unknown as NotificationsService;
  return new TimeRecordsService(prismaService, new TasksContextService(prismaService), notifications);
}

function longContent(label: string): string {
  return `${label} ${'avance histórico persistido contra PostgreSQL real '.repeat(7)}`;
}

async function createActiveParticipant(prisma: PrismaClient, idProyecto: number, userId: number) {
  const role = await createIntegrationProjectRole(prisma, idProyecto);
  const participation = await createIntegrationParticipation(prisma, userId, role.idRolProyecto, {
    estadoParticipacion: 'ACTIVO',
  });
  return { role, participation };
}

describeIntegration('HU-142 (T-170) acumulación e inmutabilidad de RegistroTiempoTarea (PostgreSQL real)', () => {
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
      await prisma.registroTiempoTarea.deleteMany({ where: { idAsignacion: { in: assignmentIds } } });
      // closeAssignment (usado en los tests de inmutabilidad e historial de
      // tramos) crea también un RegistroAvanceAsignacion por cada cierre —
      // mismo FK RESTRICT que bloquea el deleteMany de asignacionTarea en
      // cleanupIntegrationFixtures si no se limpia antes (ver
      // assignment-hours-immutability.integration.spec.ts, mismo patrón).
      await prisma.registroAvanceAsignacion.deleteMany({ where: { idAsignacion: { in: assignmentIds } } });
    }
    await cleanupIntegrationFixtures(prisma, scope);
  });

  it('cada registro nuevo recalcula horasReales del tramo activo como la SUMA de todos los registros', async () => {
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

    const service = makeTimeRecordsService(prisma);

    await service.create(project.idProyecto, task.idTarea, assignee.idUsuario, {
      horas: 2,
      fecha: '2026-08-20',
    });
    await service.create(project.idProyecto, task.idTarea, assignee.idUsuario, {
      horas: 1.5,
      fecha: '2026-08-21',
    });
    await service.create(project.idProyecto, task.idTarea, assignee.idUsuario, {
      horas: 3,
      fecha: '2026-08-22',
    });

    const tramo = await prisma.asignacionTarea.findUniqueOrThrow({
      where: { idAsignacion: assignment.idAsignacion },
      select: { horasReales: true },
    });
    expect(decimalToNumber(tramo.horasReales)).toBe(6.5);

    const registros = await prisma.registroTiempoTarea.findMany({
      where: { idAsignacion: assignment.idAsignacion },
    });
    expect(registros).toHaveLength(3);
  });

  it('rechaza que otro usuario registre horas sobre el tramo activo de otra persona', async () => {
    const leader = await createIntegrationUser(prisma);
    const assignee = await createIntegrationUser(prisma);
    const otro = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario, assignee.idUsuario, otro.idUsuario];

    const project = await createIntegrationProject(prisma, leader.idUsuario);
    scope.projectIds = [project.idProyecto];

    const { role, participation } = await createActiveParticipant(prisma, project.idProyecto, assignee.idUsuario);
    const otroParticipacion = await createActiveParticipant(prisma, project.idProyecto, otro.idUsuario);
    scope.roleIds = [role.idRolProyecto, otroParticipacion.role.idRolProyecto];
    scope.participationIds = [participation.idParticipacion, otroParticipacion.participation.idParticipacion];

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

    const service = makeTimeRecordsService(prisma);

    await expect(
      service.create(project.idProyecto, task.idTarea, otro.idUsuario, { horas: 1, fecha: '2026-08-20' }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.create(project.idProyecto, task.idTarea, leader.idUsuario, { horas: 1, fecha: '2026-08-20' }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const registros = await prisma.registroTiempoTarea.findMany({
      where: { idAsignacion: assignment.idAsignacion },
    });
    expect(registros).toHaveLength(0);
  });

  it('una vez cerrado el tramo (closeAssignment), rechaza nuevos registros y horasReales permanece inmutable', async () => {
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

    const timeRecords = makeTimeRecordsService(prisma);
    const tasks = makeTasksService(prisma);

    await timeRecords.create(project.idProyecto, task.idTarea, assignee.idUsuario, {
      horas: 4,
      fecha: '2026-08-20',
    });

    await tasks.closeAssignment(project.idProyecto, task.idTarea, assignment.idAsignacion, assignee.idUsuario, {
      horasReales: 99,
      contenidoAvance: longContent('cierre manual ignora el acumulado granular'),
      marcarComoHecha: false,
    });

    const cerrado = await prisma.asignacionTarea.findUniqueOrThrow({
      where: { idAsignacion: assignment.idAsignacion },
      select: { horasReales: true, desasignadaEn: true },
    });
    expect(cerrado.desasignadaEn).not.toBeNull();

    await expect(
      timeRecords.create(project.idProyecto, task.idTarea, assignee.idUsuario, {
        horas: 1,
        fecha: '2026-08-23',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const sinCambios = await prisma.asignacionTarea.findUniqueOrThrow({
      where: { idAsignacion: assignment.idAsignacion },
      select: { horasReales: true },
    });
    expect(decimalToNumber(sinCambios.horasReales)).toBe(decimalToNumber(cerrado.horasReales));

    const registros = await prisma.registroTiempoTarea.findMany({
      where: { idAsignacion: assignment.idAsignacion },
    });
    expect(registros).toHaveLength(1);
  });

  it('preserva el historial de dos tramos A-B del mismo usuario: cada suma queda aislada por idAsignacion', async () => {
    const leader = await createIntegrationUser(prisma);
    const userA = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario, userA.idUsuario];

    const project = await createIntegrationProject(prisma, leader.idUsuario);
    scope.projectIds = [project.idProyecto];

    const { role, participation } = await createActiveParticipant(prisma, project.idProyecto, userA.idUsuario);
    scope.roleIds = [role.idRolProyecto];
    scope.participationIds = [participation.idParticipacion];

    const sprint = await createIntegrationSprint(prisma, project.idProyecto);
    scope.sprintIds = [sprint.idSprint];

    const task = await createIntegrationTask(prisma, project.idProyecto, leader.idUsuario, sprint.idSprint);
    scope.taskIds = [task.idTarea];

    const timeRecords = makeTimeRecordsService(prisma);
    const tasks = makeTasksService(prisma);

    const tramo1 = await createIntegrationTaskAssignment(prisma, task.idTarea, userA.idUsuario, leader.idUsuario);
    await timeRecords.create(project.idProyecto, task.idTarea, userA.idUsuario, { horas: 3, fecha: '2026-08-10' });
    await tasks.closeAssignment(project.idProyecto, task.idTarea, tramo1.idAsignacion, userA.idUsuario, {
      horasReales: 3,
      contenidoAvance: longContent('tramo 1 cerrado'),
      marcarComoHecha: false,
    });

    const tramo2 = await createIntegrationTaskAssignment(prisma, task.idTarea, userA.idUsuario, leader.idUsuario);
    await timeRecords.create(project.idProyecto, task.idTarea, userA.idUsuario, { horas: 1, fecha: '2026-08-24' });
    await timeRecords.create(project.idProyecto, task.idTarea, userA.idUsuario, { horas: 1, fecha: '2026-08-25' });
    scope.assignmentIds = [tramo1.idAsignacion, tramo2.idAsignacion];

    const tramos = await prisma.asignacionTarea.findMany({
      where: { idTarea: task.idTarea },
      orderBy: { idAsignacion: 'asc' },
      select: { idAsignacion: true, horasReales: true, desasignadaEn: true },
    });
    expect(tramos.map((t) => decimalToNumber(t.horasReales))).toEqual([3, 2]);
    expect(tramos[0]!.desasignadaEn).not.toBeNull();
    expect(tramos[1]!.desasignadaEn).toBeNull();
  });
});
