import { vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
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

export function timeStack(db: PrismaClient) {
  const prisma = db as unknown as PrismaService;
  const context = new TasksContextService(prisma);
  const runner = new ProjectTransactionService(prisma);
  const audit = new BitacoraEventosService();
  const realtime = vi.fn().mockResolvedValue(undefined);
  const service = new TimeRecordsService(prisma, context,
    { notifyTaskHoursLogged: realtime } as unknown as NotificationsService,
    runner, new ProjectPolicyService(new ProjectIdResolverService(prisma)),
    new ProjectReadPolicyService(prisma), audit);
  return { service, context, runner, audit, realtime };
}

export async function timeFixture(db: PrismaClient, scope: IntegrationCleanupScope) {
  const leader = await fixtures.createIntegrationUser(db);
  scope.userIds = [leader.idUsuario];
  const owner = await fixtures.createIntegrationUser(db);
  scope.userIds.push(owner.idUsuario);
  const project = await fixtures.createIntegrationProject(db, leader.idUsuario, { estadoProyecto: 'EN_PROGRESO' });
  scope.projectIds = [project.idProyecto];
  const role = await fixtures.createIntegrationProjectRole(db, project.idProyecto, { cupos: 3 });
  scope.roleIds = [role.idRolProyecto];
  const participation = await fixtures.createIntegrationParticipation(db, owner.idUsuario, role.idRolProyecto, { estadoParticipacion: 'ACTIVO' });
  scope.participationIds = [participation.idParticipacion];
  const sprint = await fixtures.createIntegrationSprint(db, project.idProyecto);
  scope.sprintIds = [sprint.idSprint];
  const task = await fixtures.createIntegrationTask(db, project.idProyecto, leader.idUsuario, sprint.idSprint);
  scope.taskIds = [task.idTarea];
  const assignment = await fixtures.createIntegrationTaskAssignment(db, task.idTarea, owner.idUsuario, leader.idUsuario, { idParticipacion: participation.idParticipacion });
  scope.assignmentIds = [assignment.idAsignacion];
  return { leader, owner, project, role, participation, sprint, task, assignment };
}

export async function cleanupTimeFixture(db: PrismaClient, scope: IntegrationCleanupScope) {
  await db.bitacoraAuditoria.deleteMany({ where: { idUsuario: { in: scope.userIds ?? [] } } });
  await db.registroAvanceAsignacion.deleteMany({ where: { idAsignacion: { in: scope.assignmentIds ?? [] } } });
  // HorasParticipacion → ParticipacionProyecto: el agregado debe irse antes
  // que la participación que lo ancla, o el cleanup genérico choca con la FK.
  await db.horasParticipacion.deleteMany({ where: { idParticipacion: { in: scope.participationIds ?? [] } } });
  await cleanupIntegrationFixtures(db, scope);
}

/**
 * Fixture de ciclo de vida (T04–T06): una tarea que ya fue reasignada. El
 * tramo A del autor está cerrado y NO consumido; el tramo B está abierto en
 * manos de otra persona y tiene registros propios. Es la única forma de
 * demostrar que la edición se resuelve por la cadena del registro y no por la
 * asignación activa de la tarea, y que la caché del tramo ajeno no se mueve.
 */
export async function timeLifecycleFixture(db: PrismaClient, scope: IntegrationCleanupScope) {
  const leader = await fixtures.createIntegrationUser(db);
  const owner = await fixtures.createIntegrationUser(db);
  const successor = await fixtures.createIntegrationUser(db);
  scope.userIds = [leader.idUsuario, owner.idUsuario, successor.idUsuario];
  const project = await fixtures.createIntegrationProject(db, leader.idUsuario, { estadoProyecto: 'EN_PROGRESO' });
  scope.projectIds = [project.idProyecto];
  const role = await fixtures.createIntegrationProjectRole(db, project.idProyecto, { cupos: 3 });
  scope.roleIds = [role.idRolProyecto];
  const ownerParticipation = await fixtures.createIntegrationParticipation(db, owner.idUsuario, role.idRolProyecto, { estadoParticipacion: 'ACTIVO' });
  const successorParticipation = await fixtures.createIntegrationParticipation(db, successor.idUsuario, role.idRolProyecto, { estadoParticipacion: 'ACTIVO' });
  scope.participationIds = [ownerParticipation.idParticipacion, successorParticipation.idParticipacion];
  const sprint = await fixtures.createIntegrationSprint(db, project.idProyecto);
  scope.sprintIds = [sprint.idSprint];
  const task = await fixtures.createIntegrationTask(db, project.idProyecto, leader.idUsuario, sprint.idSprint);
  scope.taskIds = [task.idTarea];
  const closedAt = new Date('2026-09-01T12:00:00.000Z');
  const closed = await fixtures.createIntegrationTaskAssignment(db, task.idTarea, owner.idUsuario, leader.idUsuario, {
    idParticipacion: ownerParticipation.idParticipacion,
    desasignadaEn: closedAt,
    horasReales: '2.00',
  });
  const open = await fixtures.createIntegrationTaskAssignment(db, task.idTarea, successor.idUsuario, leader.idUsuario, {
    idParticipacion: successorParticipation.idParticipacion,
    horasReales: '4.00',
  });
  scope.assignmentIds = [closed.idAsignacion, open.idAsignacion];
  const ownerRecord = await db.registroTiempoTarea.create({
    data: {
      idAsignacion: closed.idAsignacion,
      idUsuario: owner.idUsuario,
      horas: '2.00',
      fecha: new Date('2026-08-30T00:00:00.000Z'),
      nota: 'nota original del autor',
      justificacionExceso: 'justificación histórica del cruce',
    },
  });
  const successorRecord = await db.registroTiempoTarea.create({
    data: {
      idAsignacion: open.idAsignacion,
      idUsuario: successor.idUsuario,
      horas: '4.00',
      fecha: new Date('2026-09-03T00:00:00.000Z'),
    },
  });
  return { leader, owner, successor, project, role, ownerParticipation, successorParticipation, sprint, task, closed, open, ownerRecord, successorRecord, closedAt };
}
