import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EstadoProyecto, TipoNotificacion } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateMensajeRevisionDto } from './dto/create-mensaje-revision.dto';

@Injectable()
export class MensajesRevisionService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async findByProyecto(idProyecto: number, userId: number) {
    const proyecto = await this.getProjectAccessContext(idProyecto);
    await this.assertChannelBAccess(proyecto, userId, false);

    return this.prisma.mensajeRevisionProyecto.findMany({
      where: { idProyecto },
      include: {
        remitente: { select: { idUsuario: true, nombre: true, apellido: true } },
      },
      orderBy: { enviadoEn: 'asc' },
    });
  }

  async create(idProyecto: number, userId: number, dto: CreateMensajeRevisionDto) {
    const proyecto = await this.getProjectAccessContext(idProyecto);
    await this.assertChannelBAccess(proyecto, userId, true);

    if (dto.idRevision) {
      const revision = await this.prisma.revisionProyecto.findFirst({
        where: { idRevisionProyecto: dto.idRevision, idProyecto },
        select: { idRevisionProyecto: true },
      });
      if (!revision) {
        throw new BadRequestException('La revisión indicada no pertenece al proyecto');
      }
    }

    const mensaje = await this.prisma.mensajeRevisionProyecto.create({
      data: {
        idProyecto,
        idRemitente: userId,
        idRevision: dto.idRevision,
        contenido: dto.contenido.trim(),
      },
    });

    const admins = await this.prisma.usuarioRolAcceso.findMany({
      where: { rolAcceso: { nombrePerfil: 'administrador' } },
      distinct: ['idUsuario'],
      select: { idUsuario: true },
    });
    const recipients = Array.from(
      new Set([proyecto.creadoPor, ...admins.map((a) => a.idUsuario)]),
    ).filter((id) => id !== userId);

    await this.notifications.notifyUsers(recipients, {
      tipoNotificacion: TipoNotificacion.MENSAJE_REVISION,
      tituloNotificacion: 'Nuevo mensaje de revisión',
      mensajeNotificacion: `Hay un nuevo mensaje en el canal de revisión de "${proyecto.tituloProyecto}".`,
      datosJson: { idProyecto, idMensaje: mensaje.idMensaje },
    });

    return mensaje;
  }

  async markAsRead(idProyecto: number, userId: number) {
    const proyecto = await this.getProjectAccessContext(idProyecto);
    await this.assertChannelBAccess(proyecto, userId, false);

    await this.prisma.mensajeRevisionProyecto.updateMany({
      where: {
        idProyecto,
        idRemitente: { not: userId },
        leidoEn: null,
      },
      data: { leidoEn: new Date() },
    });

    return { ok: true };
  }

  private async getProjectAccessContext(idProyecto: number) {
    const proyecto = await this.prisma.proyecto.findUnique({
      where: { idProyecto },
      select: {
        idProyecto: true,
        creadoPor: true,
        tituloProyecto: true,
        estadoProyecto: true,
      },
    });
    if (!proyecto) throw new NotFoundException('Proyecto no encontrado');
    return proyecto;
  }

  private async assertChannelBAccess(
    proyecto: {
      idProyecto: number;
      creadoPor: number;
      estadoProyecto: EstadoProyecto;
    },
    userId: number,
    forWrite: boolean,
  ) {
    const isAdmin = await this.notifications.isAdmin(userId);
    const isLeader = proyecto.creadoPor === userId;
    if (!isAdmin && !isLeader) {
      throw new ForbiddenException('Solo líder o administradores pueden acceder a este canal');
    }

    if (proyecto.estadoProyecto === EstadoProyecto.BORRADOR) {
      throw new ForbiddenException('El canal de revisión aún no está habilitado');
    }

    if (
      forWrite &&
      (proyecto.estadoProyecto === EstadoProyecto.CERRADO ||
        proyecto.estadoProyecto === EstadoProyecto.CANCELADO)
    ) {
      throw new ForbiddenException('El canal está en modo solo lectura');
    }
  }
}
