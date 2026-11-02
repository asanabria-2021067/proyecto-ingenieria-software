import { Injectable, NotFoundException } from '@nestjs/common';
import { RolOrganizacion } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertActiva, assertRol, cargarContexto, ROLES_GESTION } from '../organizations/organization-access';
import { assertPuedePublicarComoAsociacion } from '../associations/junta-access';
import { ANUNCIO_NOT_FOUND_MESSAGE, validarRango } from './anuncios.service';
import { CreateAnuncioEntidadDto } from './dto/create-anuncio-entidad.dto';

const SELECT = {
  idAnuncio: true,
  titulo: true,
  mensaje: true,
  nivel: true,
  fechaInicio: true,
  fechaFin: true,
  activo: true,
  fechaCreacion: true,
} as const;

type Dueno = { idOrganizacion: number } | { idAsociacion: number };

/** MEJ-66: anuncios de una organización (publican Propietario/Admin) o de una asociación (Presidente/Editores). */
@Injectable()
export class AnunciosEntidadService {
  constructor(private prisma: PrismaService) {}

  private crear(dto: CreateAnuncioEntidadDto, userId: number, dueno: Dueno) {
    const fechaInicio = new Date(dto.fechaInicio);
    const fechaFin = new Date(dto.fechaFin);
    validarRango(fechaInicio, fechaFin);
    return this.prisma.anuncio.create({
      data: { ...dto, fechaInicio, fechaFin, audiencia: 'TODOS', creadoPor: userId, ...dueno },
      select: SELECT,
    });
  }

  /** Despublicar no borra; el anuncio debe ser de esa entidad (otro id responde 404). */
  private async despublicar(idAnuncio: number, dueno: Dueno) {
    const { count } = await this.prisma.anuncio.updateMany({ where: { idAnuncio, ...dueno }, data: { activo: false } });
    if (count === 0) throw new NotFoundException(ANUNCIO_NOT_FOUND_MESSAGE);
    return { idAnuncio };
  }

  /** Solo miembros activos de la organización (una privada responde 404 a quien no es miembro). */
  async listarOrganizacion(userId: number, idOrganizacion: number) {
    const ctx = await cargarContexto(this.prisma, userId, idOrganizacion);
    assertRol(ctx, Object.values(RolOrganizacion), 'Solo los miembros ven los anuncios de la organización');
    return this.prisma.anuncio.findMany({ where: { idOrganizacion }, select: SELECT, orderBy: { fechaCreacion: 'desc' }, take: 50 });
  }

  async crearOrganizacion(userId: number, idOrganizacion: number, dto: CreateAnuncioEntidadDto) {
    const ctx = await cargarContexto(this.prisma, userId, idOrganizacion);
    assertRol(ctx, ROLES_GESTION, 'Solo el propietario o un administrador publica anuncios');
    assertActiva(ctx);
    return this.crear(dto, userId, { idOrganizacion });
  }

  async despublicarOrganizacion(userId: number, idOrganizacion: number, idAnuncio: number) {
    const ctx = await cargarContexto(this.prisma, userId, idOrganizacion);
    assertRol(ctx, ROLES_GESTION, 'Solo el propietario o un administrador despublica anuncios');
    return this.despublicar(idAnuncio, { idOrganizacion });
  }

  /** La junta (ya verificada por JuntaGuard) ve los anuncios de su asociación. */
  listarAsociacion(idAsociacion: number) {
    return this.prisma.anuncio.findMany({ where: { idAsociacion }, select: SELECT, orderBy: { fechaCreacion: 'desc' }, take: 50 });
  }

  async crearAsociacion(userId: number, idAsociacion: number, dto: CreateAnuncioEntidadDto) {
    await assertPuedePublicarComoAsociacion(this.prisma, idAsociacion, userId);
    return this.crear(dto, userId, { idAsociacion });
  }

  async despublicarAsociacion(userId: number, idAsociacion: number, idAnuncio: number) {
    await assertPuedePublicarComoAsociacion(this.prisma, idAsociacion, userId);
    return this.despublicar(idAnuncio, { idAsociacion });
  }
}
