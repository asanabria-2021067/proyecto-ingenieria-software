import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { MaintenanceService, MAINTENANCE_DEFAULT_MESSAGE } from '../src/maintenance/maintenance.service';
import { MaintenanceMiddleware } from '../src/maintenance/maintenance.middleware';
import type { PrismaService } from '../src/prisma/prisma.service';
import { SYNTHETIC_JWT_SECRET } from './helpers/synthetic-jwt-secret';

const HORA = 3_600_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

function montarServicio(opciones: { admin?: boolean; guardado?: object | null; redisCaido?: boolean } = {}) {
  const { admin = true, guardado = null, redisCaido = false } = opciones;
  const filas = new Map<string, string>();
  if (guardado) filas.set('mantenimiento', JSON.stringify(guardado));
  const almacen = new Map<string, unknown>();
  const cache = {
    get: vi.fn(async (k: string) => {
      if (redisCaido) throw new Error('redis caido');
      return almacen.get(k);
    }),
    set: vi.fn(async (k: string, v: unknown) => {
      if (redisCaido) throw new Error('redis caido');
      almacen.set(k, v);
    }),
  };
  const bitacora: Array<{ accion: string; idUsuario: number; detalleJson: { antes: unknown; despues: unknown } }> = [];
  const prisma = {
    usuarioRolAcceso: { findFirst: vi.fn().mockResolvedValue(admin ? { idUsuarioRolAcceso: 1 } : null) },
    configuracionSistema: {
      findUnique: vi.fn(async ({ where }: { where: { clave: string } }) =>
        filas.has(where.clave) ? { valor: filas.get(where.clave) } : null,
      ),
      upsert: vi.fn(async ({ create }: { create: { clave: string; valor: string } }) => {
        filas.set(create.clave, create.valor);
        return create;
      }),
    },
    bitacoraAuditoria: { create: vi.fn(async ({ data }: { data: (typeof bitacora)[number] }) => bitacora.push(data)) },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const service = new MaintenanceService(prisma as unknown as PrismaService, cache as never);
  return { service, prisma, cache, bitacora, filas };
}

describe('MaintenanceService', () => {
  it('por defecto no bloquea y trae el mensaje estándar', async () => {
    const { service } = montarServicio();
    expect(await service.estado()).toMatchObject({ bloqueando: false, mensaje: MAINTENANCE_DEFAULT_MESSAGE, regresoEstimado: null });
    expect(MAINTENANCE_DEFAULT_MESSAGE).toBe('La plataforma está en mantenimiento. Disculpa las molestias.');
  });

  it('un inicio programado en el futuro no bloquea y uno pasado sí', async () => {
    const futuro = montarServicio({ guardado: { activo: false, inicioProgramado: iso(HORA) } });
    expect((await futuro.service.estado()).bloqueando).toBe(false);
    const pasado = montarServicio({ guardado: { activo: false, inicioProgramado: iso(-HORA) } });
    expect((await pasado.service.estado()).bloqueando).toBe(true);
  });

  it('el estado programado se recalcula con la hora actual aunque venga de la caché', async () => {
    vi.useFakeTimers();
    try {
      const inicio = new Date(Date.now() + HORA).toISOString();
      const { service } = montarServicio({ guardado: { activo: false, inicioProgramado: inicio } });
      expect((await service.estado()).bloqueando).toBe(false);
      vi.setSystemTime(Date.now() + 2 * HORA);
      expect((await service.estado()).bloqueando).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('si Redis cae, lee de la base', async () => {
    const { service, prisma } = montarServicio({ redisCaido: true, guardado: { activo: true, mensaje: 'Volvemos pronto' } });
    expect(await service.estado()).toMatchObject({ bloqueando: true, mensaje: 'Volvemos pronto' });
    expect(prisma.configuracionSistema.findUnique).toHaveBeenCalled();
  });

  it('activar, editar y desactivar quedan en la bitácora con quién y qué cambió', async () => {
    const { service, bitacora, filas } = montarServicio();
    await service.actualizar(9, { activo: true, mensaje: 'Migración', regresoEstimado: iso(2 * HORA) });
    await service.actualizar(9, { activo: true, mensaje: 'Migración extendida' });
    await service.actualizar(9, { activo: false, inicioProgramado: iso(5 * HORA) });
    await service.actualizar(9, { activo: false });
    expect(bitacora.map((b) => b.accion)).toEqual([
      'MANTENIMIENTO_ACTIVADO',
      'MANTENIMIENTO_EDITADO',
      'MANTENIMIENTO_DESACTIVADO',
      'MANTENIMIENTO_EDITADO',
    ]);
    expect(bitacora.every((b) => b.idUsuario === 9)).toBe(true);
    expect(bitacora[0].detalleJson).toMatchObject({ antes: { activo: false }, despues: { activo: true, mensaje: 'Migración' } });
    expect(JSON.parse(filas.get('mantenimiento')!)).toMatchObject({ activo: false, inicioProgramado: null });
  });

  it('programar una hora de inicio nueva se registra como programado', async () => {
    const { service, bitacora } = montarServicio();
    const res = await service.actualizar(9, { activo: false, inicioProgramado: iso(HORA) });
    expect(bitacora[0].accion).toBe('MANTENIMIENTO_PROGRAMADO');
    expect(res.bloqueando).toBe(false);
  });

  it('el mensaje vacío vuelve al estándar y un regreso anterior al inicio es 400', async () => {
    const { service } = montarServicio();
    expect((await service.actualizar(9, { activo: true, mensaje: '   ' })).mensaje).toBe(MAINTENANCE_DEFAULT_MESSAGE);
    await expect(
      service.actualizar(9, { activo: false, inicioProgramado: iso(2 * HORA), regresoEstimado: iso(HORA) }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('apagar con un inicio programado ya vencido lo descarta, deja de bloquear y se registra como desactivado', async () => {
    const { service, bitacora, filas } = montarServicio({ guardado: { activo: false, inicioProgramado: iso(-HORA) } });
    expect((await service.estado()).bloqueando).toBe(true);
    const res = await service.actualizar(9, { activo: false, inicioProgramado: iso(-HORA) });
    expect(res).toMatchObject({ bloqueando: false, inicioProgramado: null });
    expect(bitacora.map((b) => b.accion)).toEqual(['MANTENIMIENTO_DESACTIVADO']);
    expect(JSON.parse(filas.get('mantenimiento')!)).toMatchObject({ activo: false, inicioProgramado: null });
    expect((await service.estado()).bloqueando).toBe(false);
  });

  it('quien no es administrador recibe 403 y no cambia nada', async () => {
    const { service, prisma, bitacora } = montarServicio({ admin: false });
    await expect(service.actualizar(5, { activo: true })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.configuracionSistema.upsert).not.toHaveBeenCalled();
    expect(bitacora).toEqual([]);
  });
});

describe('MaintenanceMiddleware (HTTP)', () => {
  const jwt = new JwtService({});
  const token = (sub: number, tipo = 'access') => jwt.sign({ sub, tipo }, { secret: SYNTHETIC_JWT_SECRET, expiresIn: '5m' });
  const ADMIN_ID = 1;
  const ESTUDIANTE_ID = 2;
  let server: Server;
  let url: string;
  let config: object | null;

  beforeAll(async () => {
    process.env.JWT_SECRET = SYNTHETIC_JWT_SECRET;
    const maintenance = {
      estado: vi.fn(async () => {
        const base = { activo: false, mensaje: MAINTENANCE_DEFAULT_MESSAGE, regresoEstimado: null, inicioProgramado: null, ...(config ?? {}) };
        const inicio = base.inicioProgramado as string | null;
        return { ...base, bloqueando: base.activo || (inicio !== null && new Date(inicio) <= new Date()) };
      }),
    };
    const prisma = {
      usuarioRolAcceso: {
        findFirst: vi.fn(async ({ where }: { where: { idUsuario: number } }) => (where.idUsuario === ADMIN_ID ? { idUsuarioRolAcceso: 1 } : null)),
      },
    };
    const middleware = new MaintenanceMiddleware(maintenance as never, jwt, prisma as never);
    const app = express();
    app.use((req, res, next) => void middleware.use(req, res, next));
    app.use((_req, res) => res.status(200).json({ ok: true }));
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
  beforeEach(() => {
    config = { activo: true, mensaje: 'Volvemos a las 6', regresoEstimado: '2026-12-02T12:00:00.000Z' };
  });

  const pedir = (ruta: string, init: { method?: string; token?: string } = {}) =>
    fetch(url + ruta, {
      method: init.method ?? 'GET',
      headers: init.token ? { authorization: `Bearer ${init.token}` } : {},
    });

  it('un estudiante recibe 503 con mensaje y regreso estimado', async () => {
    const res = await pedir('/api/proyectos', { token: token(ESTUDIANTE_ID) });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      statusCode: 503,
      codigo: 'MANTENIMIENTO',
      message: 'Volvemos a las 6',
      regresoEstimado: '2026-12-02T12:00:00.000Z',
    });
  });

  it('una petición sin sesión o con token inválido también recibe 503', async () => {
    expect((await pedir('/api/proyectos')).status).toBe(503);
    expect((await pedir('/api/proyectos', { token: 'basura' })).status).toBe(503);
    expect((await pedir('/api/auth/register', { method: 'POST' })).status).toBe(503);
  });

  it('un token de refresco de administrador no abre la plataforma', async () => {
    expect((await pedir('/api/proyectos', { token: token(ADMIN_ID, 'refresh') })).status).toBe(503);
  });

  it('el administrador sigue entrando a cualquier ruta', async () => {
    expect((await pedir('/api/proyectos', { token: token(ADMIN_ID) })).status).toBe(200);
    expect((await pedir('/api/admin/mantenimiento', { token: token(ADMIN_ID) })).status).toBe(200);
  });

  it.each([
    ['POST', '/api/auth/login'],
    ['POST', '/api/auth/refresh'],
    ['POST', '/api/auth/logout'],
    ['GET', '/api'],
    ['GET', '/api/health'],
    ['GET', '/api/carreras'],
    ['GET', '/api/mantenimiento'],
    ['GET', '/api/admin/usuarios?x=1'],
  ])('%s %s sigue respondiendo en mantenimiento', async (method, ruta) => {
    expect((await pedir(ruta, { method })).status).toBe(200);
  });

  it('no se puede colar una ruta exenta como prefijo de otra', async () => {
    expect((await pedir('/api/authx/login', { method: 'POST' })).status).toBe(503);
    expect((await pedir('/api/administrador')).status).toBe(503);
  });

  it('con mantenimiento programado en el futuro no bloquea; vencido sí', async () => {
    config = { activo: false, inicioProgramado: iso(HORA) };
    expect((await pedir('/api/proyectos', { token: token(ESTUDIANTE_ID) })).status).toBe(200);
    config = { activo: false, inicioProgramado: iso(-HORA) };
    expect((await pedir('/api/proyectos', { token: token(ESTUDIANTE_ID) })).status).toBe(503);
  });

  it('sin mantenimiento todo pasa', async () => {
    config = null;
    expect((await pedir('/api/proyectos', { token: token(ESTUDIANTE_ID) })).status).toBe(200);
  });
});
