import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EstadoProyecto } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import { RevisionesService } from '../src/revisiones/revisiones.service';

function makePrisma() {
  const defaultTx = {
    revisionProyecto: { update: vi.fn() },
    proyecto: { update: vi.fn(), findUnique: vi.fn() },
    notificacion: { create: vi.fn() },
  };

  return {
    revisionProyecto: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    proyecto: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    usuario: { findUnique: vi.fn() },
    notificacion: { create: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: typeof defaultTx) => unknown) => cb(defaultTx)),
  };
}

function makeService(
  prisma: ReturnType<typeof makePrisma>,
  notifications: Partial<NotificationsService> = {},
) {
  return new RevisionesService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
  );
}

describe('RevisionesService', () => {
  it('findAdminInbox requiere admin', async () => {
    const service = makeService(makePrisma(), { isAdmin: vi.fn().mockResolvedValue(false) });
    await expect(service.findAdminInbox(1)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('findAdminInbox retorna ambas bandejas', async () => {
    const prisma = makePrisma();
    prisma.revisionProyecto.findMany.mockResolvedValue([{ idRevisionProyecto: 1 }]);
    prisma.proyecto.findMany.mockResolvedValue([{ idProyecto: 2 }]);
    const service = makeService(prisma, {
      isAdmin: vi.fn().mockResolvedValue(true),
      notifyFromTemplate: vi.fn(),
    });
    const result = await service.findAdminInbox(1);
    expect(result.revisionesPendientes).toHaveLength(1);
    expect(result.cierresPendientes).toHaveLength(1);
  });

  it('findByProyecto valida existencia', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(null);
    const service = makeService(prisma, { isAdmin: vi.fn() });
    await expect(service.findByProyecto(1, 1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reclamar falla si no hay revisión pendiente', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findUnique.mockResolvedValue({ estadoProyecto: EstadoProyecto.EN_REVISION });
    prisma.revisionProyecto.findFirst.mockResolvedValue(null);
    const notifications = {
      isAdmin: vi.fn().mockResolvedValue(true),
      notifyFromTemplate: vi.fn(),
    };
    const service = makeService(prisma, notifications);
    await expect(service.reclamar(1, 7)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('resolver requiere que el mismo admin haya reclamado', async () => {
    const prisma = makePrisma();
    prisma.revisionProyecto.findFirst.mockResolvedValue({ idRevisionProyecto: 4, idRevisor: 8 });
    const notifications = {
      isAdmin: vi.fn().mockResolvedValue(true),
      notifyFromTemplate: vi.fn(),
    };
    const service = makeService(prisma, notifications);
    await expect(service.resolver(1, 7, { resultado: 'APROBADA' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('resolver actualiza revision y proyecto', async () => {
    const prisma = makePrisma();
    prisma.revisionProyecto.findFirst.mockResolvedValue({ idRevisionProyecto: 4, idRevisor: 7 });
    const tx = {
      revisionProyecto: { update: vi.fn().mockResolvedValue({ idRevisionProyecto: 4, estadoRevision: 'APROBADA' }) },
      proyecto: {
        update: vi.fn(),
        findUnique: vi.fn().mockResolvedValue({ creadoPor: 2, tituloProyecto: 'Proyecto' }),
      },
      notificacion: { create: vi.fn() },
    };
    prisma.$transaction = vi.fn(async (cb: (arg: typeof tx) => unknown) => cb(tx)) as typeof prisma.$transaction;
    const notifications = {
      isAdmin: vi.fn().mockResolvedValue(true),
      notifyFromTemplate: vi.fn(),
    };
    const service = makeService(prisma, notifications);

    const result = await service.resolver(1, 7, { resultado: 'APROBADA', comentario: '' });

    expect(result.estadoProyecto).toBe(EstadoProyecto.PUBLICADO);
    expect(tx.proyecto.update).toHaveBeenCalled();
    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith(
      [2],
      'PROYECTO_APROBADO',
      expect.objectContaining({ projectId: 1, revisionId: 4 }),
      tx,
    );
  });

  it('reclamar falla con estado inválido', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findUnique.mockResolvedValue({ estadoProyecto: EstadoProyecto.PUBLICADO });
    const service = makeService(prisma, { isAdmin: vi.fn().mockResolvedValue(true) });
    await expect(service.reclamar(1, 1)).rejects.toBeInstanceOf(BadRequestException);
  });
});
