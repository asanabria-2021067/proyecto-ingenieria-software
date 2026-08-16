import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
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
import { ExitRequestsAuthorizationService } from '../../src/exit-requests/exit-requests.authorization.service';
import { ExitRequestsContextService } from '../../src/exit-requests/exit-requests.context.service';
import { ExitRequestsService } from '../../src/exit-requests/exit-requests.service';
import { HoursRecognitionService } from '../../src/sprints/hours-recognition.service';
import { SprintsContextService } from '../../src/sprints/sprints-context.service';

function makeExitRequestsService(prisma: PrismaClient) {
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

describeIntegration('B9 resolución de solicitud de salida (PostgreSQL real)', () => {
  let prisma: PrismaClient;
  let service: ExitRequestsService;
  let scope: IntegrationCleanupScope;
  let solicitudIds: number[];

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    service = makeExitRequestsService(prisma);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    scope = {};
    solicitudIds = [];
  });

  afterEach(async () => {
    if (solicitudIds.length > 0) {
      await prisma.solicitudSalidaProyecto.deleteMany({
        where: { idSolicitud: { in: solicitudIds } },
      });
    }
    await cleanupIntegrationFixtures(prisma, scope);
  });

  it('dos aprobaciones concurrentes tienen exactamente un ganador y retiran todos los roles del proyecto sin tocar otros proyectos', async () => {
    const leader = await createIntegrationUser(prisma);
    const member = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario, member.idUsuario];

    const projectP1 = await createIntegrationProject(prisma, leader.idUsuario);
    const projectP2 = await createIntegrationProject(prisma, leader.idUsuario);
    scope.projectIds = [projectP1.idProyecto, projectP2.idProyecto];
    const sprintP1 = await createIntegrationSprint(prisma, projectP1.idProyecto);
    scope.sprintIds = [sprintP1.idSprint];

    const roleP1A = await createIntegrationProjectRole(prisma, projectP1.idProyecto, {
      nombreRol: 'B9 P1 Rol A',
    });
    const roleP1B = await createIntegrationProjectRole(prisma, projectP1.idProyecto, {
      nombreRol: 'B9 P1 Rol B',
    });
    const roleP2 = await createIntegrationProjectRole(prisma, projectP2.idProyecto, {
      nombreRol: 'B9 P2 Rol',
    });
    scope.roleIds = [roleP1A.idRolProyecto, roleP1B.idRolProyecto, roleP2.idRolProyecto];

    const participationP1A = await createIntegrationParticipation(
      prisma,
      member.idUsuario,
      roleP1A.idRolProyecto,
      { estadoParticipacion: 'ACTIVO' },
    );
    const participationP1B = await createIntegrationParticipation(
      prisma,
      member.idUsuario,
      roleP1B.idRolProyecto,
      { estadoParticipacion: 'ACTIVO' },
    );
    const participationP2 = await createIntegrationParticipation(
      prisma,
      member.idUsuario,
      roleP2.idRolProyecto,
      { estadoParticipacion: 'ACTIVO' },
    );
    scope.participationIds = [
      participationP1A.idParticipacion,
      participationP1B.idParticipacion,
      participationP2.idParticipacion,
    ];

    const solicitud = await prisma.solicitudSalidaProyecto.create({
      data: {
        idProyecto: projectP1.idProyecto,
        idUsuario: member.idUsuario,
        motivo: 'B9 concurrencia real',
        estadoSolicitud: 'PENDIENTE_LIDER',
      },
    });
    solicitudIds = [solicitud.idSolicitud];

    const [r1, r2] = await Promise.allSettled([
      service.approveSolicitudSalida(projectP1.idProyecto, solicitud.idSolicitud, leader.idUsuario),
      service.approveSolicitudSalida(projectP1.idProyecto, solicitud.idSolicitud, leader.idUsuario),
    ]);

    const fulfilled = [r1, r2].filter((result) => result.status === 'fulfilled');
    const rejected = [r1, r2].filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);

    const solicitudFinal = await prisma.solicitudSalidaProyecto.findUniqueOrThrow({
      where: { idSolicitud: solicitud.idSolicitud },
      select: { estadoSolicitud: true, resueltaEn: true, resueltaPor: true },
    });
    expect(solicitudFinal.estadoSolicitud).toBe('APROBADA');
    expect(solicitudFinal.resueltaEn).not.toBeNull();
    expect(solicitudFinal.resueltaPor).toBe(leader.idUsuario);

    const participaciones = await prisma.participacionProyecto.findMany({
      where: {
        idParticipacion: {
          in: [
            participationP1A.idParticipacion,
            participationP1B.idParticipacion,
            participationP2.idParticipacion,
          ],
        },
      },
      select: {
        idParticipacion: true,
        estadoParticipacion: true,
        rolProyecto: { select: { idProyecto: true } },
      },
      orderBy: { idParticipacion: 'asc' },
    });

    expect(participaciones).toEqual([
      expect.objectContaining({
        idParticipacion: participationP1A.idParticipacion,
        estadoParticipacion: 'RETIRADO',
        rolProyecto: { idProyecto: projectP1.idProyecto },
      }),
      expect.objectContaining({
        idParticipacion: participationP1B.idParticipacion,
        estadoParticipacion: 'RETIRADO',
        rolProyecto: { idProyecto: projectP1.idProyecto },
      }),
      expect.objectContaining({
        idParticipacion: participationP2.idParticipacion,
        estadoParticipacion: 'ACTIVO',
        rolProyecto: { idProyecto: projectP2.idProyecto },
      }),
    ]);
  });

  it('rechaza una solicitud sin retirar participaciones ni reabrir un tramo histórico cerrado', async () => {
    const leader = await createIntegrationUser(prisma);
    const member = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario, member.idUsuario];

    const project = await createIntegrationProject(prisma, leader.idUsuario);
    scope.projectIds = [project.idProyecto];

    const role = await createIntegrationProjectRole(prisma, project.idProyecto);
    scope.roleIds = [role.idRolProyecto];

    const participation = await createIntegrationParticipation(prisma, member.idUsuario, role.idRolProyecto, {
      estadoParticipacion: 'ACTIVO',
    });
    scope.participationIds = [participation.idParticipacion];

    const sprint = await createIntegrationSprint(prisma, project.idProyecto);
    scope.sprintIds = [sprint.idSprint];

    const task = await createIntegrationTask(prisma, project.idProyecto, leader.idUsuario, sprint.idSprint);
    scope.taskIds = [task.idTarea];

    const assignment = await createIntegrationTaskAssignment(
      prisma,
      task.idTarea,
      member.idUsuario,
      leader.idUsuario,
    );
    scope.assignmentIds = [assignment.idAsignacion];

    const closedAt = new Date('2026-01-20T12:00:00.000Z');
    await prisma.asignacionTarea.update({
      where: { idAsignacion: assignment.idAsignacion },
      data: { desasignadaEn: closedAt, horasReales: 4.5 },
    });

    const solicitud = await prisma.solicitudSalidaProyecto.create({
      data: {
        idProyecto: project.idProyecto,
        idUsuario: member.idUsuario,
        motivo: 'B9 rechazo real',
        estadoSolicitud: 'PENDIENTE_LIDER',
      },
    });
    solicitudIds = [solicitud.idSolicitud];

    await service.rejectSolicitudSalida(project.idProyecto, solicitud.idSolicitud, leader.idUsuario);

    const solicitudFinal = await prisma.solicitudSalidaProyecto.findUniqueOrThrow({
      where: { idSolicitud: solicitud.idSolicitud },
      select: { estadoSolicitud: true, resueltaEn: true, resueltaPor: true },
    });
    expect(solicitudFinal.estadoSolicitud).toBe('RECHAZADA');
    expect(solicitudFinal.resueltaEn).not.toBeNull();
    expect(solicitudFinal.resueltaPor).toBe(leader.idUsuario);

    const participationFinal = await prisma.participacionProyecto.findUniqueOrThrow({
      where: { idParticipacion: participation.idParticipacion },
      select: { estadoParticipacion: true },
    });
    expect(participationFinal.estadoParticipacion).toBe('ACTIVO');

    const assignmentFinal = await prisma.asignacionTarea.findUniqueOrThrow({
      where: { idAsignacion: assignment.idAsignacion },
      select: { desasignadaEn: true, horasReales: true },
    });
    expect(assignmentFinal.desasignadaEn).toEqual(closedAt);
    expect(Number(assignmentFinal.horasReales)).toBe(4.5);
  });
});
