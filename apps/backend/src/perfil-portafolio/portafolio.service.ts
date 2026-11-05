import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PerfilSocialService } from '../social/perfil-social.service';
import { HabilidadConfirmacionesService } from './habilidad-confirmaciones.service';

/** 32 bytes aleatorios en base64url: 43 caracteres, 256 bits de entropia. */
const nuevoToken = () => randomBytes(32).toString('base64url');
const FORMATO_TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** Unico contenido que sale sin sesion. Cualquier campo nuevo debe agregarse aqui a proposito. */
export interface PortafolioPublicoVista {
  nombre: string;
  carrera: string | null;
  habilidades: Array<{ nombre: string; nivel: string; confirmaciones: number }>;
  proyectos: Array<{ titulo: string; rol: string }>;
  indexable: boolean;
}

/** MEJ-146: portafolio publico opcional del estudiante. */
@Injectable()
export class PortafolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly perfilSocial: PerfilSocialService,
    private readonly confirmaciones: HabilidadConfirmacionesService,
  ) {}

  async estado(idUsuario: number) {
    const fila = await this.prisma.portafolioPublico.findUnique({ where: { idUsuario } });
    return { activo: fila?.activo ?? false, indexable: fila?.indexable ?? false, token: fila?.token ?? null };
  }

  private async assertEstudiante(idUsuario: number) {
    const perfil = await this.prisma.perfilEstudiante.findUnique({ where: { idUsuario }, select: { idUsuario: true } });
    if (!perfil) throw new ForbiddenException('Solo los estudiantes tienen portafolio');
  }

  async actualizar(idUsuario: number, cambios: { activo?: boolean; indexable?: boolean }) {
    await this.assertEstudiante(idUsuario);
    await this.prisma.portafolioPublico.upsert({
      where: { idUsuario },
      create: { idUsuario, token: nuevoToken(), ...cambios },
      update: cambios,
    });
    return this.estado(idUsuario);
  }

  /** El enlace anterior deja de funcionar de inmediato (404). */
  async regenerar(idUsuario: number) {
    await this.assertEstudiante(idUsuario);
    await this.prisma.portafolioPublico.upsert({
      where: { idUsuario },
      create: { idUsuario, token: nuevoToken() },
      update: { token: nuevoToken() },
    });
    return this.estado(idUsuario);
  }

  /** Sin sesion. Token inexistente, inactivo o de una cuenta no activa: el mismo 404. */
  async publico(token: string): Promise<PortafolioPublicoVista> {
    if (!FORMATO_TOKEN.test(token)) throw new NotFoundException('Portafolio no encontrado');
    const fila = await this.prisma.portafolioPublico.findUnique({
      where: { token },
      select: { idUsuario: true, activo: true, indexable: true, usuario: { select: { estado: true } } },
    });
    if (!fila || !fila.activo || fila.usuario.estado !== 'ACTIVO') throw new NotFoundException('Portafolio no encontrado');
    // idVisor 0 no es ningun usuario: cv() y listar() aplican las reglas de quien mira sin sesion (solo proyectos de organizaciones publicas).
    // Cualquier 404 interno (p. ej. cuenta fuera del directorio) se vuelve el mismo mensaje: no revela el motivo.
    const [cv, habilidades] = await Promise.all([
      this.perfilSocial.cv(0, fila.idUsuario),
      this.confirmaciones.listar(0, fila.idUsuario),
    ]).catch((error: unknown) => {
      if (error instanceof NotFoundException) throw new NotFoundException('Portafolio no encontrado');
      throw error;
    });
    return {
      nombre: cv.nombre,
      carrera: cv.carrera,
      habilidades: habilidades.map((h) => ({ nombre: h.nombre, nivel: h.nivel, confirmaciones: h.confirmaciones })),
      proyectos: cv.proyectos.map((p) => ({ titulo: p.titulo, rol: p.rol })),
      indexable: fila.indexable,
    };
  }
}
