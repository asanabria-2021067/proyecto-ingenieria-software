import { vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { TimeRecordsService } from '../../src/time-records/time-records.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TasksContextService } from '../../src/tasks/tasks-context.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { ProjectTransactionService } from '../../src/common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../../src/common/project-policy/project-policy.service';
import { ProjectIdResolverService } from '../../src/common/project-policy/project-id-resolver.service';
import { ProjectReadPolicyService } from '../../src/common/project-policy/project-read-policy.service';

export function makeTimeRecordsService(db: unknown): TimeRecordsService {
  const prisma = db as PrismaService;
  return new TimeRecordsService(
    prisma,
    new TasksContextService(prisma),
    {} as NotificationsService,
    new ProjectTransactionService(prisma),
    new ProjectPolicyService(new ProjectIdResolverService(prisma)),
    new ProjectReadPolicyService(prisma),
  );
}

export function makeTimeRecordsDouble(): TimeRecordsService {
  return {
    recalculateAssignment: vi.fn().mockResolvedValue(new Prisma.Decimal(0)),
  } as unknown as TimeRecordsService;
}
