import { describe, expect, it, vi } from 'vitest';
import type { Cache } from 'cache-manager';
import type { PrismaService } from '../src/prisma/prisma.service';
import { CATALOG_CACHE_KEYS, CATALOG_CACHE_TTL, CatalogsService } from '../src/catalogs/catalogs.service';

/**
 * HU-176 (T-292). Los catálogos se leen de la caché y una alta invalida su
 * lista, para que no se muestre un catálogo viejo después de crear.
 */

function memoryCache() {
  const store = new Map<string, unknown>();
  return {
    store,
    get: vi.fn(async (key: string) => store.get(key)),
    set: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    del: vi.fn(async (key: string) => store.delete(key)),
  };
}

function build() {
  const habilidades = [{ idHabilidad: 1, nombreHabilidad: 'TypeScript' }];
  const prisma = {
    carrera: { findMany: vi.fn().mockResolvedValue([{ idCarrera: 1, nombreCarrera: 'Ingeniería' }]) },
    habilidad: {
      findMany: vi.fn(async () => [...habilidades]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(async ({ data }: { data: { nombreHabilidad: string } }) => {
        const creada = { idHabilidad: habilidades.length + 1, nombreHabilidad: data.nombreHabilidad };
        habilidades.push(creada);
        return creada;
      }),
    },
    interes: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ idInteres: 1, nombreInteres: 'IA' }),
    },
    cualidad: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ idCualidad: 1, nombreCualidad: 'Liderazgo' }),
    },
    organizacion: { findMany: vi.fn().mockResolvedValue([{ idOrganizacion: 1, nombreOrganizacion: 'UVG' }]) },
  };
  const cache = memoryCache();
  const service = new CatalogsService(prisma as unknown as PrismaService, cache as unknown as Cache);
  return { prisma, cache, service };
}

describe('CatalogsService · caché (T-292)', () => {
  it('la segunda lectura sale de la caché, con el TTL corto', async () => {
    const { prisma, cache, service } = build();

    await service.findCarreras();
    const segunda = await service.findCarreras();

    expect(segunda).toEqual([{ idCarrera: 1, nombreCarrera: 'Ingeniería' }]);
    expect(prisma.carrera.findMany).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledWith(CATALOG_CACHE_KEYS.carreras, segunda, CATALOG_CACHE_TTL);
  });

  it('GET /catalogs arma el catálogo de perfil desde las listas cacheadas', async () => {
    const { prisma, service } = build();

    await service.findAll();
    const catalogo = await service.findAll();

    expect(catalogo.carreras).toEqual([{ id: '1', nombre: 'Ingeniería' }]);
    expect(prisma.carrera.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.habilidad.findMany).toHaveBeenCalledTimes(1);
  });

  it('crear una habilidad invalida su lista y la siguiente lectura la incluye', async () => {
    const { prisma, cache, service } = build();
    await service.findHabilidades();

    await service.createHabilidad({ nombre: 'Rust' });
    const despues = await service.findHabilidades();

    expect(cache.del).toHaveBeenCalledWith(CATALOG_CACHE_KEYS.habilidades);
    expect(prisma.habilidad.findMany).toHaveBeenCalledTimes(2);
    expect(despues.map((h) => h.nombreHabilidad)).toEqual(['TypeScript', 'Rust']);
  });

  it('una habilidad que ya existe no invalida nada', async () => {
    const { prisma, cache, service } = build();
    prisma.habilidad.findFirst.mockResolvedValue({ idHabilidad: 1, nombreHabilidad: 'TypeScript' });

    await service.createHabilidad({ nombre: 'typescript' });

    expect(cache.del).not.toHaveBeenCalled();
  });

  it('crear un interés o una cualidad invalida su propia lista', async () => {
    const { cache, service } = build();

    await service.createInteres({ nombre: 'IA' });
    await service.createCualidad({ nombre: 'Liderazgo' });

    expect(cache.del).toHaveBeenCalledWith(CATALOG_CACHE_KEYS.intereses);
    expect(cache.del).toHaveBeenCalledWith(CATALOG_CACHE_KEYS.cualidades);
  });

  it('si Redis falla, la lectura sigue contra la base', async () => {
    const { prisma, cache, service } = build();
    cache.get.mockRejectedValue(new Error('redis caído'));
    cache.set.mockRejectedValue(new Error('redis caído'));

    const organizaciones = await service.findOrganizaciones();

    expect(organizaciones).toEqual([{ idOrganizacion: 1, nombreOrganizacion: 'UVG' }]);
    expect(prisma.organizacion.findMany).toHaveBeenCalledTimes(1);
  });
});
