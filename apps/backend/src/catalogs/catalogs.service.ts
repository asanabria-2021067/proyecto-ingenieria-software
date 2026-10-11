import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCatalogItemDto } from './dto/create-catalog-item.dto';

// T-292: los catálogos casi no cambian y se piden en cada formulario de
// perfil y de proyecto. Se cachean en Redis con TTL corto; las altas de
// habilidades, intereses y cualidades invalidan su lista. Carreras y
// organizaciones solo cambian por seed, así que dependen del TTL.
export const CATALOG_CACHE_TTL = 300_000;
export const CATALOG_CACHE_KEYS = {
  carreras: 'catalogs:carreras',
  habilidades: 'catalogs:habilidades',
  intereses: 'catalogs:intereses',
  cualidades: 'catalogs:cualidades',
  organizaciones: 'catalogs:organizaciones',
} as const;

@Injectable()
export class CatalogsService {
  constructor(
    private prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  /** Lee de la caché y, si no está, consulta y la guarda. Un fallo de Redis nunca rompe la lectura. */
  private async cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = await this.cacheManager.get<T>(key).catch(() => undefined);
    if (hit !== undefined && hit !== null) return hit;
    const value = await load();
    await this.cacheManager.set(key, value, CATALOG_CACHE_TTL).catch(() => {});
    return value;
  }

  private async invalidate(key: string): Promise<void> {
    await this.cacheManager.del(key).catch(() => {});
  }

  private normalizeNombre(nombre: string) {
    return nombre.trim().replace(/\s+/g, ' ');
  }

  findAll() {
    return this.getProfileCatalogs();
  }

  findCarreras() {
    return this.cached(CATALOG_CACHE_KEYS.carreras, () =>
      this.prisma.carrera.findMany({
        where: { estado: 'ACTIVA' },
        orderBy: { nombreCarrera: 'asc' },
      }),
    );
  }

  findHabilidades() {
    return this.cached(CATALOG_CACHE_KEYS.habilidades, () =>
      this.prisma.habilidad.findMany({
        orderBy: { nombreHabilidad: 'asc' },
      }),
    );
  }

  findIntereses() {
    return this.cached(CATALOG_CACHE_KEYS.intereses, () =>
      this.prisma.interes.findMany({
        orderBy: { nombreInteres: 'asc' },
      }),
    );
  }

  findCualidades() {
    return this.cached(CATALOG_CACHE_KEYS.cualidades, () =>
      this.prisma.cualidad.findMany({
        orderBy: { nombreCualidad: 'asc' },
      }),
    );
  }

  findOrganizaciones() {
    return this.cached(CATALOG_CACHE_KEYS.organizaciones, () =>
      this.prisma.organizacion.findMany({
        where: { estadoOrganizacion: 'ACTIVA' },
        select: {
          idOrganizacion: true,
          nombreOrganizacion: true,
        },
        orderBy: { nombreOrganizacion: 'asc' },
      }),
    );
  }

  async createHabilidad(dto: CreateCatalogItemDto) {
    const nombre = this.normalizeNombre(dto.nombre);
    const existing = await this.prisma.habilidad.findFirst({
      where: { nombreHabilidad: { equals: nombre, mode: 'insensitive' } },
    });
    if (existing) return existing;
    const creada = await this.prisma.habilidad.create({
      data: {
        nombreHabilidad: nombre,
        categoriaHabilidad: dto.categoria?.trim() || null,
      },
    });
    await this.invalidate(CATALOG_CACHE_KEYS.habilidades);
    return creada;
  }

  async createInteres(dto: CreateCatalogItemDto) {
    const nombre = this.normalizeNombre(dto.nombre);
    const existing = await this.prisma.interes.findFirst({
      where: { nombreInteres: { equals: nombre, mode: 'insensitive' } },
    });
    if (existing) return existing;
    const creado = await this.prisma.interes.create({
      data: {
        nombreInteres: nombre,
      },
    });
    await this.invalidate(CATALOG_CACHE_KEYS.intereses);
    return creado;
  }

  async createCualidad(dto: CreateCatalogItemDto) {
    const nombre = this.normalizeNombre(dto.nombre);
    const existing = await this.prisma.cualidad.findFirst({
      where: { nombreCualidad: { equals: nombre, mode: 'insensitive' } },
    });
    if (existing) return existing;
    const creada = await this.prisma.cualidad.create({
      data: {
        nombreCualidad: nombre,
      },
    });
    await this.invalidate(CATALOG_CACHE_KEYS.cualidades);
    return creada;
  }

  async getProfileCatalogs() {
    const [carreras, habilidades, intereses, cualidades] = await Promise.all([
      this.findCarreras(),
      this.findHabilidades(),
      this.findIntereses(),
      this.findCualidades(),
    ]);

    return {
      carreras: carreras.map((c) => ({
        id: c.idCarrera.toString(),
        nombre: c.nombreCarrera,
      })),

      habilidades: habilidades.map((h) => ({
        id: h.idHabilidad.toString(),
        nombre: h.nombreHabilidad,
      })),

      intereses: intereses.map((i) => ({
        id: i.idInteres.toString(),
        nombre: i.nombreInteres,
      })),

      cualidades: cualidades.map((q) => ({
        id: q.idCualidad.toString(),
        nombre: q.nombreCualidad,
      })),

      // Estos permanecen estáticos porque no tienen tabla en Prisma
      disponibilidades: [
        { id: '1', nombre: 'Tiempo completo' },
        { id: '2', nombre: 'Tiempo parcial' },
        { id: '3', nombre: 'Fines de semana' },
        { id: '4', nombre: 'Solo noches' },
        { id: '5', nombre: 'Flexible' },
      ],

      modalidades: [
        { value: 'presencial', label: 'Presencial' },
        { value: 'remoto', label: 'Remoto' },
        { value: 'hibrido', label: 'Híbrido' },
      ],
    };
  }
}
