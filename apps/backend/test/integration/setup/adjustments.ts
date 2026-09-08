import { vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { TaskHourAdjustmentsService } from '../../../src/task-hour-adjustments/task-hour-adjustments.service';
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
 * C071 (06 v2 §11/§47 T07): pila real del servicio de ajustes sobre PostgreSQL.
 * Solo el emisor realtime es un doble, porque el socket vive fuera de la
 * transacción y no forma parte del contrato que se prueba aquí.
 */
export function adjustmentsStack(db: PrismaClient) {
  const prisma = db as unknown as PrismaService;
  const runner = new ProjectTransactionService(prisma);
  const audit = new BitacoraEventosService();
  const realtime = vi.fn().mockResolvedValue(undefined);
  const service = new TaskHourAdjustmentsService(
    prisma,
    runner,
    new ProjectPolicyService(new ProjectIdResolverService(prisma)),
    new ProjectReadPolicyService(prisma),
    { notifySprintHoursAdjusted: realtime } as unknown as NotificationsService,
    audit,
  );
  return { service, runner, audit, realtime };
}

/**
 * Escenario base de §11: Sprint EN_FINALIZACION y un tramo cerrado con caché
 * 6.00 todavía no consumido. `outsider` es un participante activo que NO es el
 * líder, para probar que ajustar es potestad exclusiva del líder actual.
 */
export async function adjustmentFixture(db: PrismaClient, scope: IntegrationCleanupScope) {
  const collect = <K extends keyof IntegrationCleanupScope>(key: K, ids: number[]) => {
    scope[key] = [...(scope[key] ?? []), ...ids];
  };
  const leader = await fixtures.createIntegrationUser(db);
  const owner = await fixtures.createIntegrationUser(db);
  const outsider = await fixtures.createIntegrationUser(db);
  collect('userIds', [leader.idUsuario, owner.idUsuario, outsider.idUsuario]);
  const project = await fixtures.createIntegrationProject(db, leader.idUsuario, { estadoProyecto: 'EN_PROGRESO' });
  collect('projectIds', [project.idProyecto]);
  const role = await fixtures.createIntegrationProjectRole(db, project.idProyecto, { cupos: 3 });
  collect('roleIds', [role.idRolProyecto]);
  const ownerParticipation = await fixtures.createIntegrationParticipation(db, owner.idUsuario, role.idRolProyecto, { estadoParticipacion: 'ACTIVO' });
  const outsiderParticipation = await fixtures.createIntegrationParticipation(db, outsider.idUsuario, role.idRolProyecto, { estadoParticipacion: 'ACTIVO' });
  collect('participationIds', [ownerParticipation.idParticipacion, outsiderParticipation.idParticipacion]);
  const sprint = await fixtures.createIntegrationSprint(db, project.idProyecto, { estado: 'EN_FINALIZACION' });
  collect('sprintIds', [sprint.idSprint]);
  const task = await fixtures.createIntegrationTask(db, project.idProyecto, leader.idUsuario, sprint.idSprint);
  collect('taskIds', [task.idTarea]);
  const assignment = await fixtures.createIntegrationTaskAssignment(db, task.idTarea, owner.idUsuario, leader.idUsuario, {
    idParticipacion: ownerParticipation.idParticipacion,
    desasignadaEn: new Date('2026-09-01T12:00:00.000Z'),
    horasReales: '6.00',
  });
  collect('assignmentIds', [assignment.idAsignacion]);
  return { leader, owner, outsider, project, role, ownerParticipation, sprint, task, assignment };
}

export async function cleanupAdjustmentFixture(db: PrismaClient, scope: IntegrationCleanupScope) {
  await db.bitacoraAuditoria.deleteMany({ where: { idUsuario: { in: scope.userIds ?? [] } } });
  // La cadena se enlaza por idAjusteAnterior con FK RESTRICT: se borra del
  // sucesor hacia el origen, nunca al revés.
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
