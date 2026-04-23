import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { NotificationsService } from '../src/notifications/notifications.service';

function makePrisma() {
  return {
    notificacion: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      createMany: vi.fn(),
    },
    usuarioRolAcceso: { findFirst: vi.fn(), findMany: vi.fn() },
    participacionProyecto: { findMany: vi.fn() },
  } as any;
}

describe('NotificationsService', () => {
  it('findAll usa filtro opcional', async () => {
    const prisma = makePrisma();
    prisma.notificacion.findMany.mockResolvedValue([]);
    const service = new NotificationsService(prisma);
    await service.findAll(1);
    expect(prisma.notificacion.findMany).toHaveBeenCalled();
  });

  it('getUnreadCount retorna total', async () => {
    const prisma = makePrisma();
    prisma.notificacion.count.mockResolvedValue(5);
    const service = new NotificationsService(prisma);
    await expect(service.getUnreadCount(1)).resolves.toEqual({ total: 5 });
  });

  it('markAsRead falla si no existe', async () => {
    const prisma = makePrisma();
    prisma.notificacion.findUnique.mockResolvedValue(null);
    const service = new NotificationsService(prisma);
    await expect(service.markAsRead(1, 1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('markAsRead falla por permisos', async () => {
    const prisma = makePrisma();
    prisma.notificacion.findUnique.mockResolvedValue({ idUsuario: 2, leidaEn: null });
    const service = new NotificationsService(prisma);
    await expect(service.markAsRead(1, 1)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('markAllAsRead retorna conteo', async () => {
    const prisma = makePrisma();
    prisma.notificacion.updateMany.mockResolvedValue({ count: 4 });
    const service = new NotificationsService(prisma);
    await expect(service.markAllAsRead(1)).resolves.toEqual({ actualizadas: 4 });
  });

  it('notifyAdmins consulta admins y crea notificaciones', async () => {
    const prisma = makePrisma();
    prisma.usuarioRolAcceso.findMany.mockResolvedValue([{ idUsuario: 1 }, { idUsuario: 2 }]);
    const service = new NotificationsService(prisma);
    await service.notifyAdmins({ tipoNotificacion: 'PROYECTO_ACTUALIZADO' as any, tituloNotificacion: 't' });
    expect(prisma.notificacion.createMany).toHaveBeenCalled();
  });

  it('notifyProjectActiveParticipants excluye autor', async () => {
    const prisma = makePrisma();
    prisma.participacionProyecto.findMany.mockResolvedValue([{ idUsuario: 8 }]);
    const service = new NotificationsService(prisma);
    await service.notifyProjectActiveParticipants(
      1,
      2,
      { tipoNotificacion: 'COMENTARIO_PROYECTO' as any, tituloNotificacion: 'x' },
    );
    expect(prisma.notificacion.createMany).toHaveBeenCalled();
  });
});
