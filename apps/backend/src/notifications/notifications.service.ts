import { Injectable, ForbiddenException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';
import {
  NOTIFICATION_TEMPLATES,
  NotificationTemplateKey,
  NotificationTemplateData,
} from './templates/notification.templates';

type TxClient = Prisma.TransactionClient;

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => NotificationsGateway))
    private gateway: NotificationsGateway,
  ) {}

  findAll(userId?: number) {
    return this.prisma.notificacion.findMany({
      where: userId ? { idUsuario: userId } : undefined,
      orderBy: { creadaEn: 'desc' },
      take: 100,
    });
  }

  async findUnreadForUser(userId: number) {
    return this.prisma.notificacion.findMany({
      where: { idUsuario: userId, leidaEn: null },
      orderBy: { creadaEn: 'desc' },
    });
  }

  async getUnreadCount(userId: number): Promise<{ total: number }> {
    const total = await this.prisma.notificacion.count({
      where: { idUsuario: userId, leidaEn: null },
    });
    return { total };
  }

  async markAsRead(id: number, userId: number) {
    const notificacion = await this.prisma.notificacion.findUnique({
      where: { idNotificacion: id },
    });

    if (!notificacion) {
      throw new NotFoundException(`Notificación con id ${id} no encontrada`);
    }

    if (notificacion.idUsuario !== userId) {
      throw new ForbiddenException(
        'No tienes permiso para acceder a esta notificación',
      );
    }

    if (notificacion.leidaEn !== null) {
      return notificacion;
    }

    return this.prisma.notificacion.update({
      where: { idNotificacion: id },
      data: { leidaEn: new Date() },
    });
  }

  async markAllAsRead(userId: number): Promise<{ actualizadas: number }> {
    const result = await this.prisma.notificacion.updateMany({
      where: { idUsuario: userId, leidaEn: null },
      data: { leidaEn: new Date() },
    });
    return { actualizadas: result.count };
  }

  async isAdmin(userId: number, tx?: TxClient): Promise<boolean> {
    const db = tx ?? this.prisma;
    const rol = await db.usuarioRolAcceso.findFirst({
      where: { idUsuario: userId, rolAcceso: { nombrePerfil: 'administrador' } },
      select: { idUsuarioRolAcceso: true },
    });
    return !!rol;
  }

  async notifyFromTemplate<K extends NotificationTemplateKey>(
    userIds: number[],
    templateKey: K,
    data: NotificationTemplateData[K],
    tx?: TxClient,
  ) {
    const template = NOTIFICATION_TEMPLATES[templateKey];
    const title = typeof template.title === 'function' ? template.title(data as any) : template.title;
    const message = template.message(data as any);
    const datosJson = JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue;

    await this.notifyUsers(
      userIds,
      {
        tipoNotificacion: templateKey,
        tituloNotificacion: title,
        mensajeNotificacion: message,
        datosJson,
      },
      tx,
    );
  }

  async notifyAdminsFromTemplate<K extends NotificationTemplateKey>(
    templateKey: K,
    data: NotificationTemplateData[K],
    tx?: TxClient,
  ) {
    const db = tx ?? this.prisma;
    const admins = await db.usuarioRolAcceso.findMany({
      where: { rolAcceso: { nombrePerfil: 'administrador' } },
      distinct: ['idUsuario'],
      select: { idUsuario: true },
    });

    await this.notifyFromTemplate(
      admins.map((a) => a.idUsuario),
      templateKey,
      data,
      tx,
    );
  }

  async notifyUsers(
    userIds: number[],
    payload: {
      tipoNotificacion: Prisma.NotificacionCreateManyInput['tipoNotificacion'];
      tituloNotificacion: string;
      mensajeNotificacion?: string;
      datosJson?: Prisma.InputJsonValue;
    },
    tx?: TxClient,
  ) {
    if (userIds.length === 0) return;
    const db = tx ?? this.prisma;

    const notifications = await db.notificacion.createMany({
      data: userIds.map((idUsuario) => ({
        idUsuario,
        tipoNotificacion: payload.tipoNotificacion,
        tituloNotificacion: payload.tituloNotificacion,
        mensajeNotificacion: payload.mensajeNotificacion,
        datosJson: payload.datosJson,
      })),
      skipDuplicates: false,
    });

    if (this.gateway?.server) {
      await this.gateway.notifyUsers(userIds, payload);
    }

    return notifications;
  }

  async notifyAdmins(
    payload: {
      tipoNotificacion: Prisma.NotificacionCreateManyInput['tipoNotificacion'];
      tituloNotificacion: string;
      mensajeNotificacion?: string;
      datosJson?: Prisma.InputJsonValue;
    },
    tx?: TxClient,
  ) {
    const db = tx ?? this.prisma;
    const admins = await db.usuarioRolAcceso.findMany({
      where: { rolAcceso: { nombrePerfil: 'administrador' } },
      distinct: ['idUsuario'],
      select: { idUsuario: true },
    });
    await this.notifyUsers(
      admins.map((a) => a.idUsuario),
      payload,
      tx,
    );
  }

  async notifyProjectActiveParticipants(
    idProyecto: number,
    autorId: number,
    payload: {
      tipoNotificacion: Prisma.NotificacionCreateManyInput['tipoNotificacion'];
      tituloNotificacion: string;
      mensajeNotificacion?: string;
      datosJson?: Prisma.InputJsonValue;
    },
    tx?: TxClient,
  ) {
    const db = tx ?? this.prisma;
    const participaciones = await db.participacionProyecto.findMany({
      where: {
        estadoParticipacion: 'ACTIVO',
        idUsuario: { not: autorId },
        rolProyecto: { idProyecto },
      },
      distinct: ['idUsuario'],
      select: { idUsuario: true },
    });
    await this.notifyUsers(
      participaciones.map((p) => p.idUsuario),
      payload,
      tx,
    );
  }
}
