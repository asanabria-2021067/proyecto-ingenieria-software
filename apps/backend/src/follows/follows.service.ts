import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { assertVisible, cargarContexto } from '../organizations/organization-access';

/**
 * MEJ-18: seguir organizaciones y asociaciones. Seguir es una preferencia personal (no da acceso
 * a nada): el permiso es poder VER la entidad. Dejar de seguir nunca se bloquea.
 */
@Injectable()
export class FollowsService {
  constructor(private readonly prisma: PrismaService) {}

  async misSeguimientos(userId: number) {
    const filas = await this.prisma.seguimientoEntidad.findMany({
      where: { idUsuario: userId },
      orderBy: { fechaCreacion: 'desc' },
      select: {
        organizacion: { select: { idOrganizacion: true, nombreOrganizacion: true, logoUrl: true } },
        asociacion: { select: { idAsociacion: true, nombre: true, logoUrl: true } },
      },
    });
    return {
      organizaciones: filas.flatMap((f) => (f.organizacion ? [f.organizacion] : [])),
      asociaciones: filas.flatMap((f) => (f.asociacion ? [f.asociacion] : [])),
    };
  }

  /** Asociaciones activas que cualquier estudiante puede seguir, con las carreras que representan. */
  async catalogoAsociaciones(userId: number) {
    const asociaciones = await this.prisma.asociacion.findMany({
      where: { archivada: false },
      orderBy: { nombre: 'asc' },
      select: {
        idAsociacion: true,
        nombre: true,
        logoUrl: true,
        descripcion: true,
        carreras: { select: { carrera: { select: { nombreCarrera: true } } } },
        seguidores: { where: { idUsuario: userId }, select: { idSeguimientoEntidad: true } },
      },
    });
    return asociaciones.map(({ carreras, seguidores, ...a }) => ({
      ...a,
      carreras: carreras.map((c) => c.carrera.nombreCarrera),
      siguiendo: seguidores.length > 0,
    }));
  }

  async seguirOrganizacion(userId: number, idOrganizacion: number) {
    const ctx = await cargarContexto(this.prisma, userId, idOrganizacion);
    assertVisible(ctx);
    await this.prisma.seguimientoEntidad.upsert({
      where: { idUsuario_idOrganizacion: { idUsuario: userId, idOrganizacion } },
      create: { idUsuario: userId, idOrganizacion },
      update: {},
    });
    return { idOrganizacion, siguiendo: true };
  }

  async dejarOrganizacion(userId: number, idOrganizacion: number) {
    await this.prisma.seguimientoEntidad.deleteMany({ where: { idUsuario: userId, idOrganizacion } });
    return { idOrganizacion, siguiendo: false };
  }

  async seguirAsociacion(userId: number, idAsociacion: number) {
    const asociacion = await this.prisma.asociacion.findUnique({
      where: { idAsociacion },
      select: { archivada: true },
    });
    if (!asociacion || asociacion.archivada) throw new NotFoundException('Asociación no encontrada');
    await this.prisma.seguimientoEntidad.upsert({
      where: { idUsuario_idAsociacion: { idUsuario: userId, idAsociacion } },
      create: { idUsuario: userId, idAsociacion },
      update: {},
    });
    return { idAsociacion, siguiendo: true };
  }

  async dejarAsociacion(userId: number, idAsociacion: number) {
    await this.prisma.seguimientoEntidad.deleteMany({ where: { idUsuario: userId, idAsociacion } });
    return { idAsociacion, siguiendo: false };
  }
}
