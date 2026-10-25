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
    // HU-198: sin filtros, ambos van undefined y el resultado es el de siempre.
    expect(service.findAll).toHaveBeenCalledWith(3, { tipos: undefined, leida: undefined });
    expect(service.findPage).not.toHaveBeenCalled();
  });

  it('con page responde la página pedida', async () => {
    const { service, controller } = build();
    await controller.findAll({ userId: 3 }, { page: 2, limit: 10 });
    expect(service.findPage).toHaveBeenCalledWith(3, 2, 10, { tipos: undefined, leida: undefined, q: undefined, proyecto: undefined }, undefined);
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

describe('HU-198 (T-370) · filtros de GET /notificaciones', () => {
  /** Mismas opciones que el ValidationPipe global de main.ts. */
  async function aplicar(query: Record<string, unknown>) {
    const dto = plainToInstance(ListNotificationsQueryDto, query, { enableImplicitConversion: true });
    const errores = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    return { dto, propiedades: errores.map((e) => e.property) };
  }

  it('tipos en CSV o repetido se convierten en lista de valores del enum', async () => {
    expect((await aplicar({ tipos: 'TAREA_ASIGNADA,REUNION_PROGRAMADA' })).dto.tipos).toEqual(['TAREA_ASIGNADA', 'REUNION_PROGRAMADA']);
    expect((await aplicar({ tipos: ['TAREA_ASIGNADA', 'MENCION_COMENTARIO'] })).dto.tipos).toEqual(['TAREA_ASIGNADA', 'MENCION_COMENTARIO']);
  });

  it('tipo desconocido o vacío es 400', async () => {
    expect((await aplicar({ tipos: 'TAREA_ASIGNADA,NO_EXISTE' })).propiedades).toEqual(['tipos']);
    expect((await aplicar({ tipos: '' })).propiedades).toEqual(['tipos']);
  });

  it('leida acepta solo "true" o "false" exactos (la conversión implícita no convierte "false" en true)', async () => {
    expect((await aplicar({ leida: 'false' })).dto.leida).toBe(false);
    expect((await aplicar({ leida: 'true' })).dto.leida).toBe(true);
    for (const valor of ['1', 'si', 'FALSE', '']) expect((await aplicar({ leida: valor })).propiedades, valor).toEqual(['leida']);
  });

  it('no acepta idUsuario ni otros campos', async () => {
    expect((await aplicar({ idUsuario: '9' })).propiedades).toEqual(['idUsuario']);
  });

  it('el servicio usa el mismo where para data y total, siempre con el usuario de la sesión', async () => {
    const prisma = makePrisma(3);
    const service = new NotificationsService(prisma as unknown as PrismaService);
    await service.findPage(7, 1, 20, { tipos: ['TAREA_ASIGNADA', 'TAREA_ASIGNADA'], leida: false });
    const where = { idUsuario: 7, tipoNotificacion: { in: ['TAREA_ASIGNADA'] }, leidaEn: null };
    expect(prisma.notificacion.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
    expect(prisma.notificacion.count).toHaveBeenCalledWith({ where });

    await service.findPage(7, 1, 20, { leida: true });
    expect(prisma.notificacion.count).toHaveBeenLastCalledWith({ where: { idUsuario: 7, leidaEn: { not: null } } });
  });

  it('el controlador pasa los filtros también sin paginación', async () => {
    const service = { findAll: vi.fn().mockResolvedValue([]), findPage: vi.fn() };
    const controller = new NotificationsController(service as unknown as ConstructorParameters<typeof NotificationsController>[0]);
    await controller.findAll({ userId: 3 }, { tipos: ['TAREA_ASIGNADA'], leida: false });
    expect(service.findAll).toHaveBeenCalledWith(3, { tipos: ['TAREA_ASIGNADA'], leida: false, q: undefined, proyecto: undefined });
  });
});

/**
 * Sprint 10 (bandeja de notificaciones): búsqueda `q`, filtro `proyecto`
 * (id del payload o `ninguno`) y `orden`, todos aditivos sobre HU-198.
 */
describe('GET /notificaciones · q, proyecto y orden (Sprint 10)', () => {
  const aplicar = async (query: Record<string, unknown>) => {
    const dto = plainToInstance(ListNotificationsQueryDto, query, { enableImplicitConversion: true });
    const errores = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    return { dto, propiedades: errores.map((e) => e.property) };
  };

  it('q se recorta; en blanco se ignora; más de 120 caracteres es 400', async () => {
    expect((await aplicar({ q: '  horas ' })).dto.q).toBe('horas');
    expect((await aplicar({ q: '   ' })).dto.q).toBeUndefined();
    expect((await aplicar({ q: 'x'.repeat(121) })).propiedades).toEqual(['q']);
  });

  it('proyecto acepta un id positivo o "ninguno"; otra cosa es 400', async () => {
    expect((await aplicar({ proyecto: '64' })).dto.proyecto).toBe(64);
    expect((await aplicar({ proyecto: 'ninguno' })).dto.proyecto).toBe('ninguno');
    for (const valor of ['0', '-1', 'abc', '1.5', '']) expect((await aplicar({ proyecto: valor })).propiedades, valor).toEqual(['proyecto']);
  });

  it('orden acepta solo asc o desc', async () => {
    expect((await aplicar({ orden: 'asc' })).dto.orden).toBe('asc');
    expect((await aplicar({ orden: 'ASC' })).propiedades).toEqual(['orden']);
  });

  it('q busca en título y mensaje sin distinguir mayúsculas; proyecto mira projectId e idProyecto del payload', async () => {
    const prisma = makePrisma(1);
    const service = new NotificationsService(prisma as unknown as PrismaService);
    await service.findPage(7, 1, 20, { q: 'Horas', proyecto: 64 });
    const where = {
      idUsuario: 7,
      AND: [
        { OR: [{ tituloNotificacion: { contains: 'Horas', mode: 'insensitive' } }, { mensajeNotificacion: { contains: 'Horas', mode: 'insensitive' } }] },
        { OR: [{ datosJson: { path: ['projectId'], equals: 64 } }, { datosJson: { path: ['idProyecto'], equals: 64 } }] },
      ],
    };
    expect(prisma.notificacion.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
    expect(prisma.notificacion.count).toHaveBeenCalledWith({ where });
  });

  it('proyecto=ninguno exige que ninguna clave de proyecto tenga valor', async () => {
    const prisma = makePrisma(1);
    const service = new NotificationsService(prisma as unknown as PrismaService);
    await service.findPage(7, 1, 20, { proyecto: 'ninguno' });
    expect(prisma.notificacion.count).toHaveBeenCalledWith({
      where: { idUsuario: 7, AND: [{ AND: [{ datosJson: { path: ['projectId'], equals: expect.anything() } }, { datosJson: { path: ['idProyecto'], equals: expect.anything() } }] }] },
    });
  });

  it('orden=asc invierte fecha y desempate; por defecto desc', async () => {
    const prisma = makePrisma(1);
    const service = new NotificationsService(prisma as unknown as PrismaService);
    await service.findPage(7, 1, 20, {}, 'asc');
    expect(prisma.notificacion.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ orderBy: [{ creadaEn: 'asc' }, { idNotificacion: 'asc' }] }));
    await service.findPage(7, 1, 20);
    expect(prisma.notificacion.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ orderBy: [{ creadaEn: 'desc' }, { idNotificacion: 'desc' }] }));
  });

  it('leer-todas acota con q y proyecto además de tipos, siempre solo no leídas del usuario', async () => {
    const prisma = { notificacion: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) } };
    const service = new NotificationsService(prisma as unknown as PrismaService);
    await expect(service.markAllAsRead(7, { tipos: ['TAREA_ASIGNADA'], q: 'sprint', proyecto: 'ninguno' })).resolves.toEqual({ actualizadas: 2 });
    const where = prisma.notificacion.updateMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ idUsuario: 7, leidaEn: null, tipoNotificacion: { in: ['TAREA_ASIGNADA'] } });
    expect(where.AND).toHaveLength(2);
    // Compatibilidad: la firma anterior con el arreglo de tipos sigue valiendo.
    await service.markAllAsRead(7, ['MENCION_COMENTARIO']);
    expect(prisma.notificacion.updateMany).toHaveBeenLastCalledWith({
      where: { idUsuario: 7, tipoNotificacion: { in: ['MENCION_COMENTARIO'] }, leidaEn: null },
      data: { leidaEn: expect.any(Date) },
    });
  });

  it('mias/proyectos devuelve solo proyectos referenciados por los avisos del usuario, con título', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 64 }, { id: 9 }, { id: null }]),
      proyecto: { findMany: vi.fn().mockResolvedValue([{ idProyecto: 9, tituloProyecto: 'B' }, { idProyecto: 64, tituloProyecto: 'Tutorías' }]) },
    };
    const service = new NotificationsService(prisma as unknown as PrismaService);
    await expect(service.findProjectsReferenced(7)).resolves.toEqual([{ idProyecto: 9, tituloProyecto: 'B' }, { idProyecto: 64, tituloProyecto: 'Tutorías' }]);
    expect(prisma.proyecto.findMany).toHaveBeenCalledWith({
      where: { idProyecto: { in: [64, 9] } },
      select: { idProyecto: true, tituloProyecto: true },
      orderBy: { tituloProyecto: 'asc' },
    });
    const consulta = prisma.$queryRaw.mock.calls[0][0];
    expect(consulta.values).toEqual([7]);
    expect(consulta.strings.join('?')).toContain('id_usuario = ?');
  });

  it('sin proyectos referenciados no consulta la tabla de proyectos', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]), proyecto: { findMany: vi.fn() } };
    const service = new NotificationsService(prisma as unknown as PrismaService);
    await expect(service.findProjectsReferenced(7)).resolves.toEqual([]);
    expect(prisma.proyecto.findMany).not.toHaveBeenCalled();
  });
});
