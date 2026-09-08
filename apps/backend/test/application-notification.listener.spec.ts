import { describe, expect, it, vi } from 'vitest';
import type { NotificationsService } from '../src/notifications/notifications.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { ApplicationNotificationListener } from '../src/notifications/listeners/application-notification.listener';
import { ApplicationCreatedEvent } from '../src/notifications/events/application-created.event';

/**
 * C030 (06 v2 §23): la notificación de nueva postulación se persiste en la
 * transacción de creación (ApplicationsService.create). El listener sigue
 * registrado para `application.created` pero ya no produce una segunda
 * notificación ni consulta la base para este productor.
 */
function makePrisma() {
  return {
    postulacion: { findUnique: vi.fn() },
    proyecto: { findUnique: vi.fn() },
  };
}

describe('ApplicationNotificationListener', () => {
  it('no emite una segunda notificación al líder: la fila ya se persistió en la transacción de creación', async () => {
    const prisma = makePrisma();
    const notificationsService = { notifyFromTemplate: vi.fn(), persistTemplateTx: vi.fn() };
    const listener = new ApplicationNotificationListener(
      notificationsService as unknown as NotificationsService,
      prisma as unknown as PrismaService,
    );

    await listener.handleApplicationCreated(new ApplicationCreatedEvent(10, 1, 5, 2));

    expect(notificationsService.notifyFromTemplate).not.toHaveBeenCalled();
    expect(notificationsService.persistTemplateTx).not.toHaveBeenCalled();
    expect(prisma.postulacion.findUnique).not.toHaveBeenCalled();
    expect(prisma.proyecto.findUnique).not.toHaveBeenCalled();
  });

  it('tampoco notifica cuando el líder es el propio postulante', async () => {
    const prisma = makePrisma();
    const notificationsService = { notifyFromTemplate: vi.fn(), persistTemplateTx: vi.fn() };
    const listener = new ApplicationNotificationListener(
      notificationsService as unknown as NotificationsService,
      prisma as unknown as PrismaService,
    );

    await listener.handleApplicationCreated(new ApplicationCreatedEvent(10, 9, 5, 2));

    expect(notificationsService.notifyFromTemplate).not.toHaveBeenCalled();
  });

  it('no falla aunque la postulación o el proyecto ya no existan', async () => {
    const prisma = makePrisma();
    prisma.postulacion.findUnique.mockResolvedValue(null);
    prisma.proyecto.findUnique.mockResolvedValue(null);
    const notificationsService = { notifyFromTemplate: vi.fn() };
    const listener = new ApplicationNotificationListener(
      notificationsService as unknown as NotificationsService,
      prisma as unknown as PrismaService,
    );

    await expect(
      listener.handleApplicationCreated(new ApplicationCreatedEvent(10, 1, 5, 2)),
    ).resolves.toBeUndefined();
    expect(notificationsService.notifyFromTemplate).not.toHaveBeenCalled();
  });
});
