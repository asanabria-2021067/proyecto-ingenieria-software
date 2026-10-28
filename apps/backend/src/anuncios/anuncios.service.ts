import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AudienciaAnuncio, NivelAnuncio, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAnuncioDto } from './dto/create-anuncio.dto';
import { UpdateAnuncioDto } from './dto/update-anuncio.dto';

export const ANUNCIO_RANGO_MESSAGE = 'fechaFin debe ser posterior a fechaInicio';
export const ANUNCIO_NOT_FOUND_MESSAGE = 'Anuncio no encontrado';

const IMPORTANCIA: Record<NivelAnuncio, number> = { URGENTE: 3, ADVERTENCIA: 2, INFO: 1 };

/** URGENTE > ADVERTENCIA > INFO; a igual nivel, el más reciente primero. */
export function ordenarPorImportancia<T extends { nivel: NivelAnuncio; fechaInicio: Date; idAnuncio: number }>(
  anuncios: T[],
): T[] {
  return [...anuncios].sort(
    (a, b) =>
      IMPORTANCIA[b.nivel] - IMPORTANCIA[a.nivel] ||
      b.fechaInicio.getTime() - a.fechaInicio.getTime() ||
      b.idAnuncio - a.idAnuncio,
  );
}

export function validarRango(inicio: Date, fin: Date): void {
  if (fin.getTime() <= inicio.getTime()) throw new BadRequestException(ANUNCIO_RANGO_MESSAGE);
}

@Injectable()
export class AnunciosService {
  constructor(private prisma: PrismaService) {}

  listAdmin() {
    return this.prisma.anuncio.findMany({ orderBy: { fechaCreacion: 'desc' } });
  }

  async create(dto: CreateAnuncioDto) {
    const fechaInicio = new Date(dto.fechaInicio);
    const fechaFin = new Date(dto.fechaFin);
    validarRango(fechaInicio, fechaFin);
    return this.prisma.anuncio.create({ data: { ...dto, fechaInicio, fechaFin } });
  }

  async update(id: number, dto: UpdateAnuncioDto) {
    const actual = await this.prisma.anuncio.findUnique({ where: { idAnuncio: id } });
    if (!actual) throw new NotFoundException(ANUNCIO_NOT_FOUND_MESSAGE);
    const fechaInicio = dto.fechaInicio ? new Date(dto.fechaInicio) : actual.fechaInicio;
    const fechaFin = dto.fechaFin ? new Date(dto.fechaFin) : actual.fechaFin;
    validarRango(fechaInicio, fechaFin);
    return this.prisma.anuncio.update({
      where: { idAnuncio: id },
      data: { ...dto, fechaInicio, fechaFin },
    });
  }

  /** Despublicar no borra: conserva el anuncio y sus cierres. */
  async despublicar(id: number) {
    try {
      return await this.prisma.anuncio.update({ where: { idAnuncio: id }, data: { activo: false } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException(ANUNCIO_NOT_FOUND_MESSAGE);
      }
      throw e;
    }
  }

  /** «Estudiante» = rol de acceso `estudiante`; el resto de roles solo ve los anuncios para TODOS. */
  private async audienciasDe(idUsuario: number): Promise<AudienciaAnuncio[]> {
    const esEstudiante = await this.prisma.usuarioRolAcceso.findFirst({
      where: { idUsuario, rolAcceso: { nombrePerfil: 'estudiante' } },
      select: { idUsuarioRolAcceso: true },
    });
    return esEstudiante ? ['TODOS', 'ESTUDIANTES'] : ['TODOS'];
  }

  private async whereVigente(idUsuario: number, ahora: Date, sinCerrar = true): Promise<Prisma.AnuncioWhereInput> {
    return {
      activo: true,
      fechaInicio: { lte: ahora },
      fechaFin: { gt: ahora },
      audiencia: { in: await this.audienciasDe(idUsuario) },
      ...(sinCerrar ? { cierres: { none: { idUsuario } } } : {}),
    };
  }

  /** Anuncios vigentes para el usuario (activo, en fechas, su audiencia, sin cerrar), por importancia. */
  async findVigentes(idUsuario: number, ahora = new Date()) {
    const anuncios = await this.prisma.anuncio.findMany({
      where: await this.whereVigente(idUsuario, ahora),
      select: {
        idAnuncio: true,
        titulo: true,
        mensaje: true,
        nivel: true,
        fechaInicio: true,
        fechaFin: true,
      },
    });
    return ordenarPorImportancia(anuncios);
  }

  async cerrar(idUsuario: number, idAnuncio: number, ahora = new Date()) {
    const where = { ...(await this.whereVigente(idUsuario, ahora, false)), idAnuncio };
    // Cerrar es idempotente; uno no vigente o de otra audiencia responde 404 sin revelar su existencia.
    const anuncio = await this.prisma.anuncio.findFirst({ where, select: { idAnuncio: true } });
    if (!anuncio) throw new NotFoundException(ANUNCIO_NOT_FOUND_MESSAGE);
    await this.prisma.anuncioCierre.upsert({
      where: { idAnuncio_idUsuario: { idAnuncio, idUsuario } },
      create: { idAnuncio, idUsuario },
      update: {},
    });
    return { idAnuncio };
  }
}
