import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EstadoAmistad } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const USUARIO_RESUMEN_SELECT = {
  idUsuario: true,
  nombre: true,
  apellido: true,
  fotoUrl: true,
} as const;

@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async crearSolicitudAmistad(idUsuario: number, idReceptor: number) {
    if (idUsuario === idReceptor) {
      throw new BadRequestException('No puedes enviarte una solicitud de amistad a ti mismo');
    }

    const [directa, inversa] = await Promise.all([
      this.prisma.amistad.findUnique({
        where: { idUsuarioSolicitante_idUsuarioReceptor: { idUsuarioSolicitante: idUsuario, idUsuarioReceptor: idReceptor } },
      }),
      this.prisma.amistad.findUnique({
        where: { idUsuarioSolicitante_idUsuarioReceptor: { idUsuarioSolicitante: idReceptor, idUsuarioReceptor: idUsuario } },
      }),
    ]);

    if (directa) {
      throw new ConflictException('Ya existe una solicitud o amistad con este usuario');
    }

    if (inversa) {
      if (inversa.estado !== EstadoAmistad.PENDIENTE) {
        throw new ConflictException('Ya existe una solicitud o amistad con este usuario');
      }
      const aceptada = await this.prisma.amistad.update({
        where: { idAmistad: inversa.idAmistad },
        data: { estado: EstadoAmistad.ACEPTADA, fechaResolucion: new Date() },
      });
      const actor = await this.prisma.usuario.findUniqueOrThrow({
        where: { idUsuario },
        select: { nombre: true, apellido: true },
      });
      await this.notifications.notifyFromTemplate([inversa.idUsuarioSolicitante], 'AMISTAD_ACEPTADA', {
        userName: `${actor.nombre} ${actor.apellido}`,
        idAmistad: aceptada.idAmistad,
      });
      return aceptada;
    }

    const solicitud = await this.prisma.amistad.create({
      data: { idUsuarioSolicitante: idUsuario, idUsuarioReceptor: idReceptor },
    });
    const actor = await this.prisma.usuario.findUniqueOrThrow({
      where: { idUsuario },
      select: { nombre: true, apellido: true },
    });
    await this.notifications.notifyFromTemplate([idReceptor], 'SOLICITUD_AMISTAD', {
      userName: `${actor.nombre} ${actor.apellido}`,
      idAmistad: solicitud.idAmistad,
    });
    return solicitud;
  }

  async resolverSolicitudAmistad(idUsuario: number, idAmistad: number, accion: 'aceptar' | 'rechazar') {
    const amistad = await this.prisma.amistad.findUnique({ where: { idAmistad } });
    if (!amistad) {
      throw new NotFoundException(`Solicitud de amistad con id ${idAmistad} no encontrada`);
    }
    if (amistad.idUsuarioReceptor !== idUsuario) {
      throw new ForbiddenException('Solo el receptor puede resolver esta solicitud');
    }
    if (amistad.estado !== EstadoAmistad.PENDIENTE) {
      throw new ConflictException('Esta solicitud ya fue resuelta');
    }

    const nuevoEstado = accion === 'aceptar' ? EstadoAmistad.ACEPTADA : EstadoAmistad.RECHAZADA;
    const resuelta = await this.prisma.amistad.update({
      where: { idAmistad },
      data: { estado: nuevoEstado, fechaResolucion: new Date() },
    });

    if (accion === 'aceptar') {
      const actor = await this.prisma.usuario.findUniqueOrThrow({
        where: { idUsuario },
        select: { nombre: true, apellido: true },
      });
      await this.notifications.notifyFromTemplate([amistad.idUsuarioSolicitante], 'AMISTAD_ACEPTADA', {
        userName: `${actor.nombre} ${actor.apellido}`,
        idAmistad: resuelta.idAmistad,
      });
    }

    return resuelta;
  }

  async eliminarAmistad(idUsuario: number, idAmistad: number) {
    const amistad = await this.prisma.amistad.findUnique({ where: { idAmistad } });
    if (!amistad) {
      throw new NotFoundException(`Amistad con id ${idAmistad} no encontrada`);
    }
    if (amistad.idUsuarioSolicitante !== idUsuario && amistad.idUsuarioReceptor !== idUsuario) {
      throw new ForbiddenException('No tienes permiso para eliminar esta amistad');
    }
    await this.prisma.amistad.delete({ where: { idAmistad } });
    return { eliminado: true };
  }

  async listarAmigos(idUsuario: number) {
    const amistades = await this.prisma.amistad.findMany({
      where: {
        estado: EstadoAmistad.ACEPTADA,
        OR: [{ idUsuarioSolicitante: idUsuario }, { idUsuarioReceptor: idUsuario }],
      },
      include: {
        solicitante: { select: USUARIO_RESUMEN_SELECT },
        receptor: { select: USUARIO_RESUMEN_SELECT },
      },
    });

    return amistades.map((a) => (a.idUsuarioSolicitante === idUsuario ? a.receptor : a.solicitante));
  }

  async listarSolicitudesPendientes(idUsuario: number) {
    return this.prisma.amistad.findMany({
      where: { idUsuarioReceptor: idUsuario, estado: EstadoAmistad.PENDIENTE },
      include: { solicitante: { select: USUARIO_RESUMEN_SELECT } },
      orderBy: { fechaSolicitud: 'desc' },
    });
  }

  async getAmigoIds(idUsuario: number): Promise<number[]> {
    const amistades = await this.prisma.amistad.findMany({
      where: {
        estado: EstadoAmistad.ACEPTADA,
        OR: [{ idUsuarioSolicitante: idUsuario }, { idUsuarioReceptor: idUsuario }],
      },
      select: { idUsuarioSolicitante: true, idUsuarioReceptor: true },
    });
    return amistades.map((a) => (a.idUsuarioSolicitante === idUsuario ? a.idUsuarioReceptor : a.idUsuarioSolicitante));
  }

  async seguirUsuario(idUsuario: number, idSeguido: number) {
    if (idUsuario === idSeguido) {
      throw new BadRequestException('No puedes seguirte a ti mismo');
    }

    const existente = await this.prisma.seguimiento.findUnique({
      where: { idSeguidor_idSeguido: { idSeguidor: idUsuario, idSeguido } },
    });
    if (existente) {
      throw new ConflictException('Ya sigues a este usuario');
    }

    const seguimiento = await this.prisma.seguimiento.create({
      data: { idSeguidor: idUsuario, idSeguido },
    });
    const actor = await this.prisma.usuario.findUniqueOrThrow({
      where: { idUsuario },
      select: { nombre: true, apellido: true },
    });
    await this.notifications.notifyFromTemplate([idSeguido], 'NUEVO_SEGUIDOR', {
      userName: `${actor.nombre} ${actor.apellido}`,
    });
    return seguimiento;
  }

  async dejarDeSeguir(idUsuario: number, idSeguido: number) {
    const existente = await this.prisma.seguimiento.findUnique({
      where: { idSeguidor_idSeguido: { idSeguidor: idUsuario, idSeguido } },
    });
    if (!existente) {
      throw new NotFoundException('No sigues a este usuario');
    }
    await this.prisma.seguimiento.delete({ where: { idSeguimiento: existente.idSeguimiento } });
    return { eliminado: true };
  }

  async listarSiguiendo(idUsuario: number) {
    const seguimientos = await this.prisma.seguimiento.findMany({
      where: { idSeguidor: idUsuario },
      include: { seguido: { select: USUARIO_RESUMEN_SELECT } },
      orderBy: { fechaCreacion: 'desc' },
    });
    return seguimientos.map((s) => s.seguido);
  }

  async listarSeguidores(idUsuario: number) {
    const seguimientos = await this.prisma.seguimiento.findMany({
      where: { idSeguido: idUsuario },
      include: { seguidor: { select: USUARIO_RESUMEN_SELECT } },
      orderBy: { fechaCreacion: 'desc' },
    });
    return seguimientos.map((s) => s.seguidor);
  }

  async getSeguidoIds(idUsuario: number): Promise<number[]> {
    const seguimientos = await this.prisma.seguimiento.findMany({
      where: { idSeguidor: idUsuario },
      select: { idSeguido: true },
    });
    return seguimientos.map((s) => s.idSeguido);
  }

  async buscarUsuarios(idUsuario: number, q: string) {
    const query = q.trim();
    if (query.length < 2) {
      throw new BadRequestException('La búsqueda requiere al menos 2 caracteres');
    }

    const usuarios = await this.prisma.usuario.findMany({
      where: {
        idUsuario: { not: idUsuario },
        OR: [
          { nombre: { contains: query, mode: 'insensitive' } },
          { apellido: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: USUARIO_RESUMEN_SELECT,
      take: 20,
    });

    if (usuarios.length === 0) {
      return [];
    }

    const otrosIds = usuarios.map((u) => u.idUsuario);
    const [amistades, seguidos] = await Promise.all([
      this.prisma.amistad.findMany({
        where: {
          OR: [
            { idUsuarioSolicitante: idUsuario, idUsuarioReceptor: { in: otrosIds } },
            { idUsuarioReceptor: idUsuario, idUsuarioSolicitante: { in: otrosIds } },
          ],
        },
        select: { idUsuarioSolicitante: true, idUsuarioReceptor: true, estado: true },
      }),
      this.prisma.seguimiento.findMany({
        where: { idSeguidor: idUsuario, idSeguido: { in: otrosIds } },
        select: { idSeguido: true },
      }),
    ]);

    const seguidosSet = new Set(seguidos.map((s) => s.idSeguido));

    return usuarios.map((usuario) => {
      const relacion = amistades.find(
        (a) => a.idUsuarioSolicitante === usuario.idUsuario || a.idUsuarioReceptor === usuario.idUsuario,
      );

      let esAmigo = false;
      let solicitudPendiente: { direccion: 'enviada' | 'recibida' } | null = null;

      if (relacion) {
        if (relacion.estado === EstadoAmistad.ACEPTADA) {
          esAmigo = true;
        } else if (relacion.estado === EstadoAmistad.PENDIENTE) {
          solicitudPendiente = {
            direccion: relacion.idUsuarioSolicitante === idUsuario ? 'enviada' : 'recibida',
          };
        }
      }

      return {
        ...usuario,
        esAmigo,
        solicitudPendiente,
        loSigo: seguidosSet.has(usuario.idUsuario),
      };
    });
  }
}
