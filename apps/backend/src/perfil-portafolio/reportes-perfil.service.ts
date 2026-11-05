import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EstadoReportePerfil } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CrearReportePerfilDto } from './dto/restricciones-reportes.dto';

export const MENSAJE_REPORTE_PERFIL = 'Tu reporte fue enviado a administración';

/** MEJ-154: reportar un perfil o un mensaje; llega a la bandeja del administrador. */
@Injectable()
export class ReportesPerfilService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private async requireAdmin(userId: number) {
    const admin = await this.prisma.usuarioRolAcceso.findFirst({
      where: { idUsuario: userId, rolAcceso: { nombrePerfil: 'administrador' } },
      select: { idUsuario: true },
    });
    if (!admin) throw new ForbiddenException('Acceso restringido a administradores');
  }

  async crear(idReportante: number, dto: CrearReportePerfilDto) {
    if (dto.idReportado === idReportante) throw new BadRequestException('No puedes reportarte a ti mismo');
    const reportado = await this.prisma.usuario.findFirst({
      where: { idUsuario: dto.idReportado, estado: 'ACTIVO' },
      select: { idUsuario: true },
    });
    if (!reportado) throw new NotFoundException('Usuario no encontrado');

    let textoMensaje: string | null = null;
    if (dto.idMensaje !== undefined) {
      // Solo se reporta lo que quien reporta puede ver: participa en la conversacion y el autor es la persona reportada.
      const mensaje = await this.prisma.mensajeChat.findFirst({
        where: {
          idMensaje: dto.idMensaje,
          idRemitente: dto.idReportado,
          eliminadoEn: null,
          conversacion: { participantes: { some: { idUsuario: idReportante } } },
        },
        select: { contenido: true },
      });
      if (!mensaje) throw new NotFoundException('Mensaje no encontrado');
      textoMensaje = mensaje.contenido.slice(0, 500);
    }

    const repetido = await this.prisma.reportePerfil.findFirst({
      where: {
        idReportante,
        idReportado: dto.idReportado,
        idMensaje: dto.idMensaje ?? null,
        estado: EstadoReportePerfil.PENDIENTE,
      },
      select: { idReporte: true },
    });
    if (repetido) throw new ConflictException('Ya reportaste esto y está pendiente de revisión');

    const reporte = await this.prisma.reportePerfil.create({
      data: {
        idReportante,
        idReportado: dto.idReportado,
        idMensaje: dto.idMensaje ?? null,
        textoMensaje,
        motivo: dto.motivo,
        detalle: dto.detalle?.trim() || null,
      },
      select: { idReporte: true },
    });
    await this.notifications.notifyAdmins({
      tipoNotificacion: 'SOLICITUD_CONTACTO',
      tituloNotificacion: dto.idMensaje !== undefined ? 'Nuevo reporte de un mensaje' : 'Nuevo reporte de un perfil',
      mensajeNotificacion: 'Hay un reporte pendiente en la bandeja de reportes de perfil.',
      datosJson: { idReportePerfil: reporte.idReporte },
    });
    return { mensaje: MENSAJE_REPORTE_PERFIL };
  }

  async listar(adminId: number, estado: EstadoReportePerfil = EstadoReportePerfil.PENDIENTE) {
    await this.requireAdmin(adminId);
    return this.prisma.reportePerfil.findMany({
      where: { estado },
      orderBy: { creadoEn: 'desc' },
      take: 100,
      select: {
        idReporte: true,
        motivo: true,
        detalle: true,
        idMensaje: true,
        textoMensaje: true,
        estado: true,
        nota: true,
        creadoEn: true,
        resueltoEn: true,
        reportante: { select: { idUsuario: true, nombre: true, apellido: true } },
        reportado: { select: { idUsuario: true, nombre: true, apellido: true } },
      },
    });
  }

  async resolver(adminId: number, idReporte: number, accion: 'descartar' | 'actuar', nota?: string) {
    await this.requireAdmin(adminId);
    const estado = accion === 'descartar' ? EstadoReportePerfil.DESCARTADO : EstadoReportePerfil.ATENDIDO;
    const { count } = await this.prisma.reportePerfil.updateMany({
      where: { idReporte, estado: EstadoReportePerfil.PENDIENTE },
      data: { estado, nota: nota?.trim() || null, resueltoEn: new Date(), resueltoPor: adminId },
    });
    if (count === 0) {
      const existe = await this.prisma.reportePerfil.findUnique({ where: { idReporte }, select: { idReporte: true } });
      if (!existe) throw new NotFoundException('Reporte no encontrado');
      throw new ConflictException('El reporte ya fue resuelto');
    }
    return { idReporte, estado };
  }
}
