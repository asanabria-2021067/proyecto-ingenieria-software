import { vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { ExitRequestsService } from '../../../src/exit-requests/exit-requests.service';
import { ExitRequestsAuthorizationService } from '../../../src/exit-requests/exit-requests.authorization.service';
import { ExitRequestsContextService } from '../../../src/exit-requests/exit-requests.context.service';
import { HoursRecognitionService } from '../../../src/sprints/hours-recognition.service';
import { SprintsContextService } from '../../../src/sprints/sprints-context.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { NotificationsService } from '../../../src/notifications/notifications.service';
import { BitacoraEventosService } from '../../../src/bitacora/bitacora-eventos.service';
import { ProjectTransactionService } from '../../../src/common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../../../src/common/project-policy/project-policy.service';
import { ProjectIdResolverService } from '../../../src/common/project-policy/project-id-resolver.service';
import { ProjectReadPolicyService } from '../../../src/common/project-policy/project-read-policy.service';

/**
 * C084/C085 (06 v2 §13/§47 T10-T11): pila real de salidas sobre PostgreSQL.
 * La plantilla de notificación se persiste de verdad, porque forma parte de
 * la transacción de dominio y es justo lo que debe revertirse con ella.
 */
export function exitStack(db: PrismaClient) {
  const prisma = db as unknown as PrismaService;
  const context = new ExitRequestsContextService(prisma);
  const realNotifications = new NotificationsService(prisma, undefined as never);
  const notifyFromTemplate = vi.fn().mockImplementation(
    realNotifications.notifyFromTemplate.bind(realNotifications),
  );
  const service = new ExitRequestsService(
    prisma,
    { notifyFromTemplate } as unknown as NotificationsService,
    new ExitRequestsAuthorizationService(context),
    context,
    new ProjectTransactionService(prisma),
    new ProjectPolicyService(new ProjectIdResolverService(prisma)),
    new ProjectReadPolicyService(prisma),
    new HoursRecognitionService(prisma),
    new SprintsContextService(prisma),
    new BitacoraEventosService(),
  );
  return { service, notifyFromTemplate };
}
