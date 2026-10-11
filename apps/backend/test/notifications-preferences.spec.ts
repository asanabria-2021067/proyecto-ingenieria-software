import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BadRequestException, RequestMethod, ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { TipoNotificacion } from '@prisma/client';
import { NotificationsService } from '../src/notifications/notifications.service';
import { NotificationsController } from '../src/notifications/notifications.controller';
import { UpdatePreferenciaNotificacionDto } from '../src/notifications/dto/update-preferencia-notificacion.dto';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * HU-185 (T-326): preferencias de notificación por usuario. La tabla se
 * simula en memoria respetando la clave única (idUsuario, tipoNotificacion)
 * para verificar el estado resultante, no solo las llamadas.
 */
type Fila = { idUsuario: number; tipoNotificacion: TipoNotificacion; activa: boolean };

function makePrisma(inicial: Fila[] = []) {
  const filas: Fila[] = inicial.map((f) => ({ ...f }));
  const prisma = {
    filas,
    preferenciaNotificacion: {
      findMany: async ({ where }: { where: { idUsuario: number } }) =>
        filas.filter((f) => f.idUsuario === where.idUsuario).map((f) => ({ ...f })),
      upsert: async ({
        where,
        update,
        create,
      }: {
        where: { idUsuario_tipoNotificacion: { idUsuario: number; tipoNotificacion: TipoNotificacion } };
        update: { activa: boolean };
        create: Fila;
      }) => {
        const { idUsuario, tipoNotificacion } = where.idUsuario_tipoNotificacion;
        const existente = filas.find((f) => f.idUsuario === idUsuario && f.tipoNotificacion === tipoNotificacion);
        if (existente) {
          Object.assign(existente, update);
          return { ...existente };
        }
        filas.push({ ...create });
        return { ...create };
      },
    },
  };
  return prisma as typeof prisma & PrismaService;
}

const TODOS = Object.values(TipoNotificacion);
const estadoDe = (lista: { tipo: TipoNotificacion; activa: boolean }[], tipo: TipoNotificacion) =>
  lista.find((p) => p.tipo === tipo)?.activa;

describe('NotificationsService.getPreferences (T-326)', () => {
  it('un usuario sin preferencias recibe todos los tipos reales como activos', async () => {
    const service = new NotificationsService(makePrisma());

    const prefs = await service.getPreferences(1);

    expect(prefs.map((p) => p.tipo)).toEqual(TODOS);
    expect(prefs.every((p) => p.activa)).toBe(true);
  });

  it('devuelve los estados guardados y deja activos los tipos sin fila', async () => {
    const service = new NotificationsService(
      makePrisma([
        { idUsuario: 1, tipoNotificacion: TipoNotificacion.TAREA_ASIGNADA, activa: false },
        { idUsuario: 1, tipoNotificacion: TipoNotificacion.NUEVA_POSTULACION, activa: true },
      ]),
    );

    const prefs = await service.getPreferences(1);

    expect(prefs).toHaveLength(TODOS.length);
    expect(estadoDe(prefs, TipoNotificacion.TAREA_ASIGNADA)).toBe(false);
    expect(estadoDe(prefs, TipoNotificacion.NUEVA_POSTULACION)).toBe(true);
    expect(estadoDe(prefs, TipoNotificacion.RECORDATORIO_EVENTO)).toBe(true);
  });

  it('no mezcla las preferencias de otro usuario', async () => {
    const service = new NotificationsService(
      makePrisma([{ idUsuario: 2, tipoNotificacion: TipoNotificacion.TAREA_ASIGNADA, activa: false }]),
    );

    const prefs = await service.getPreferences(1);

    expect(estadoDe(prefs, TipoNotificacion.TAREA_ASIGNADA)).toBe(true);
  });
});

describe('NotificationsService.updatePreference (T-326)', () => {
  it('permite desactivar un tipo (activa=false)', async () => {
    const prisma = makePrisma();
    const service = new NotificationsService(prisma);

    const prefs = await service.updatePreference(1, TipoNotificacion.TAREA_ASIGNADA, false);

    expect(estadoDe(prefs, TipoNotificacion.TAREA_ASIGNADA)).toBe(false);
    expect(prisma.filas).toEqual([
      { idUsuario: 1, tipoNotificacion: TipoNotificacion.TAREA_ASIGNADA, activa: false },
    ]);
  });

  it('permite reactivar un tipo desactivado (activa=true)', async () => {
    const prisma = makePrisma([
      { idUsuario: 1, tipoNotificacion: TipoNotificacion.TAREA_ASIGNADA, activa: false },
    ]);
    const service = new NotificationsService(prisma);

    const prefs = await service.updatePreference(1, TipoNotificacion.TAREA_ASIGNADA, true);

    expect(estadoDe(prefs, TipoNotificacion.TAREA_ASIGNADA)).toBe(true);
    expect(prisma.filas[0].activa).toBe(true);
  });

  it('no crea filas duplicadas para el mismo usuario y tipo', async () => {
    const prisma = makePrisma();
    const service = new NotificationsService(prisma);

    await service.updatePreference(1, TipoNotificacion.TAREA_ASIGNADA, false);
    await service.updatePreference(1, TipoNotificacion.TAREA_ASIGNADA, true);
    await service.updatePreference(1, TipoNotificacion.TAREA_ASIGNADA, false);

    expect(prisma.filas).toHaveLength(1);
    expect(prisma.filas[0].activa).toBe(false);
  });

  it('modificar las preferencias de un usuario no afecta a otro', async () => {
    const prisma = makePrisma();
    const service = new NotificationsService(prisma);

    await service.updatePreference(1, TipoNotificacion.TAREA_ASIGNADA, false);

    expect(estadoDe(await service.getPreferences(2), TipoNotificacion.TAREA_ASIGNADA)).toBe(true);
  });
});

describe('NotificationsController — preferencias (T-326)', () => {
  it('GET y PUT /notificaciones/preferencias están protegidos por JwtAuthGuard', () => {
    expect(Reflect.getMetadata(PATH_METADATA, NotificationsController)).toBe('notificaciones');
    expect(Reflect.getMetadata(GUARDS_METADATA, NotificationsController)).toContain(JwtAuthGuard);

    const get = NotificationsController.prototype.getPreferences;
    const put = NotificationsController.prototype.updatePreference;
    expect(Reflect.getMetadata(PATH_METADATA, get)).toBe('preferencias');
    expect(Reflect.getMetadata(METHOD_METADATA, get)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(PATH_METADATA, put)).toBe('preferencias');
    expect(Reflect.getMetadata(METHOD_METADATA, put)).toBe(RequestMethod.PUT);
  });

  it('las rutas no aceptan userId por parámetro de ruta ni de query', () => {
    for (const metodo of ['getPreferences', 'updatePreference'] as const) {
      const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, NotificationsController, metodo) ?? {};
      const tipos = Object.keys(args).map((k) => Number(k.split(':')[0]));
      // RouteParamtypes: 3 = BODY, 4 = QUERY, 5 = PARAM; el resto es @CurrentUser.
      expect(tipos).not.toContain(4);
      expect(tipos).not.toContain(5);
    }
  });

  it('usa siempre el usuario autenticado, aunque otro id intente colarse', async () => {
    const prisma = makePrisma();
    const service = new NotificationsService(prisma);
    const controller = new NotificationsController(service);

    await controller.updatePreference(
      { tipo: TipoNotificacion.TAREA_ASIGNADA, activa: false } as UpdatePreferenciaNotificacionDto,
      { userId: 7 },
    );

    expect(prisma.filas).toEqual([
      { idUsuario: 7, tipoNotificacion: TipoNotificacion.TAREA_ASIGNADA, activa: false },
    ]);
    const deOtro = await controller.getPreferences({ userId: 8 });
    expect(estadoDe(deOtro, TipoNotificacion.TAREA_ASIGNADA)).toBe(true);
  });
});

describe('UpdatePreferenciaNotificacionDto (T-326)', () => {
  // Misma configuración que apps/backend/src/main.ts.
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const parse = (plain: unknown) =>
    pipe.transform(plain, { type: 'body', metatype: UpdatePreferenciaNotificacionDto });

  it('acepta un tipo real y un booleano', async () => {
    const dto = await parse({ tipo: 'TAREA_ASIGNADA', activa: false });
    expect(dto).toMatchObject({ tipo: TipoNotificacion.TAREA_ASIGNADA, activa: false });
  });

  it('rechaza un tipo que no existe', async () => {
    await expect(parse({ tipo: 'CHAT', activa: true })).rejects.toThrow(BadRequestException);
  });

  it('rechaza activa que no sea booleano', async () => {
    await expect(parse({ tipo: 'TAREA_ASIGNADA', activa: 'no' })).rejects.toThrow(BadRequestException);
  });

  it('rechaza campos faltantes', async () => {
    await expect(parse({ tipo: 'TAREA_ASIGNADA' })).rejects.toThrow(BadRequestException);
    await expect(parse({ activa: true })).rejects.toThrow(BadRequestException);
  });

  it('rechaza un idUsuario en el cuerpo (no se pueden tocar preferencias ajenas)', async () => {
    await expect(parse({ tipo: 'TAREA_ASIGNADA', activa: false, idUsuario: 2 })).rejects.toThrow(
      BadRequestException,
    );
  });

  // esbuild no emite `design:type`; `nest build` sí, y con él la conversión
  // implícita convertiría "false" en true. Se simula ese metadato aquí.
  describe('con el metadato que emite el build de producción', () => {
    beforeAll(() => {
      Reflect.defineMetadata('design:type', Boolean, UpdatePreferenciaNotificacionDto.prototype, 'activa');
    });
    afterAll(() => {
      Reflect.deleteMetadata('design:type', UpdatePreferenciaNotificacionDto.prototype, 'activa');
    });

    it.each(['false', 'true', 'no', 1, 0])('rechaza activa=%j en vez de convertirlo', async (activa) => {
      await expect(parse({ tipo: 'TAREA_ASIGNADA', activa })).rejects.toThrow(BadRequestException);
    });

    it('conserva los booleanos reales', async () => {
      await expect(parse({ tipo: 'TAREA_ASIGNADA', activa: false })).resolves.toMatchObject({ activa: false });
      await expect(parse({ tipo: 'TAREA_ASIGNADA', activa: true })).resolves.toMatchObject({ activa: true });
    });
  });
});
