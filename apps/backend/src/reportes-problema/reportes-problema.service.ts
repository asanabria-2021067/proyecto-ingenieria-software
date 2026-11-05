import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EstadoReporteProblema } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReporteProblemaDto } from './dto/create-reporte-problema.dto';

export const MENSAJE_REPORTE_ENVIADO = 'Tu reporte fue enviado a administración';

@Injectable()
export class ReportesProblemaService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  private async requireAdmin(userId: number) {
    const admin = await this.prisma.usuarioRolAcceso.findFirst({
      where: { idUsuario: userId, rolAcceso: { nombrePerfil: 'administrador' } },
    });
    if (!admin) throw new ForbiddenException('Acceso restringido a administradores');
  }

  async crear(userId: number, dto: CreateReporteProblemaDto) {
    const reporte = await this.prisma.reporteProblema.create({
      data: {
        idUsuario: userId,
        ruta: dto.ruta,
        userAgent: dto.userAgent,
        descripcion: dto.descripcion,
        urlCaptura: dto.urlCaptura || null,
      },
      include: { usuario: { select: { nombre: true, apellido: true, correo: true } } },
    });
    // Reutiliza el tipo SOLICITUD_CONTACTO con título propio; el detalle completo está en la vista de reportes.
    await this.notifications.notifyAdmins({
      tipoNotificacion: 'SOLICITUD_CONTACTO',
      tituloNotificacion: 'Nuevo reporte de problema',
      mensajeNotificacion: `${reporte.usuario.nombre} ${reporte.usuario.apellido} (${reporte.usuario.correo}) en ${reporte.ruta}: ${reporte.descripcion}`,
      datosJson: { idReporte: reporte.idReporte, idUsuario: userId, ruta: reporte.ruta },
    });
    return { mensaje: MENSAJE_REPORTE_ENVIADO };
  }

  async listar(adminId: number, estado: EstadoReporteProblema = EstadoReporteProblema.PENDIENTE) {
    await this.requireAdmin(adminId);
    return this.prisma.reporteProblema.findMany({
      where: { estado },
      orderBy: { creadoEn: 'desc' },
      take: 100,
      include: { usuario: { select: { idUsuario: true, nombre: true, apellido: true, correo: true } } },
    });
  }

  async atender(adminId: number, idReporte: number) {
    await this.requireAdmin(adminId);
    const { count } = await this.prisma.reporteProblema.updateMany({
      where: { idReporte, estado: EstadoReporteProblema.PENDIENTE },
      data: { estado: EstadoReporteProblema.ATENDIDO, atendidoEn: new Date(), atendidoPor: adminId },
    });
    if (count === 0) {
      const existe = await this.prisma.reporteProblema.findUnique({ where: { idReporte }, select: { idReporte: true } });
      if (!existe) throw new NotFoundException('Reporte no encontrado');
      throw new ConflictException('El reporte ya fue atendido');
    }
    return { idReporte, estado: EstadoReporteProblema.ATENDIDO };
  }
}
