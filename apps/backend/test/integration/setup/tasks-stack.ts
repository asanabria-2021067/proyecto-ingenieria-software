import { vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { TasksService } from '../../../src/tasks/tasks.service';
import { TasksAuthorizationService } from '../../../src/tasks/tasks-authorization.service';
import { TasksContextService } from '../../../src/tasks/tasks-context.service';
import { TasksRelationsService } from '../../../src/tasks/tasks-relations.service';
import { RolesService } from '../../../src/roles/roles.service';
import { TimeRecordsService } from '../../../src/time-records/time-records.service';
import { ProjectEligibilityService } from '../../../src/eligibility/project-eligibility.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { NotificationsService } from '../../../src/notifications/notifications.service';
import { BitacoraEventosService } from '../../../src/bitacora/bitacora-eventos.service';
import { ProjectTransactionService } from '../../../src/common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../../../src/common/project-policy/project-policy.service';
import { ProjectIdResolverService } from '../../../src/common/project-policy/project-id-resolver.service';
import { ProjectReadPolicyService } from '../../../src/common/project-policy/project-read-policy.service';

/**
 * C086 (06 v2 §17/§47 T11-B): pila real de tareas y roles con la elegibilidad
 * conectada. Solo las notificaciones son dobles; la decisión de quién puede
 * recibir trabajo se toma contra PostgreSQL real, que es el punto de la prueba.
 */
export function tasksStack(db: PrismaClient) {
  const prisma = db as unknown as PrismaService;
  const context = new TasksContextService(prisma);
  const runner = new ProjectTransactionService(prisma);
  const policy = new ProjectPolicyService(new ProjectIdResolverService(prisma));
  const readPolicy = new ProjectReadPolicyService(prisma);
  const audit = new BitacoraEventosService();
  const eligibility = new ProjectEligibilityService(prisma);
  const notifications = {
    notifyUsers: vi.fn().mockResolvedValue(undefined),
    notifyRoleMembers: vi.fn().mockResolvedValue(undefined),
    notifyProjectActiveParticipants: vi.fn().mockResolvedValue(undefined),
    notifyFromTemplate: vi.fn().mockResolvedValue(undefined),
    notifyTaskHoursLogged: vi.fn().mockResolvedValue(undefined),
  } as unknown as NotificationsService;
  const timeRecords = new TimeRecordsService(
    prisma, context, notifications, runner, policy, readPolicy, audit,
  );
  const tasks = new TasksService(
    prisma,
    new TasksAuthorizationService(context),
    new TasksRelationsService(prisma, context, eligibility),
    notifications,
    context,
    runner,
    policy,
    readPolicy,
    timeRecords,
    audit,
  );
  const roles = new RolesService(prisma, notifications, runner, policy, timeRecords, eligibility);
  return { tasks, roles, eligibility, timeRecords, notifications };
}
