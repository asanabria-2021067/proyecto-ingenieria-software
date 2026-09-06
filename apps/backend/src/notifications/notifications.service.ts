import { Injectable, ForbiddenException, Logger, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway, SPRINT_HOURS_ADJUSTED } from './notifications.gateway';
import {
  NOTIFICATION_TEMPLATES,
  NotificationTemplateKey,
  NotificationTemplateData,
} from './templates/notification.templates';

type TxClient = Prisma.TransactionClient;

/**
 * Sprint 7 (06 v2 §16/§40/§44/§45): efecto diferido al post-commit. Tipo
 * estructural compatible con `EffectBuffer` del runner de proyecto sin
 * importar el módulo de política (Notifications no depende de Policy).
 */
export interface PostCommitEffect {
  key?: string;
  publish: () => void | Promise<void>;
}

export interface PostCommitEffectSink {
  add(effect: PostCommitEffect): void;
}

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
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => NotificationsGateway))
    private gateway: NotificationsGateway,
  ) {}

  // ---------------------------------------------------------------------
  // Sprint 7 — persistencia dentro de la transacción de dominio y publicación
  // por socket SOLO después del commit (06 v2 §16/§40/§44/§45). Los métodos
  // legacy (`notifyUsers`, `notifyFromTemplate`, …) se conservan intactos
  // para sus consumidores actuales; ninguno de los nuevos emite dentro de la
  // transacción ni realiza I/O externo bajo el lock.
  // ---------------------------------------------------------------------

  /**
   * Persiste las filas de Notificacion con el `tx` del caller y registra,
   * si se recibe un sink, un efecto post-commit por destinatario (clave
   * `notification:<usuario>:<tipo>`, deduplicada por el buffer). Con lista
   * vacía no escribe ni registra nada.
   */
  async persistUsersTx(
    tx: TxClient,
    userIds: number[],
    payload: NotificationInput,
    effects?: PostCommitEffectSink,
  ): Promise<{ count: number }> {
    const recipients = [...new Set(userIds)];
    if (recipients.length === 0) {
      return { count: 0 };
    }

    const created = await tx.notificacion.createMany({
      data: recipients.map((idUsuario) => ({
        idUsuario,
        tipoNotificacion: payload.tipoNotificacion,
        tituloNotificacion: payload.tituloNotificacion,
        mensajeNotificacion: payload.mensajeNotificacion,
        datosJson: payload.datosJson,
      })),
      skipDuplicates: false,
    });

    if (effects) {
      for (const idUsuario of recipients) {
        effects.add({
          key: `notification:${idUsuario}:${payload.tipoNotificacion}`,
          publish: () => this.emitNotification([idUsuario], payload),
        });
      }
    }

    return { count: created.count };
  }

  /** Igual que `persistUsersTx`, construyendo título/mensaje desde la plantilla catalogada. */
  async persistTemplateTx<K extends NotificationTemplateKey>(
    tx: TxClient,
    userIds: number[],
    templateKey: K,
    data: NotificationTemplateData[K],
    effects?: PostCommitEffectSink,
  ): Promise<{ count: number }> {
    return this.persistUsersTx(tx, userIds, this.payloadFromTemplate(templateKey, data), effects);
  }

  /**
   * Destinatarios = administradores, listados con EL MISMO `tx` (nunca con
   * el cliente raíz) y persistidos en la misma transacción.
   */
  async persistAdminsTx<K extends NotificationTemplateKey>(
    tx: TxClient,
    templateKey: K,
    data: NotificationTemplateData[K],
    effects?: PostCommitEffectSink,
  ): Promise<{ count: number }> {
    const admins = await tx.usuarioRolAcceso.findMany({
      where: { rolAcceso: { nombrePerfil: 'administrador' } },
      distinct: ['idUsuario'],
      select: { idUsuario: true },
    });
    return this.persistTemplateTx(
      tx,
      admins.map((admin) => admin.idUsuario),
      templateKey,
      data,
      effects,
    );
  }

  /**
   * Publica los efectos entregados por el runner una vez resuelta la
   * transacción y fuera del lock: deduplica por clave (usuario/evento) y
   * emite en orden. Un fallo de socket se registra y no revierte nada: la
   * base ya es correcta y el cliente recupera la bandeja persistida.
   */
  async publishEffects(effects: PostCommitEffect[]): Promise<void> {
    const seen = new Set<string>();
    for (const effect of effects) {
      if (effect.key !== undefined) {
        if (seen.has(effect.key)) {
          continue;
        }
        seen.add(effect.key);
      }
      try {
        await effect.publish();
      } catch (error) {
        this.logger.warn(
          `Fallo al publicar un efecto post-commit${effect.key ? ` (${effect.key})` : ''}: ${
            (error as Error)?.message ?? error
          }`,
        );
      }
    }
  }

  private payloadFromTemplate<K extends NotificationTemplateKey>(
    templateKey: K,
    data: NotificationTemplateData[K],
  ): NotificationInput {
    const template = NOTIFICATION_TEMPLATES[templateKey];
    const title =
      typeof template.title === 'function' ? template.title(data as unknown as never) : template.title;
    const message = template.message(data as unknown as never);
    return {
      tipoNotificacion: templateKey,
      tituloNotificacion: title,
      mensajeNotificacion: message,
      datosJson: JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue,
    };
  }

  private async emitNotification(userIds: number[], payload: NotificationInput): Promise<void> {
    if (this.gateway?.server) {
      await this.gateway.notifyUsers(userIds, payload);
    }
  }

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
    // K liga templateKey con NotificationTemplateData[K] en la firma publica,
    // pero NOTIFICATION_TEMPLATES no es un objeto indexado genericamente, asi
    // que TS no puede correlacionar la rama de `template` con `data` aqui
    // dentro. `never` es asignable a cualquier parametro sin usar `any`.
    const title =
      typeof template.title === 'function' ? template.title(data as unknown as never) : template.title;
    const message = template.message(data as unknown as never);
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
   * A9.1: emite el evento realtime SPRINT_CLOSED a los participantes
   * activos del proyecto — mismo criterio de audiencia exacto que
   * `notifySprintFinalizationStarted` (ACTIVO, excluyendo al actor,
   * deduplicado por idUsuario), mismo mecanismo (sin persistir
   * `Notificacion`, señal realtime pura vía gateway). `SprintsService`
   * la invoca DESPUÉS de que la transacción de cierre haya hecho commit
   * exitosamente — nunca dentro de la transacción — para que un cliente
   * jamás reciba la señal de un cierre que terminó en rollback.
   */
  async notifySprintClosed(
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
      await this.gateway.notifySprintClosed(
        participaciones.map((p) => p.idUsuario),
        payload,
      );
    }
  }

  /**
   * HU-142 (T-171): mismo criterio de audiencia y mecanismo exacto que
   * notifySprintClosed (participantes ACTIVO del proyecto, excluyendo al
   * actor, deduplicados por idUsuario, señal realtime pura sin persistir
   * Notificacion) — reutiliza el helper ya introducido por A4/A9.1 para
   * eventos de Sprint, aplicado ahora a horas registradas por tarea.
   */
  async notifyTaskHoursLogged(
    idProyecto: number,
    autorId: number,
    payload: { projectId: number; taskId: number; idAsignacion: number },
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
      await this.gateway.notifyTaskHoursLogged(
        participaciones.map((p) => p.idUsuario),
        payload,
      );
    }
  }

  /**
   * C071 (06 v2 §45): efecto realtime del ajuste del líder. Se emite SIEMPRE
   * post-commit desde el buffer del runner — nunca dentro de la transacción —
   * y no persiste ninguna fila de notificación: §44 no cataloga notificación
   * para el ajuste, solo el evento en vivo para quien está mirando el cierre.
   */
  async notifySprintHoursAdjusted(
    idProyecto: number,
    actorId: number,
    payload: { projectId: number; sprintId: number; idAsignacion: number },
    tx?: TxClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    const participaciones = await db.participacionProyecto.findMany({
      where: {
        estadoParticipacion: 'ACTIVO',
        idUsuario: { not: actorId },
        rolProyecto: { idProyecto },
      },
      distinct: ['idUsuario'],
      select: { idUsuario: true },
    });

    if (this.gateway?.server) {
      await this.gateway.emitToUsers(
        SPRINT_HOURS_ADJUSTED,
        participaciones.map((fila) => fila.idUsuario),
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
