import { vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { SprintsService } from '../../../src/sprints/sprints.service';
import { SprintsContextService } from '../../../src/sprints/sprints-context.service';
import { SprintsAuthorizationService } from '../../../src/sprints/sprints-authorization.service';
import { HoursRecognitionService } from '../../../src/sprints/hours-recognition.service';
import { ProjectHoursSummaryService } from '../../../src/sprints/project-hours-summary.service';
import { TimeRecordsService } from '../../../src/time-records/time-records.service';
import { TasksContextService } from '../../../src/tasks/tasks-context.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { NotificationsService } from '../../../src/notifications/notifications.service';
import { BitacoraEventosService } from '../../../src/bitacora/bitacora-eventos.service';
import { ProjectTransactionService } from '../../../src/common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../../../src/common/project-policy/project-policy.service';
import { ProjectIdResolverService } from '../../../src/common/project-policy/project-id-resolver.service';
import { ProjectReadPolicyService } from '../../../src/common/project-policy/project-read-policy.service';
import * as fixtures from './fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './cleanup';

/**
 * C075 (06 v2 §12/§47 T08): pila real de Flow A contra PostgreSQL. Solo las
 * notificaciones son dobles — persistencia y sockets viven fuera del contrato
 * de consolidación y se cuentan por llamada.
 */
export function flowAStack(db: PrismaClient) {
  const prisma = db as unknown as PrismaService;
  const context = new SprintsContextService(prisma);
  const authorization = new SprintsAuthorizationService(context);
  const runner = new ProjectTransactionService(prisma);
  const audit = new BitacoraEventosService();
  const notifyParticipants = vi.fn().mockResolvedValue(undefined);
  const notifyFinalization = vi.fn().mockResolvedValue(undefined);
  const notifyClosed = vi.fn().mockResolvedValue(undefined);
  // El gateway no participa: la persistencia es lo real, el socket es doble.
  const realNotifications = new NotificationsService(prisma, undefined as never);
  const notifications = {
    notifyProjectActiveParticipants: notifyParticipants,
    notifySprintFinalizationStarted: notifyFinalization,
    notifySprintClosed: notifyClosed,
    // La persistencia de filas de notificación SÍ es real: forma parte de la
    // transacción de dominio y es justo lo que C080/C081 verifican.
    persistTemplateTx: realNotifications.persistTemplateTx.bind(realNotifications),
    persistUsersTx: realNotifications.persistUsersTx.bind(realNotifications),
  } as unknown as NotificationsService;
  const timeRecords = new TimeRecordsService(
    prisma,
    new TasksContextService(prisma),
    { notifyTaskHoursLogged: vi.fn().mockResolvedValue(undefined) } as unknown as NotificationsService,
    runner,
    new ProjectPolicyService(new ProjectIdResolverService(prisma)),
    new ProjectReadPolicyService(prisma),
    audit,
  );
  const projectHours = new ProjectHoursSummaryService(prisma);
  const recognition = new HoursRecognitionService(prisma);
  const service = new SprintsService(
    prisma,
    context,
    authorization,
    notifications,
    runner,
    new ProjectPolicyService(new ProjectIdResolverService(prisma)),
    new ProjectReadPolicyService(prisma),
    audit,
    timeRecords,
    projectHours,
    recognition,
  );
  return {
    service,
    runner,
    audit,
    notifications,
    timeRecords,
    recognition,
    notifyParticipants,
    notifyFinalization,
    notifyClosed,
  };
}

export async function cleanupFlowAFixture(db: PrismaClient, scope: IntegrationCleanupScope) {
  await db.bitacoraAuditoria.deleteMany({ where: { idUsuario: { in: scope.userIds ?? [] } } });
  await db.notificacion.deleteMany({ where: { idUsuario: { in: scope.userIds ?? [] } } });
  const ajustes = await db.ajusteHoraTarea.findMany({
    where: { idAsignacion: { in: scope.assignmentIds ?? [] } },
    orderBy: { idAjusteHora: 'desc' },
    select: { idAjusteHora: true },
  });
  for (const ajuste of ajustes) {
    await db.ajusteHoraTarea.delete({ where: { idAjusteHora: ajuste.idAjusteHora } });
  }
  await db.horasParticipacion.deleteMany({ where: { idParticipacion: { in: scope.participationIds ?? [] } } });
  await db.registroAvanceAsignacion.deleteMany({ where: { idAsignacion: { in: scope.assignmentIds ?? [] } } });
  await cleanupIntegrationFixtures(db, scope);
}

/** Proyecto EN_PROGRESO con un Sprint en el estado pedido y dos miembros. */
export async function flowAFixture(
  db: PrismaClient,
  scope: IntegrationCleanupScope,
  estadoSprint: 'ACTIVO' | 'EN_FINALIZACION' = 'ACTIVO',
) {
  const collect = <K extends keyof IntegrationCleanupScope>(key: K, ids: number[]) => {
    scope[key] = [...(scope[key] ?? []), ...ids];
  };
  const leader = await fixtures.createIntegrationUser(db);
  const memberA = await fixtures.createIntegrationUser(db);
  const memberB = await fixtures.createIntegrationUser(db);
  collect('userIds', [leader.idUsuario, memberA.idUsuario, memberB.idUsuario]);
  const project = await fixtures.createIntegrationProject(db, leader.idUsuario, { estadoProyecto: 'EN_PROGRESO' });
  collect('projectIds', [project.idProyecto]);
  const role = await fixtures.createIntegrationProjectRole(db, project.idProyecto, { cupos: 5 });
  collect('roleIds', [role.idRolProyecto]);
  const participationA = await fixtures.createIntegrationParticipation(db, memberA.idUsuario, role.idRolProyecto, { estadoParticipacion: 'ACTIVO' });
  const participationB = await fixtures.createIntegrationParticipation(db, memberB.idUsuario, role.idRolProyecto, { estadoParticipacion: 'ACTIVO' });
  collect('participationIds', [participationA.idParticipacion, participationB.idParticipacion]);
  const sprint = await fixtures.createIntegrationSprint(db, project.idProyecto, { estado: estadoSprint });
  collect('sprintIds', [sprint.idSprint]);
  return { leader, memberA, memberB, project, role, participationA, participationB, sprint, collect };
}

/** Tarea HECHO con un tramo cerrado del miembro indicado. */
export async function closedTask(
  db: PrismaClient,
  scope: IntegrationCleanupScope,
  input: {
    projectId: number;
    sprintId: number;
    leaderId: number;
    userId: number;
    participationId: number;
    horasReales?: string | null;
    origenReporte?: 'GRANULAR' | 'LEGACY' | 'POR_CONCILIAR';
    reconocidoEn?: Date | null;
    eliminada?: boolean;
    abierta?: boolean;
  },
) {
  const task = await fixtures.createIntegrationTask(db, input.projectId, input.leaderId, input.sprintId, {
    estadoTarea: 'HECHO',
  });
  scope.taskIds = [...(scope.taskIds ?? []), task.idTarea];
  if (input.eliminada) {
    await db.tarea.update({ where: { idTarea: task.idTarea }, data: { eliminadoEn: new Date('2026-09-01T00:00:00.000Z') } });
  }
  const assignment = await fixtures.createIntegrationTaskAssignment(db, task.idTarea, input.userId, input.leaderId, {
    idParticipacion: input.participationId,
    desasignadaEn: input.abierta ? null : new Date('2026-09-02T12:00:00.000Z'),
    horasReales: input.horasReales === undefined ? '3.00' : input.horasReales,
    ...(input.origenReporte !== undefined ? { origenReporte: input.origenReporte } : {}),
    ...(input.reconocidoEn !== undefined ? { reconocidoEn: input.reconocidoEn } : {}),
  });
  scope.assignmentIds = [...(scope.assignmentIds ?? []), assignment.idAsignacion];
  return { task, assignment };
}

/**
 * Los tramos GRANULAR deben cuadrar con el SUM efectivo (F4), así que un
 * tramo con caché necesita registros que la respalden.
 */
export async function backWithEntries(
  db: PrismaClient,
  input: { assignmentId: number; userId: number; horas: string },
) {
  return db.registroTiempoTarea.create({
    data: {
      idAsignacion: input.assignmentId,
      idUsuario: input.userId,
      horas: input.horas,
      fecha: new Date('2026-09-01T00:00:00.000Z'),
    },
  });
}
