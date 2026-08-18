import { describe, expect, it, vi } from 'vitest';
import type { NotificationsService } from '../src/notifications/notifications.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { ApplicationNotificationListener } from '../src/notifications/listeners/application-notification.listener';
import { ApplicationCreatedEvent } from '../src/notifications/events/application-created.event';

function makePrisma() {
  return {
    postulacion: { findUnique: vi.fn() },
    proyecto: { findUnique: vi.fn() },
  };
}

describe('ApplicationNotificationListener', () => {
  it('notifica al líder del proyecto con los datos de la postulación', async () => {
    const prisma = makePrisma();
    prisma.postulacion.findUnique.mockResolvedValue({
      idPostulacion: 10,
      idUsuarioPostulante: 1,
      postulante: { nombre: 'Ana', apellido: 'Pérez' },
      rolProyecto: { nombreRol: 'Backend' },
    });
    prisma.proyecto.findUnique.mockResolvedValue({
      tituloProyecto: 'Proyecto X',
      creadoPor: 9,
    });
    const notificationsService = { notifyFromTemplate: vi.fn() };
    const listener = new ApplicationNotificationListener(
      notificationsService as unknown as NotificationsService,
      prisma as unknown as PrismaService,
    );

    await listener.handleApplicationCreated(
      new ApplicationCreatedEvent(10, 1, 5, 2),
    );

    expect(notificationsService.notifyFromTemplate).toHaveBeenCalledWith(
      [9],
      'NUEVA_POSTULACION',
      expect.objectContaining({
        userName: 'Ana Pérez',
        roleName: 'Backend',
        projectTitle: 'Proyecto X',
        projectId: 5,
        applicationId: 10,
        roleId: 2,
      }),
    );
  });

  it('no notifica si el líder del proyecto es el propio postulante', async () => {
    const prisma = makePrisma();
    prisma.postulacion.findUnique.mockResolvedValue({
      idPostulacion: 10,
      idUsuarioPostulante: 9,
      postulante: { nombre: 'Ana', apellido: 'Pérez' },
      rolProyecto: { nombreRol: 'Backend' },
    });
    prisma.proyecto.findUnique.mockResolvedValue({
      tituloProyecto: 'Proyecto X',
      creadoPor: 9,
    });
    const notificationsService = { notifyFromTemplate: vi.fn() };
    const listener = new ApplicationNotificationListener(
      notificationsService as unknown as NotificationsService,
      prisma as unknown as PrismaService,
    );

    await listener.handleApplicationCreated(
      new ApplicationCreatedEvent(10, 9, 5, 2),
    );

    expect(notificationsService.notifyFromTemplate).not.toHaveBeenCalled();
  });

  it('no falla si la postulación o el proyecto ya no existen', async () => {
    const prisma = makePrisma();
    prisma.postulacion.findUnique.mockResolvedValue(null);
    prisma.proyecto.findUnique.mockResolvedValue(null);
    const notificationsService = { notifyFromTemplate: vi.fn() };
    const listener = new ApplicationNotificationListener(
      notificationsService as unknown as NotificationsService,
      prisma as unknown as PrismaService,
    );

    await listener.handleApplicationCreated(
      new ApplicationCreatedEvent(10, 1, 5, 2),
    );

    expect(notificationsService.notifyFromTemplate).not.toHaveBeenCalled();
  });
});
