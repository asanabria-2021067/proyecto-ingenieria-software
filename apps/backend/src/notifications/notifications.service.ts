import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type TxClient = Prisma.TransactionClient;

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  findAll(userId?: number) {
    return this.prisma.notificacion.findMany({
      where: userId ? { idUsuario: userId } : undefined,
      orderBy: { creadaEn: 'desc' },
      take: 100,
    });
  }

  async isAdmin(userId: number, tx?: TxClient): Promise<boolean> {
    const db = tx ?? this.prisma;
    const rol = await db.usuarioRolAcceso.findFirst({
      where: { idUsuario: userId, rolAcceso: { nombrePerfil: 'administrador' } },
      select: { idUsuarioRolAcceso: true },
    });
    return !!rol;
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
    await db.notificacion.createMany({
      data: userIds.map((idUsuario) => ({
        idUsuario,
        tipoNotificacion: payload.tipoNotificacion,
        tituloNotificacion: payload.tituloNotificacion,
        mensajeNotificacion: payload.mensajeNotificacion,
        datosJson: payload.datosJson,
      })),
      skipDuplicates: false,
    });
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
