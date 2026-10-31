import { describe, expect, it, vi } from 'vitest';
import type { Cache } from 'cache-manager';
import { ProjectsCacheService } from '../src/projects/projects-cache.service';

function makeCache() {
  const cache = {
    get: vi.fn(),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
  };
  return { cache, service: new ProjectsCacheService(cache as unknown as Cache) };
}

describe('ProjectsCacheService', () => {
  it('getFeatured: hit devuelve el valor guardado bajo la clave de destacados', async () => {
    const { cache, service } = makeCache();
    cache.get.mockResolvedValue([{ idProyecto: 1 }]);
    await expect(service.getFeatured()).resolves.toEqual([{ idProyecto: 1 }]);
    expect(cache.get).toHaveBeenCalledWith('projects:featured');
  });

  it('getFeatured: miss devuelve undefined/null sin error', async () => {
    const { cache, service } = makeCache();
    cache.get.mockResolvedValue(undefined);
    await expect(service.getFeatured()).resolves.toBeFalsy();
  });

  it('getFeatured: si el almacen falla devuelve null (nunca relanza)', async () => {
    const { cache, service } = makeCache();
    cache.get.mockRejectedValue(new Error('redis caido'));
    await expect(service.getFeatured()).resolves.toBeNull();
  });

  it('setFeatured: guarda con la clave y un TTL de 300000 ms', async () => {
    const { cache, service } = makeCache();
    await service.setFeatured([{ idProyecto: 2 }]);
    expect(cache.set).toHaveBeenCalledWith('projects:featured', [{ idProyecto: 2 }], 300_000);
  });

  it('setFeatured: un fallo del almacen se traga', async () => {
    const { cache, service } = makeCache();
    cache.set.mockRejectedValue(new Error('x'));
    await expect(service.setFeatured([])).resolves.toBeUndefined();
  });

  it('invalidateFeatured: borra la clave y se traga el fallo', async () => {
    const { cache, service } = makeCache();
    await service.invalidateFeatured();
    expect(cache.del).toHaveBeenCalledWith('projects:featured');

    cache.del.mockRejectedValue(new Error('x'));
    await expect(service.invalidateFeatured()).resolves.toBeUndefined();
  });
});
