import { vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { NotificationsService } from '../../../src/notifications/notifications.service';
import type { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { BitacoraEventosService } from '../../../src/bitacora/bitacora-eventos.service';
import { ProjectTransactionService } from '../../../src/common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../../../src/common/project-policy/project-policy.service';
import { ProjectIdResolverService } from '../../../src/common/project-policy/project-id-resolver.service';
import { ProjectReadPolicyService } from '../../../src/common/project-policy/project-read-policy.service';
import { ProjectEligibilityService } from '../../../src/eligibility/project-eligibility.service';
import { LeadershipReadService } from '../../../src/leadership/leadership-read.service';
import { LeadershipService } from '../../../src/leadership/leadership.service';
import * as fixtures from './fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './cleanup';

/**
 * C092 (06 v2 §6/§17/§47 T17–T20): pila real de liderazgo sobre PostgreSQL.
 * Solo el gateway de sockets es un doble: la persistencia de notificaciones y
 * de bitácora ocurre dentro de la transacción de dominio y forma parte del
 * contrato, así que se ejercita de verdad.
 */
export function leadershipStack(db: PrismaClient) {
  const prisma = db as unknown as PrismaService;
  const gateway = {
    server: {},
    notifyUsers: vi.fn().mockResolvedValue(undefined),
    emitToUsers: vi.fn().mockResolvedValue(undefined),
  };
  const notifications = new NotificationsService(prisma, gateway as unknown as NotificationsGateway);
  const runner = new ProjectTransactionService(prisma);
  const policy = new ProjectPolicyService(new ProjectIdResolverService(prisma));
  const readPolicy = new ProjectReadPolicyService(prisma);
  const eligibility = new ProjectEligibilityService(prisma);
  const audit = new BitacoraEventosService();
  const read = new LeadershipReadService(prisma, readPolicy, eligibility);
  const service = new LeadershipService(prisma, runner, policy, eligibility, notifications, audit);
  return { read, service, runner, policy, readPolicy, eligibility, notifications, gateway, audit };
}

/** IDs adicionales que el cleanup de liderazgo debe recoger. */
export interface LeadershipCleanupScope extends IntegrationCleanupScope {
  exitRequestIds?: number[];
  accessRoleUserIds?: number[];
}

export function collectInto<K extends keyof LeadershipCleanupScope>(
  scope: LeadershipCleanupScope,
  key: K,
  ids: number[],
): void {
  scope[key] = [...((scope[key] ?? []) as number[]), ...ids] as LeadershipCleanupScope[K];
}

/** Administrador real: el perfil se consulta de BD, nunca se simula en el actor. */
export async function createIntegrationAdmin(db: PrismaClient, scope: LeadershipCleanupScope) {
  const admin = await fixtures.createIntegrationUser(db);
  collectInto(scope, 'userIds', [admin.idUsuario]);
  const rol = await db.rolAcceso.upsert({
    where: { nombrePerfil: 'administrador' },
    update: {},
    create: { nombrePerfil: 'administrador' },
  });
  await db.usuarioRolAcceso.create({
    data: { idUsuario: admin.idUsuario, idRolAcceso: rol.idRolAcceso },
  });
  collectInto(scope, 'accessRoleUserIds', [admin.idUsuario]);
  return admin;
}

/**
 * Escenario base de Q1: un proyecto EN_PROGRESO cuyo líder NO tiene
 * participación activa y un proyecto gemelo cuyo líder SÍ tiene dos. Los
 * candidatos cubren las cuatro respuestas de elegibilidad que §17 distingue:
 * elegible, con salida abierta, retirado y deshabilitado.
 */
export async function leadershipFixture(db: PrismaClient, scope: LeadershipCleanupScope) {
  const leaderSinParticipacion = await fixtures.createIntegrationUser(db);
  const leaderConParticipacion = await fixtures.createIntegrationUser(db);
  const elegible = await fixtures.createIntegrationUser(db);
  const conSalidaAbierta = await fixtures.createIntegrationUser(db);
  const retirado = await fixtures.createIntegrationUser(db);
  const deshabilitado = await fixtures.createIntegrationUser(db);
  collectInto(scope, 'userIds', [
    leaderSinParticipacion.idUsuario,
    leaderConParticipacion.idUsuario,
    elegible.idUsuario,
    conSalidaAbierta.idUsuario,
    retirado.idUsuario,
    deshabilitado.idUsuario,
  ]);
  await db.usuario.update({
    where: { idUsuario: deshabilitado.idUsuario },
    data: { estado: 'INACTIVO' },
  });
  const admin = await createIntegrationAdmin(db, scope);

  const project = await fixtures.createIntegrationProject(db, leaderSinParticipacion.idUsuario, {
    estadoProyecto: 'EN_PROGRESO',
  });
  const twin = await fixtures.createIntegrationProject(db, leaderConParticipacion.idUsuario, {
    estadoProyecto: 'EN_PROGRESO',
  });
  collectInto(scope, 'projectIds', [project.idProyecto, twin.idProyecto]);

  const role = await fixtures.createIntegrationProjectRole(db, project.idProyecto, { cupos: 8 });
  collectInto(scope, 'roleIds', [role.idRolProyecto]);
  const twinRoleA = await fixtures.createIntegrationProjectRole(db, twin.idProyecto, { cupos: 4 });
  const twinRoleB = await fixtures.createIntegrationProjectRole(db, twin.idProyecto, { cupos: 4 });
  collectInto(scope, 'roleIds', [twinRoleA.idRolProyecto, twinRoleB.idRolProyecto]);

  const participaciones = await Promise.all([
    fixtures.createIntegrationParticipation(db, elegible.idUsuario, role.idRolProyecto, {
      estadoParticipacion: 'ACTIVO',
    }),
    fixtures.createIntegrationParticipation(db, conSalidaAbierta.idUsuario, role.idRolProyecto, {
      estadoParticipacion: 'ACTIVO',
    }),
    fixtures.createIntegrationParticipation(db, retirado.idUsuario, role.idRolProyecto, {
      estadoParticipacion: 'RETIRADO',
    }),
    fixtures.createIntegrationParticipation(db, deshabilitado.idUsuario, role.idRolProyecto, {
      estadoParticipacion: 'ACTIVO',
    }),
  ]);
  const twinParticipaciones = await Promise.all([
    fixtures.createIntegrationParticipation(db, leaderConParticipacion.idUsuario, twinRoleA.idRolProyecto, {
      estadoParticipacion: 'ACTIVO',
    }),
    fixtures.createIntegrationParticipation(db, leaderConParticipacion.idUsuario, twinRoleB.idRolProyecto, {
      estadoParticipacion: 'ACTIVO',
    }),
  ]);
  collectInto(scope, 'participationIds', [
    ...participaciones.map((fila) => fila.idParticipacion),
    ...twinParticipaciones.map((fila) => fila.idParticipacion),
  ]);

  // Hechos objetivos del candidato elegible: una tarea y horas granulares
  // efectivas. Existen para que la lista los REPORTE, no para ordenarla.
  const sprint = await fixtures.createIntegrationSprint(db, project.idProyecto, { estado: 'ACTIVO' });
  collectInto(scope, 'sprintIds', [sprint.idSprint]);
  const task = await fixtures.createIntegrationTask(
    db,
    project.idProyecto,
    leaderSinParticipacion.idUsuario,
    sprint.idSprint,
  );
  collectInto(scope, 'taskIds', [task.idTarea]);
  const assignment = await fixtures.createIntegrationTaskAssignment(
    db,
    task.idTarea,
    elegible.idUsuario,
    leaderSinParticipacion.idUsuario,
    { idParticipacion: participaciones[0].idParticipacion, horasReales: '4.25' },
  );
  collectInto(scope, 'assignmentIds', [assignment.idAsignacion]);
  await db.registroTiempoTarea.create({
    data: {
      idAsignacion: assignment.idAsignacion,
      idUsuario: elegible.idUsuario,
      horas: '4.25',
      fecha: new Date('2026-09-01T00:00:00.000Z'),
    },
  });

  const salida = await db.solicitudSalidaProyecto.create({
    data: {
      idProyecto: project.idProyecto,
      idUsuario: conSalidaAbierta.idUsuario,
      motivo: 'salida abierta del candidato',
      estadoSolicitud: 'PENDIENTE_LIDER',
    },
  });
  collectInto(scope, 'exitRequestIds', [salida.idSolicitud]);

  return {
    admin,
    leaderSinParticipacion,
    leaderConParticipacion,
    elegible,
    conSalidaAbierta,
    retirado,
    deshabilitado,
    project,
    twin,
    role,
    twinRoleA,
    twinRoleB,
    sprint,
    task,
    assignment,
    salida,
  };
}

export async function cleanupLeadershipFixture(
  db: PrismaClient,
  scope: LeadershipCleanupScope,
): Promise<void> {
  const projectIds = scope.projectIds ?? [];
  await db.bitacoraAuditoria.deleteMany({ where: { idUsuario: { in: scope.userIds ?? [] } } });
  await db.notificacion.deleteMany({ where: { idUsuario: { in: scope.userIds ?? [] } } });
  // El historial referencia la apelación con FK RESTRICT: primero la historia.
  await db.historialLiderazgo.deleteMany({ where: { idProyecto: { in: projectIds } } });
  await db.apelacionLiderazgo.deleteMany({ where: { idProyecto: { in: projectIds } } });
  await db.solicitudSalidaProyecto.deleteMany({
    where: { idSolicitud: { in: scope.exitRequestIds ?? [] } },
  });
  await db.usuarioRolAcceso.deleteMany({
    where: { idUsuario: { in: scope.accessRoleUserIds ?? [] } },
  });
  await db.horasParticipacion.deleteMany({
    where: { idParticipacion: { in: scope.participationIds ?? [] } },
  });
  await db.registroAvanceAsignacion.deleteMany({
    where: { idAsignacion: { in: scope.assignmentIds ?? [] } },
  });
  await cleanupIntegrationFixtures(db, scope);
}
