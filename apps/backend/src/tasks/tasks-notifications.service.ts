import { Injectable, Logger } from '@nestjs/common';
import { Prisma, TipoNotificacion, EstadoTarea } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { BulkTaskActionDto } from './dto/bulk-task-action.dto';
import type { TareaPublica } from './tasks.mapper';

/**
 * Tarea 34: plan de audiencia calculado a partir del estado comprometido
 * (nunca de datos del body ni de una relectura ambigua). Prioridad fija:
 * un rol asignado a la tarea siempre gana sobre el asignado activo; sin rol
 * y sin asignado activo, no hay audiencia.
 */
export type TaskNotificationAudience =
  | { kind: 'role'; projectId: number; roleId: number }
  | { kind: 'assignee'; userId: number }
  | { kind: 'none' };

export interface TaskNotificationInput {
  tipoNotificacion: TipoNotificacion;
  tituloNotificacion: string;
  mensajeNotificacion: string;
  datosJson: Prisma.InputJsonValue;
}

const ESTADO_TAREA_ETIQUETA: Record<EstadoTarea, string> = {
  POR_HACER: 'Por hacer',
  EN_PROGRESO: 'En progreso',
  EN_REVISION: 'En revisión',
  HECHO: 'Hecho',
};

/**
 * Texto del aviso agrupado de una acción masiva para un destinatario. Con
 * una sola tarea se nombra; con varias, se resume el conteo.
 */
function contenidoAvisoMasivo(
  dto: BulkTaskActionDto,
  tareas: TareaPublica[],
  idDestinatario: number,
): { tipoNotificacion: TipoNotificacion; tituloNotificacion: string; mensajeNotificacion: string } {
  const n = tareas.length;
  const sujeto = n === 1 ? `la tarea "${tareas[0].tituloTarea}"` : `${n} tareas`;

  switch (dto.accion) {
    case 'MOVER': {
      const estado = ESTADO_TAREA_ETIQUETA[dto.estadoTarea!];
      return {
        tipoNotificacion: TipoNotificacion.TAREA_ACTUALIZADA,
        tituloNotificacion: n === 1 ? 'Estado de tarea actualizado' : 'Tareas movidas',
        mensajeNotificacion:
          n === 1 ? `La tarea "${tareas[0].tituloTarea}" cambió de estado a ${estado}.` : `Se movieron ${n} tareas a ${estado}.`,
      };
    }
    case 'ASIGNAR': {
      const asignado = tareas[0].asignacionActiva?.usuario;
      const esElAsignado = asignado?.idUsuario === idDestinatario;
      return {
        tipoNotificacion: TipoNotificacion.TAREA_ASIGNADA,
        tituloNotificacion: n === 1 ? 'Tarea asignada' : 'Tareas asignadas',
        mensajeNotificacion: esElAsignado
          ? `Se te ${n === 1 ? 'asignó' : 'asignaron'} ${sujeto}.`
          : `Se ${n === 1 ? 'asignó' : 'asignaron'} ${sujeto} a ${asignado ? `${asignado.nombre} ${asignado.apellido}` : 'un integrante'}.`,
      };
    }
    case 'DESASIGNAR':
      return {
        tipoNotificacion: TipoNotificacion.TAREA_ACTUALIZADA,
        tituloNotificacion: 'Asignación retirada',
        mensajeNotificacion: `Ya no estás asignado a ${sujeto}.`,
      };
    case 'AGREGAR_ETIQUETAS':
      return {
        tipoNotificacion: TipoNotificacion.TAREA_ACTUALIZADA,
        tituloNotificacion: 'Etiquetas actualizadas',
        mensajeNotificacion: `Se agregaron etiquetas a ${sujeto}.`,
      };
    case 'QUITAR_ETIQUETAS':
      return {
        tipoNotificacion: TipoNotificacion.TAREA_ACTUALIZADA,
        tituloNotificacion: 'Etiquetas actualizadas',
        mensajeNotificacion: `Se quitaron etiquetas de ${sujeto}.`,
      };
  }
}

/**
 * Armado y emisión de las notificaciones de tareas (post-commit). Extraído
 * de TasksService sin cambios de comportamiento: todo fallo se registra con
 * Logger y nunca se relanza porque la mutación ya se comprometió.
 */
@Injectable()
export class TasksNotificationsService {
  // Mismo contexto de log que TasksService (los logs no cambian de origen).
  readonly logger = new Logger('TasksService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Aviso agrupado post-commit: la audiencia de cada tarea es la misma que en
   * la acción individual (miembros activos de su rol; sin rol, su asignado;
   * al desasignar, quien estaba asignado), pero cada persona recibe UNA sola
   * notificación con todas las tareas que le afectan. Excluye al actor. Un
   * fallo se registra y nunca se relanza: la acción ya se comprometió.
   */
  async notificarAccionMasiva(
    projectId: number,
    actorUserId: number,
    dto: BulkTaskActionDto,
    tareas: TareaPublica[],
    asignadosPrevios: Map<number, number>,
  ): Promise<void> {
    if (tareas.length === 0) {
      return;
    }

    try {
      const tareasPorUsuario = new Map<number, TareaPublica[]>();
      const sumar = (idUsuario: number, tarea: TareaPublica) => {
        if (idUsuario === actorUserId) return;
        const lista = tareasPorUsuario.get(idUsuario) ?? [];
        if (!lista.includes(tarea)) lista.push(tarea);
        tareasPorUsuario.set(idUsuario, lista);
      };

      if (dto.accion === 'DESASIGNAR') {
        for (const tarea of tareas) {
          const previo = asignadosPrevios.get(tarea.idTarea);
          if (previo !== undefined) sumar(previo, tarea);
        }
      } else {
        const idsRoles = [
          ...new Set(tareas.map((tarea) => tarea.idRolProyecto).filter((id): id is number => id !== null)),
        ];
        const participaciones =
          idsRoles.length === 0
            ? []
            : await this.prisma.participacionProyecto.findMany({
                where: {
                  estadoParticipacion: 'ACTIVO',
                  rolProyecto: {
                    idRolProyecto: { in: idsRoles },
                    idProyecto: projectId,
                    proyecto: { eliminadoEn: null },
                  },
                },
                select: { idUsuario: true, idRolProyecto: true },
              });

        for (const tarea of tareas) {
          if (tarea.idRolProyecto !== null) {
            for (const participacion of participaciones) {
              if (participacion.idRolProyecto === tarea.idRolProyecto) sumar(participacion.idUsuario, tarea);
            }
          } else if (tarea.asignacionActiva) {
            sumar(tarea.asignacionActiva.idUsuario, tarea);
          }
        }
      }

      for (const [idUsuario, tareasUsuario] of tareasPorUsuario) {
        const unica = tareasUsuario.length === 1 ? tareasUsuario[0] : null;
        await this.notifications.notifyUsers([idUsuario], {
          ...contenidoAvisoMasivo(dto, tareasUsuario, idUsuario),
          // Con una sola tarea el aviso abre su vista; con varias, el tablero
          // (resolveTaskNotificationLink cae al workspace sin taskId).
          datosJson: {
            projectId,
            accion: dto.accion,
            taskIds: tareasUsuario.map((tarea) => tarea.idTarea),
            ...(unica ? { taskId: unica.idTarea, taskTitle: unica.tituloTarea } : {}),
          },
        });
      }
    } catch (error) {
      this.logger.error('No se pudo emitir la notificación de la acción masiva', error as Error);
    }
  }

  /**
   * Tarea 34: resuelve el plan de audiencia a partir del estado ya
   * comprometido de la tarea (nunca del body ni de una relectura aparte).
   * Un rol asignado siempre gana sobre el asignado activo, incluso cuando
   * ambos existen; sin rol, el asignado activo (asociación con
   * `desasignadaEn: null`, tal como ya la expone `TareaPublica.asignacionActiva`)
   * es la única audiencia; sin rol ni asignado, no hay audiencia.
   */
  resolveTaskNotificationAudience(
    idRolProyecto: number | null,
    idProyecto: number,
    assigneeId: number | null,
  ): TaskNotificationAudience {
    // idRolProyecto/assigneeId son `number | null` por contrato (TareaPublica,
    // fila Prisma real); la comparación explícita contra `undefined` es una
    // defensa adicional para no tratar un mock de prueba incompleto (campo
    // omitido) como si tuviera rol.
    if (idRolProyecto !== null && idRolProyecto !== undefined) {
      return { kind: 'role', projectId: idProyecto, roleId: idRolProyecto };
    }
    if (assigneeId !== null && assigneeId !== undefined) {
      return { kind: 'assignee', userId: assigneeId };
    }
    return { kind: 'none' };
  }

  /**
   * Tarea 34: único punto de emisión para las operaciones generales de
   * gestión de tareas (creación con rol, edición, cambio de estado,
   * asignación/reasignación con rol, soft delete). Recibe un plan ya
   * comprometido (nunca abre transacciones ni consulta/modifica la tarea) y
   * delega en `NotificationsService`: audiencia de rol → `notifyRoleMembers`
   * (que ya resuelve participación activa, aislamiento por proyecto,
   * exclusión del actor y deduplicación); audiencia de asignado → exclusión
   * del actor y deduplicación explícitas antes de `notifyUsers`, con un
   * único candidato. `kind: 'none'` no tiene efecto. Nunca llama al gateway
   * directamente. Un fallo se registra con Logger (sin datos sensibles) y
   * nunca se relanza: la mutación ya se comprometió antes de llegar aquí.
   */
  async notifyTaskAudience(
    audience: TaskNotificationAudience,
    actorUserId: number,
    input: TaskNotificationInput,
  ): Promise<void> {
    if (audience.kind === 'none') {
      return;
    }

    try {
      if (audience.kind === 'role') {
        await this.notifications.notifyRoleMembers(
          audience.projectId,
          audience.roleId,
          actorUserId,
          input,
        );
        return;
      }

      const recipientIds = [...new Set([audience.userId])].filter(
        (idUsuario) => idUsuario !== actorUserId,
      );
      if (recipientIds.length === 0) {
        return;
      }
      await this.notifications.notifyUsers(recipientIds, input);
    } catch (error) {
      this.logger.error(
        'No se pudo emitir la notificación de gestión de tarea',
        error as Error,
      );
    }
  }

  /**
   * Notificación post-commit: un fallo aquí (almacenamiento, emisión o
   * incluso las lecturas auxiliares de nombre/título) nunca debe afectar
   * la respuesta de creación, que ya es exitosa. Se registra con Logger y
   * no se relanza; no se abre una segunda transacción ni se compensa nada.
   * Tarea 34: excluye al actor (p. ej. el líder que se asigna a sí mismo al
   * crear o asignar la tarea) antes de notificar — mismo contrato de
   * exclusión que el resto de operaciones de gestión.
   */
  async notifyAssignment(
    tarea: TareaPublica,
    actorId: number,
    assignedUserId: number,
  ): Promise<void> {
    if (assignedUserId === actorId) {
      return;
    }
    try {
      const [actor, proyecto] = await Promise.all([
        this.prisma.usuario.findUnique({
          where: { idUsuario: actorId },
          select: { nombre: true, apellido: true },
        }),
        this.prisma.proyecto.findUnique({
          where: { idProyecto: tarea.idProyecto },
          select: { tituloProyecto: true },
        }),
      ]);

      await this.notifications.notifyFromTemplate([assignedUserId], 'TAREA_ASIGNADA', {
        taskTitle: tarea.tituloTarea,
        projectTitle: proyecto?.tituloProyecto ?? '',
        assignedBy: actor ? `${actor.nombre} ${actor.apellido}` : 'Alguien',
        taskId: tarea.idTarea,
        projectId: tarea.idProyecto,
      });
    } catch (error) {
      this.logger.error(
        `No se pudo notificar la asignación inicial de la tarea ${tarea.idTarea}`,
        error as Error,
      );
    }
  }

  /**
   * Notificación post-commit de la desasignación: mismo patrón que
   * notifyAssignment (auxiliares de actor/proyecto resueltas aquí, nunca
   * dentro de la transacción de unassign; un fallo se registra con Logger
   * y no se relanza — entrega "como máximo una vez", no un mecanismo de
   * reintento). Solo se invoca cuando esta llamada cerró realmente la
   * asignación, así que no hay riesgo de notificar dos veces ante
   * solicitudes repetidas o una carrera con count: 0. Tarea 34: excluye al
   * actor (líder que se desasigna a sí mismo) antes de notificar.
   */
  async notifyUnassignment(
    taskId: number,
    projectId: number,
    taskTitle: string,
    actorId: number,
    previousUserId: number,
  ): Promise<void> {
    if (previousUserId === actorId) {
      return;
    }
    try {
      const [actor, proyecto] = await Promise.all([
        this.prisma.usuario.findUnique({
          where: { idUsuario: actorId },
          select: { nombre: true, apellido: true },
        }),
        this.prisma.proyecto.findUnique({
          where: { idProyecto: projectId },
          select: { tituloProyecto: true },
        }),
      ]);

      await this.notifications.notifyFromTemplate([previousUserId], 'TAREA_ACTUALIZADA', {
        taskTitle,
        projectTitle: proyecto?.tituloProyecto ?? '',
        unassignedBy: actor ? `${actor.nombre} ${actor.apellido}` : 'Alguien',
        taskId,
        projectId,
      });
    } catch (error) {
      this.logger.error(
        `No se pudo notificar la desasignación de la tarea ${taskId}`,
        error as Error,
      );
    }
  }
}
