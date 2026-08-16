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

/**
 * Forma real ya usada (sin nombre propio) por `notifyUsers`/`notifyAdmins`/
 * `notifyProjectActiveParticipants`; nombrada aquí únicamente para tipar
 * `notifyRoleMembers` sin repetirla ni cambiar la firma de esos métodos.
 */
interface NotificationInput {
  tipoNotificacion: Prisma.NotificacionCreateManyInput['tipoNotificacion'];
  tituloNotificacion: string;
  mensajeNotificacion?: string;
  datosJson?: Prisma.InputJsonValue;
}

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

  /**
   * A4: emite el evento realtime SPRINT_FINALIZATION_STARTED a los
   * participantes activos del proyecto (mismo criterio de audiencia que
   * notifyProjectActiveParticipants, sin tocar ese método: ACTIVO,
   * excluyendo al actor, deduplicado por idUsuario) — pero sin persistir
   * ninguna fila de Notificacion, porque es una señal realtime pura para
   * refrescar UI (SprintsService la llama junto a
   * notifyProjectActiveParticipants, que sí crea la notificación de
   * bandeja), no un mensaje de bandeja. Por eso no reutiliza notifyUsers
   * (que siempre persiste) y en su lugar llama directamente al gateway.
   */
  async notifySprintFinalizationStarted(
    idProyecto: number,
    autorId: number,
    payload: { projectId: number; sprintId: number },
    tx?: TxClient,
  ): Promise<void> {
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

    if (this.gateway?.server) {
      await this.gateway.notifySprintFinalizationStarted(
        participaciones.map((p) => p.idUsuario),
        payload,
      );
    }
  }

  /**
   * Tarea 33: destinatarios = miembros con participación ACTIVA en un rol
   * concreto de un proyecto concreto (nunca miembros de otro rol o de otro
   * proyecto), excluyendo al actor y deduplicados por `idUsuario`. A
   * diferencia de `notifyProjectActiveParticipants` (participantes de
   * cualquier rol del proyecto), este helper contextualiza también por
   * `roleId` — semánticas distintas, sin reescribir ese método.
   *
   * `RolProyecto` no tiene soft delete en el schema actual, así que no se
   * filtra por ese lado; `Proyecto.eliminadoEn` sí existe, por lo que se
   * excluyen roles de un proyecto ya eliminado.
   *
   * La exclusión del actor y la deduplicación ocurren en memoria (no vía
   * `distinct`/`idUsuario: { not }` de Prisma) para no depender de que el
   * resultado de `findMany` ya venga sin duplicados. Con cero destinatarios
   * tras filtrar, resuelve sin llamar a `notifyUsers` (cero filas, cero
   * emisiones). Delega una única vez en `notifyUsers`: no duplica
   * persistencia, emisión por gateway ni manejo de errores.
   */
  async notifyRoleMembers(
    projectId: number,
    roleId: number,
    actorUserId: number,
    input: NotificationInput,
    tx?: TxClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    const participaciones = await db.participacionProyecto.findMany({
      where: {
        estadoParticipacion: 'ACTIVO',
        rolProyecto: {
          idRolProyecto: roleId,
          idProyecto: projectId,
          proyecto: { eliminadoEn: null },
        },
      },
      select: { idUsuario: true },
    });

    const recipientIds = [
      ...new Set(
        participaciones
          .map((participacion) => participacion.idUsuario)
          .filter((idUsuario) => idUsuario !== actorUserId),
      ),
    ];

    if (recipientIds.length === 0) {
      return;
    }

    await this.notifyUsers(recipientIds, input, tx);
  }
}
