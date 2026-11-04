import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EstadoSolicitudDesactivacion, EstadoUsuario, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SecurityEventsService } from '../security-events/security-events.service';
import { TipoEventoSeguridad } from '../security-events/tipos-evento-seguridad';
import type { SecurityRequestContext } from '../security-events/request-context';
import { ACCOUNT_ACCESS_REVOKED, type AccountAccessRevokedEvent } from '../ws-auth/account-access.events';

const SOLO_ADMIN = 'Acceso restringido a administradores';
const YA_RESUELTA = 'La solicitud ya fue resuelta';

/**
 * MEJ-85: el usuario solicita; solo un administrador resuelve. Aprobar marca la cuenta
 * INACTIVA y cierra sus sesiones: horas, participaciones y demás historial no se tocan.
 */
@Injectable()
export class DesactivacionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly securityEvents: SecurityEventsService,
    private readonly events: EventEmitter2,
  ) {}

  private async esAdmin(idUsuario: number): Promise<boolean> {
    const rol = await this.prisma.usuarioRolAcceso.findFirst({
      where: { idUsuario, rolAcceso: { nombrePerfil: 'administrador' } },
      select: { idUsuarioRolAcceso: true },
    });
    return Boolean(rol);
  }

  private async requireAdmin(idUsuario: number) {
    if (!(await this.esAdmin(idUsuario))) throw new ForbiddenException(SOLO_ADMIN);
  }

  async solicitar(idUsuario: number, motivo?: string) {
    // El estado de un administrador no se cambia por esta vía (igual que en admin).
    if (await this.esAdmin(idUsuario)) {
      throw new ForbiddenException('Los administradores no pueden solicitar desactivar su cuenta');
    }
    const usuario = await this.prisma.usuario.findUnique({
      where: { idUsuario },
      select: { nombre: true, apellido: true, estado: true },
    });
    if (!usuario || usuario.estado !== EstadoUsuario.ACTIVO) throw new ForbiddenException('La cuenta no está activa');

    let solicitud;
    try {
      solicitud = await this.prisma.solicitudDesactivacion.create({
        data: { idUsuario, motivo: motivo?.trim() || null },
      });
    } catch (e) {
      // Índice parcial: un solo pendiente por usuario, también ante dos peticiones simultáneas.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya tienes una solicitud de desactivación pendiente');
      }
      throw e;
    }
    await this.notifications.notifyAdminsFromTemplate('SOLICITUD_DESACTIVACION', {
      userName: `${usuario.nombre} ${usuario.apellido}`,
      solicitudId: solicitud.idSolicitud,
      userId: idUsuario,
    });
    return this.proyectar(solicitud);
  }

  /** Última solicitud del propio usuario; `solicitud` es null si nunca pidió (un null suelto saldría como cuerpo vacío). */
  async miSolicitud(idUsuario: number) {
    const solicitud = await this.prisma.solicitudDesactivacion.findFirst({
      where: { idUsuario },
      orderBy: { creadaEn: 'desc' },
    });
    return { solicitud: solicitud ? this.proyectar(solicitud) : null };
  }

  async listarPendientes(idAdmin: number) {
    await this.requireAdmin(idAdmin);
    const filas = await this.prisma.solicitudDesactivacion.findMany({
      where: { estado: EstadoSolicitudDesactivacion.PENDIENTE },
      orderBy: { creadaEn: 'asc' },
      select: {
        idSolicitud: true,
        motivo: true,
        creadaEn: true,
        usuario: { select: { idUsuario: true, nombre: true, apellido: true, correo: true } },
      },
    });
    return filas.map((f) => ({
      idSolicitud: f.idSolicitud,
      motivo: f.motivo,
      creadaEn: f.creadaEn.toISOString(),
      usuario: f.usuario,
    }));
  }

  async aprobar(idAdmin: number, idSolicitud: number, comentario?: string, origen?: SecurityRequestContext) {
    await this.requireAdmin(idAdmin);
    const solicitud = await this.pendiente(idSolicitud);
    if (await this.esAdmin(solicitud.idUsuario)) {
      throw new ConflictException('La cuenta pertenece a un administrador y no se puede desactivar por esta vía');
    }
    const ahora = new Date();
    const resuelta = await this.prisma.$transaction(async (tx) => {
      // UPDATE condicional: con dos resoluciones simultáneas solo una ve la fila PENDIENTE.
      const marcada = await tx.solicitudDesactivacion.updateMany({
        where: { idSolicitud, estado: EstadoSolicitudDesactivacion.PENDIENTE },
        data: {
          estado: EstadoSolicitudDesactivacion.APROBADA,
          resueltaEn: ahora,
          resueltaPor: idAdmin,
          comentarioResolucion: comentario?.trim() || null,
        },
      });
      if (marcada.count !== 1) throw new ConflictException(YA_RESUELTA);
      await tx.usuario.update({
        where: { idUsuario: solicitud.idUsuario },
        data: { estado: EstadoUsuario.INACTIVO, sesionVersion: { increment: 1 } },
      });
      await tx.tokenRefresco.updateMany({
        where: { idUsuario: solicitud.idUsuario, revocadoEn: null },
        data: { revocadoEn: ahora },
      });
      return tx.solicitudDesactivacion.findUniqueOrThrow({ where: { idSolicitud } });
    });
    await this.securityEvents.record({
      tipo: TipoEventoSeguridad.USER_STATUS_CHANGED,
      origen,
      idActor: idAdmin,
      idUsuarioAfectado: solicitud.idUsuario,
      detalle: { estadoAnterior: EstadoUsuario.ACTIVO, estadoNuevo: EstadoUsuario.INACTIVO },
    });
    this.events.emit(ACCOUNT_ACCESS_REVOKED, { idUsuario: solicitud.idUsuario } satisfies AccountAccessRevokedEvent);
    await this.notifications.notifyFromTemplate([solicitud.idUsuario], 'DESACTIVACION_RESUELTA', {
      aprobada: true,
      comentario: resuelta.comentarioResolucion,
    });
    return this.proyectar(resuelta);
  }

  async rechazar(idAdmin: number, idSolicitud: number, comentario?: string) {
    await this.requireAdmin(idAdmin);
    const solicitud = await this.pendiente(idSolicitud);
    const marcada = await this.prisma.solicitudDesactivacion.updateMany({
      where: { idSolicitud, estado: EstadoSolicitudDesactivacion.PENDIENTE },
      data: {
        estado: EstadoSolicitudDesactivacion.RECHAZADA,
        resueltaEn: new Date(),
        resueltaPor: idAdmin,
        comentarioResolucion: comentario?.trim() || null,
      },
    });
    if (marcada.count !== 1) throw new ConflictException(YA_RESUELTA);
    await this.notifications.notifyFromTemplate([solicitud.idUsuario], 'DESACTIVACION_RESUELTA', {
      aprobada: false,
      comentario: comentario?.trim() || null,
    });
    return this.proyectar(await this.prisma.solicitudDesactivacion.findUniqueOrThrow({ where: { idSolicitud } }));
  }

  private async pendiente(idSolicitud: number) {
    const solicitud = await this.prisma.solicitudDesactivacion.findUnique({ where: { idSolicitud } });
    if (!solicitud) throw new NotFoundException('Solicitud no encontrada');
    if (solicitud.estado !== EstadoSolicitudDesactivacion.PENDIENTE) throw new ConflictException(YA_RESUELTA);
    return solicitud;
  }

  private proyectar(s: {
    idSolicitud: number;
    estado: EstadoSolicitudDesactivacion;
    motivo: string | null;
    creadaEn: Date;
    resueltaEn: Date | null;
    comentarioResolucion: string | null;
  }) {
    return {
      idSolicitud: s.idSolicitud,
      estado: s.estado,
      motivo: s.motivo,
      creadaEn: s.creadaEn.toISOString(),
      resueltaEn: s.resueltaEn?.toISOString() ?? null,
      comentarioResolucion: s.comentarioResolucion,
    };
  }
}
