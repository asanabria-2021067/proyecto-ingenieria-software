import { describe, expect, it, vi } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { PrismaService } from '../src/prisma/prisma.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { NotificationsController } from '../src/notifications/notifications.controller';
import { ListNotificationsQueryDto } from '../src/notifications/dto/list-notifications-query.dto';

/**
 * HU-176 (T-292). GET /notificaciones se puede pedir por páginas; sin `page`
 * sigue respondiendo la lista de siempre.
 */

function makePrisma(total = 45) {
  return {
    notificacion: {
      findMany: vi.fn().mockResolvedValue([{ idNotificacion: 1 }]),
      count: vi.fn().mockResolvedValue(total),
    },
  };
}

describe('NotificationsService.findPage (T-292)', () => {
  it('pide solo la página del usuario, de la más reciente a la más antigua', async () => {
    const prisma = makePrisma();
    const service = new NotificationsService(prisma as unknown as PrismaService);

    const result = await service.findPage(7, 2, 20);

    expect(prisma.notificacion.findMany).toHaveBeenCalledWith({
      where: { idUsuario: 7 },
      orderBy: [{ creadaEn: 'desc' }, { idNotificacion: 'desc' }],
      skip: 20,
      take: 20,
    });
    expect(prisma.notificacion.count).toHaveBeenCalledWith({ where: { idUsuario: 7 } });
    expect(result).toEqual({ data: [{ idNotificacion: 1 }], total: 45, page: 2, totalPages: 3 });
  });

  it('usa 20 por página si no se indica el límite', async () => {
    const prisma = makePrisma();
    const service = new NotificationsService(prisma as unknown as PrismaService);

    await service.findPage(7, 1);

    expect(prisma.notificacion.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 20 }));
  });
});

describe('NotificationsController.findAll (T-292)', () => {
  function build() {
    const service = { findAll: vi.fn().mockResolvedValue([]), findPage: vi.fn().mockResolvedValue({}) };
    const controller = new NotificationsController(
      service as unknown as ConstructorParameters<typeof NotificationsController>[0],
    );
    return { service, controller };
  }

  it('sin page responde la lista de siempre', async () => {
    const { service, controller } = build();
    await controller.findAll({ userId: 3 }, {});
    expect(service.findAll).toHaveBeenCalledWith(3);
    expect(service.findPage).not.toHaveBeenCalled();
  });

  it('con page responde la página pedida', async () => {
    const { service, controller } = build();
    await controller.findAll({ userId: 3 }, { page: 2, limit: 10 });
    expect(service.findPage).toHaveBeenCalledWith(3, 2, 10);
    expect(service.findAll).not.toHaveBeenCalled();
  });
});

describe('ListNotificationsQueryDto (T-292)', () => {
  async function errores(query: Record<string, string>) {
    return validate(plainToInstance(ListNotificationsQueryDto, query));
  }

  it('acepta page y limit válidos', async () => {
    expect(await errores({ page: '1', limit: '50' })).toHaveLength(0);
  });

  it('rechaza page menor a 1 y limit mayor a 50', async () => {
    expect(await errores({ page: '0' })).not.toHaveLength(0);
    expect(await errores({ page: '1', limit: '51' })).not.toHaveLength(0);
  });
});
