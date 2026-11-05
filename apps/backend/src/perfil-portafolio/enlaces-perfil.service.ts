import { BadRequestException, Injectable } from '@nestjs/common';
import { isIP } from 'node:net';
import { LinkPreviewService } from '../chat/link-preview/link-preview.service';
import { PrismaService } from '../prisma/prisma.service';
import { assertPerfilAccesible } from './perfil-acceso';

export const MAX_ENLACES = 5;
export type TipoEnlace = 'GITHUB' | 'LINKEDIN' | 'BEHANCE' | 'SITIO';

const PROPIOS: Array<[string, TipoEnlace]> = [
  ['github.com', 'GITHUB'],
  ['linkedin.com', 'LINKEDIN'],
  ['behance.net', 'BEHANCE'],
];

export function tipoDeEnlace(url: string): TipoEnlace {
  const host = new URL(url).hostname;
  return PROPIOS.find(([d]) => host === d || host.endsWith(`.${d}`))?.[1] ?? 'SITIO';
}

/** Solo https, sin credenciales, puerto 443, dominio con punto (nada de IP literal ni localhost). Devuelve la URL normalizada. */
export function normalizarEnlace(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new BadRequestException('Enlace no valido');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (url.protocol !== 'https:' || url.username || url.password || url.port || isIP(host) || !host.includes('.') || url.href.length > 2048) {
    throw new BadRequestException('Los enlaces deben ser https://, con un dominio publico y sin credenciales');
  }
  return url.href;
}

/** MEJ-149: enlaces del perfil con vista previa; la peticion sale por LinkPreviewService (proteccion SSRF del chat). */
@Injectable()
export class EnlacesPerfilService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly preview: LinkPreviewService,
  ) {}

  async listar(idVisor: number, idObjetivo: number) {
    await assertPerfilAccesible(this.prisma, idVisor, idObjetivo);
    const filas = await this.prisma.enlacePerfil.findMany({
      where: { idUsuario: idObjetivo },
      orderBy: [{ orden: 'asc' }, { idEnlace: 'asc' }],
      select: { idEnlace: true, url: true },
    });
    return Promise.all(
      filas.map(async (f) => {
        const vista = await this.preview.preview(f.url).catch(() => null);
        return {
          idEnlace: f.idEnlace,
          url: f.url,
          tipo: tipoDeEnlace(f.url),
          titulo: vista?.titulo ?? null,
          sitio: vista?.sitio ?? new URL(f.url).hostname,
        };
      }),
    );
  }

  /** Solo la propia persona: el id sale del token. Reemplaza toda la lista. */
  async reemplazar(idUsuario: number, urls: string[]) {
    const limpias = [...new Set(urls.map(normalizarEnlace))];
    if (limpias.length > MAX_ENLACES) throw new BadRequestException(`Maximo ${MAX_ENLACES} enlaces`);
    await this.prisma.$transaction([
      this.prisma.enlacePerfil.deleteMany({ where: { idUsuario } }),
      this.prisma.enlacePerfil.createMany({ data: limpias.map((url, orden) => ({ idUsuario, url, orden })) }),
    ]);
    return this.listar(idUsuario, idUsuario);
  }
}
