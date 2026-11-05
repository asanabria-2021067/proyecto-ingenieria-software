import { afterEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';

const ping = vi.fn();
vi.mock('cloudinary', () => ({ v2: { config: vi.fn(), api: { ping: (...a: unknown[]) => ping(...a) } } }));

import { AdminEstadoSistemaService } from '../src/admin/admin-estado-sistema.service';
import { ServicioNoDisponibleException } from '../src/common/servicio-no-disponible.exception';
import type { PrismaService } from '../src/prisma/prisma.service';

const MIGRACIONES = [{ nombre: '20261123000000_horas_avisos', fecha: new Date('2026-11-23T00:00:00Z') }];

function montar(
  opciones: { admin?: boolean; dbCaida?: boolean; redisCaido?: boolean; cloudinary?: boolean; socket?: boolean } = {},
) {
  const { admin = true, dbCaida = false, redisCaido = false, cloudinary = true, socket = true } = opciones;
  const prisma = {
    usuarioRolAcceso: { findFirst: vi.fn().mockResolvedValue(admin ? { idUsuarioRolAcceso: 1 } : null) },
    $queryRaw: vi.fn((strings: TemplateStringsArray) => {
      if (dbCaida) return Promise.reject(new Error('db caida'));
      return Promise.resolve(strings[0].includes('_prisma_migrations') ? MIGRACIONES : [{ ok: 1 }]);
    }),
  };
  const guardado = new Map<string, unknown>();
  const cache = {
    set: vi.fn(async (k: string, v: unknown) => {
      if (!redisCaido) guardado.set(k, v);
    }),
    get: vi.fn(async (k: string) => guardado.get(k)),
  };
  const config = { get: (k: string) => (cloudinary && k.startsWith('CLOUDINARY') ? 'x' : undefined) };
  const gateway = { server: socket ? { engine: { clientsCount: 3 } } : undefined };
  const service = new AdminEstadoSistemaService(prisma as unknown as PrismaService, config as never, gateway as never, cache as never);
  return { service, prisma };
}

afterEach(() => {
  ping.mockReset();
  delete process.env.GIT_SHA;
  delete process.env.BUILD_DATE;
});

describe('AdminEstadoSistemaService', () => {
  it('todo operativo: base, Redis, Cloudinary, socket, versión y últimas migraciones', async () => {
    ping.mockResolvedValue({ status: 'OK' });
    process.env.GIT_SHA = 'abc1234';
    process.env.BUILD_DATE = '2026-12-02T10:00:00Z';
    const res = await montar().service.obtener(1);
    expect(res).toEqual({
      baseDatos: 'operativo',
      redis: 'operativo',
      cloudinary: 'operativo',
      socket: 'operativo',
      conexionesSocket: 3,
      version: { commit: 'abc1234', fecha: '2026-12-02T10:00:00Z' },
      migraciones: MIGRACIONES,
    });
  });

  it('sin variables de build la versión es desconocida', async () => {
    ping.mockResolvedValue({ status: 'OK' });
    expect((await montar().service.obtener(1)).version).toEqual({ commit: 'desconocido', fecha: 'desconocido' });
  });

  it('refleja cada servicio caído por separado', async () => {
    ping.mockRejectedValue(new Error('401'));
    const res = await montar({ dbCaida: true, redisCaido: true, socket: false }).service.obtener(1);
    expect(res).toMatchObject({ baseDatos: 'caido', redis: 'caido', cloudinary: 'caido', socket: 'caido', migraciones: [] });
  });

  it('Cloudinary sin credenciales figura como no configurado y no se consulta', async () => {
    const res = await montar({ cloudinary: false }).service.obtener(1);
    expect(res.cloudinary).toBe('no_configurado');
    expect(ping).not.toHaveBeenCalled();
  });

  it('la consulta de migraciones pide solo nombre y fecha de las últimas cinco', async () => {
    ping.mockResolvedValue({ status: 'OK' });
    const { service, prisma } = montar();
    await service.obtener(1);
    const sql = prisma.$queryRaw.mock.calls.map((c) => c[0].join('')).find((t) => t.includes('_prisma_migrations'))!;
    expect(sql).toMatch(/SELECT migration_name AS nombre, finished_at AS fecha/);
    expect(sql).toMatch(/LIMIT 5/);
  });

  it('quien no es administrador recibe 403 sin consultar nada', async () => {
    const { service, prisma } = montar({ admin: false });
    await expect(service.obtener(5)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe('ServicioNoDisponibleException', () => {
  it('es un 503 con código estable, servicio y mensaje en español', () => {
    const e = new ServicioNoDisponibleException('cloudinary', 'No se pudo guardar el archivo, intenta de nuevo');
    expect(e.getStatus()).toBe(503);
    expect(e.getResponse()).toEqual({
      statusCode: 503,
      codigo: 'SERVICIO_NO_DISPONIBLE',
      servicio: 'cloudinary',
      message: 'No se pudo guardar el archivo, intenta de nuevo',
    });
    expect(e.message).toBe('No se pudo guardar el archivo, intenta de nuevo');
  });
});
