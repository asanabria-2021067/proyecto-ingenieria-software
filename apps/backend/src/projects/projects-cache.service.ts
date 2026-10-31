import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

const FEATURED_CACHE_KEY = 'projects:featured';
const FEATURED_CACHE_TTL = 300_000;

/**
 * Caché de proyectos destacados. Los fallos del almacén de caché nunca
 * afectan a quien llama (mismo comportamiento previo en ProjectsService).
 */
@Injectable()
export class ProjectsCacheService {
  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

  getFeatured(): Promise<Record<string, unknown>[] | null | undefined> {
    return this.cacheManager.get<Record<string, unknown>[]>(FEATURED_CACHE_KEY).catch(() => null);
  }

  async setFeatured(destacados: Record<string, unknown>[]): Promise<void> {
    await this.cacheManager.set(FEATURED_CACHE_KEY, destacados, FEATURED_CACHE_TTL).catch(() => {});
  }

  async invalidateFeatured(): Promise<void> {
    await this.cacheManager.del(FEATURED_CACHE_KEY).catch(() => {});
  }
}
