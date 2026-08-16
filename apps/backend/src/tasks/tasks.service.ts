import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AsignacionTarea,
  EstadoSprint,
  EstadoTarea,
  Prioridad,
  Prisma,
  TipoNotificacion,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TasksAuthorizationService } from './tasks-authorization.service';
import { TasksContextService } from './tasks-context.service';
import { TasksRelationsService, RelatedResourcesInput } from './tasks-relations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { UpdateTaskEstadoDto } from './dto/update-task-estado.dto';
import { AssignTaskDto } from './dto/assign-task.dto';
import { CloseAssignmentDto } from './dto/close-assignment.dto';
import { calcularProgresoHito } from '../common/hito-progreso';

/**
 * Select único reutilizado por listado y detalle: hito, rolProyecto,
 * asignación activa (filtrada por desasignadaEn: null, con el usuario
 * asignado en campos seguros), etiquetas planas vía la tabla intermedia y
 * el conteo de comentarios no eliminados — todo en una sola consulta
 * Prisma, sin N+1.
 */
const TASK_SELECT = {
  idTarea: true,
  idProyecto: true,
  idHito: true,
  idRolProyecto: true,
  tituloTarea: true,
  descripcionTarea: true,
  estadoTarea: true,
  prioridad: true,
  creadaPor: true,
  fechaCreacion: true,
  fechaLimite: true,
  actualizadaEn: true,
  tiempoEstimadoHoras: true,
  hito: {
    select: { idHito: true, tituloHito: true },
  },
  rolProyecto: {
    select: { idRolProyecto: true, nombreRol: true },
  },
  asignaciones: {
    where: { desasignadaEn: null },
    select: {
      idAsignacion: true,
      idUsuario: true,
      fechaAsignacion: true,
      usuario: {
        select: { idUsuario: true, nombre: true, apellido: true, fotoUrl: true },
      },
    },
  },
  etiquetas: {
    select: {
      etiqueta: {
        select: { idEtiqueta: true, nombreEtiqueta: true, nombreNormalizado: true, color: true },
      },
    },
  },
  _count: {
    select: { comentarios: { where: { eliminadoEn: null } } },
  },
} satisfies Prisma.TareaSelect;

type TareaRow = Prisma.TareaGetPayload<{ select: typeof TASK_SELECT }>;

/**
 * Únicas claves relevantes para distinguir un PATCH vacío de uno con al
 * menos un cambio real; deben coincidir exactamente con los campos
 * declarados en UpdateTaskDto (forbidNonWhitelisted ya descarta cualquier
 * otra clave antes de llegar al service).
 */
const UPDATE_TASK_FIELDS = [
  'tituloTarea',
  'descripcionTarea',
  'fechaLimite',
  'prioridad',
  'tiempoEstimadoHoras',
  'idHito',
  'idRolProyecto',
  'idsEtiquetas',
] as const;

const MIN_PROGRESS_CONTENT_LENGTH = 200;

interface UsuarioResumenPublico {
  idUsuario: number;
  nombre: string;
  apellido: string;
  fotoUrl: string | null;
}

interface AsignacionActivaPublica {
  idAsignacion: number;
  idUsuario: number;
  fechaAsignacion: Date;
  usuario: UsuarioResumenPublico;
}

interface RolProyectoResumenPublico {
  idRolProyecto: number;
  nombreRol: string;
}

interface HitoResumenPublico {
  idHito: number;
  tituloHito: string;
}

interface EtiquetaPublica {
  idEtiqueta: number;
  nombreEtiqueta: string;
  nombreNormalizado: string;
  color: string;
}

export interface TareaPublica {
  idTarea: number;
  idProyecto: number;
  idHito: number | null;
  idRolProyecto: number | null;
  tituloTarea: string;
  descripcionTarea: string | null;
  estadoTarea: EstadoTarea;
  prioridad: Prioridad;
  creadaPor: number;
  fechaCreacion: Date;
  fechaLimite: string | null;
  actualizadaEn: Date | null;
  tiempoEstimadoHoras: number | null;
  asignacionActiva: AsignacionActivaPublica | null;
  rolProyecto: RolProyectoResumenPublico | null;
  hito: HitoResumenPublico | null;
  etiquetas: EtiquetaPublica[];
  cantidadComentarios: number;
}

/**
 * Prisma devuelve las columnas @db.Date como Date a medianoche UTC del día
 * calendario almacenado (verificado empíricamente contra la base local:
 * una fila con fecha_limite = DATE '2026-12-25' se lee como
 * 2026-12-25T00:00:00.000Z). Usar getters locales reinterpreta ese instante
 * en la zona horaria del proceso y puede desplazar el día (confirmado con
 * TZ=America/Guatemala: getFullYear/getMonth/getDate devolvían 24, no 25).
 * Por eso se extrae siempre con toISOString(), que es UTC por definición.
 */
function toDateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function mapTarea(row: TareaRow): TareaPublica {
  const asignacion = row.asignaciones[0];
  const etiquetas = row.etiquetas
    .map((tareaEtiqueta) => tareaEtiqueta.etiqueta)
    .sort((a, b) => a.nombreNormalizado.localeCompare(b.nombreNormalizado));

  return {
    idTarea: row.idTarea,
    idProyecto: row.idProyecto,
    idHito: row.idHito,
    idRolProyecto: row.idRolProyecto,
    tituloTarea: row.tituloTarea,
    descripcionTarea: row.descripcionTarea,
    estadoTarea: row.estadoTarea,
    prioridad: row.prioridad,
    creadaPor: row.creadaPor,
    fechaCreacion: row.fechaCreacion,
    fechaLimite: toDateOnly(row.fechaLimite),
    actualizadaEn: row.actualizadaEn,
    tiempoEstimadoHoras: row.tiempoEstimadoHoras,
    asignacionActiva: asignacion
      ? {
          idAsignacion: asignacion.idAsignacion,
          idUsuario: asignacion.idUsuario,
          fechaAsignacion: asignacion.fechaAsignacion,
          usuario: asignacion.usuario,
        }
      : null,
    rolProyecto: row.rolProyecto,
    hito: row.hito,
    etiquetas,
    cantidadComentarios: row._count.comentarios,
  };
}

/**
 * Tarea 34: plan de audiencia calculado a partir del estado comprometido
 * (nunca de datos del body ni de una relectura ambigua). Prioridad fija:
 * un rol asignado a la tarea siempre gana sobre el asignado activo; sin rol
 * y sin asignado activo, no hay audiencia.
 */
type TaskNotificationAudience =
  | { kind: 'role'; projectId: number; roleId: number }
  | { kind: 'assignee'; userId: number }
  | { kind: 'none' };

interface TaskNotificationInput {
  tipoNotificacion: TipoNotificacion;
  tituloNotificacion: string;
  mensajeNotificacion: string;
  datosJson: Prisma.InputJsonValue;
}

const PRIORITY_ORDER: Record<Prioridad, number> = {
  ALTA: 0,
  MEDIA: 1,
  BAJA: 2,
};

/**
 * Orden de negocio: ALTA > MEDIA > BAJA; dentro de la misma prioridad,
 * fecha límite más próxima primero (comparación de strings YYYY-MM-DD, ya
 * normalizados por mapTarea), tareas sin fecha al final, e idTarea
 * ascendente como desempate estable. Se ordena en memoria tras una única
 * consulta; no existe ninguna columna de posición manual.
 */
function compareTareas(a: TareaPublica, b: TareaPublica): number {
  const prioridadDiff = PRIORITY_ORDER[a.prioridad] - PRIORITY_ORDER[b.prioridad];
  if (prioridadDiff !== 0) {
    return prioridadDiff;
  }

  if (a.fechaLimite !== b.fechaLimite) {
    if (a.fechaLimite === null) return 1;
    if (b.fechaLimite === null) return -1;
    return a.fechaLimite < b.fechaLimite ? -1 : 1;
  }

  return a.idTarea - b.idTarea;
}

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private prisma: PrismaService,
    private tasksAuthorization: TasksAuthorizationService,
    private tasksRelations: TasksRelationsService,
    private notifications: NotificationsService,
    private tasksContext: TasksContextService,
  ) {}

  async findAll(projectId: number, userId: number): Promise<TareaPublica[]> {
    await this.tasksAuthorization.assertCanListProjectTasks(projectId, userId);

    const rows = await this.prisma.tarea.findMany({
      where: { idProyecto: projectId, eliminadoEn: null },
      select: TASK_SELECT,
    });

    return rows.map(mapTarea).sort(compareTareas);
  }

  async findOne(projectId: number, taskId: number, userId: number): Promise<TareaPublica> {
    await this.tasksAuthorization.assertCanReadTask(projectId, taskId, userId);

    // Se repiten los filtros de proyecto y soft delete aunque
    // assertCanReadTask ya validó la tarea, para cubrir el caso de que
    // cambie entre la autorización y esta lectura final.
    const row = await this.prisma.tarea.findFirst({
      where: { idTarea: taskId, idProyecto: projectId, eliminadoEn: null },
      select: TASK_SELECT,
    });

    if (!row) {
      throw new NotFoundException(
        `Tarea con id ${taskId} no encontrada en el proyecto ${projectId}`,
      );
    }

    return mapTarea(row);
  }

  /**
   * Crea la tarea, su asignación inicial (si se envió idUsuarioAsignado) y
   * sus asociaciones de etiquetas de forma atómica dentro de una única
   * transacción Prisma: autorización → relaciones → tarea → asignación →
   * etiquetas → lectura final. Cualquier fallo en cualquiera de esos pasos
   * revierte todas las escrituras (incluida la propia tarea) porque el
   * callback de $transaction propaga la excepción sin capturarla. La
   * notificación de asignación ocurre después de que la transacción se
   * resuelve con éxito, nunca dentro de ella (sección 13 de la tarea).
   */
  async create(projectId: number, userId: number, dto: CreateTaskDto): Promise<TareaPublica> {
    const row = await this.prisma.$transaction(async (tx) => {
      await this.tasksAuthorization.assertCanCreateTask(projectId, userId, tx);

      // El proyecto solo admite tareas nuevas mientras tenga un Sprint
      // ACTIVO (contrato Sprint 6): EN_FINALIZACION, CERRADO o la ausencia
      // de Sprint bloquean la creación. El Sprint nunca se crea aquí — el
      // primer Sprint y los siguientes los inicia el líder manualmente
      // (fuera de este flujo).
      const sprintActivo = await tx.sprint.findFirst({
        where: { idProyecto: projectId, estado: EstadoSprint.ACTIVO },
        select: { idSprint: true },
      });
      if (!sprintActivo) {
        throw new ConflictException(
          'No se pueden crear tareas porque el proyecto no tiene un Sprint activo.',
        );
      }

      const recursos = await this.tasksRelations.validateCreateTaskRelations(projectId, dto, tx);

      const tarea = await tx.tarea.create({
        data: {
          idProyecto: projectId,
          idSprint: sprintActivo.idSprint,
          creadaPor: userId,
          tituloTarea: dto.tituloTarea,
          // Conserva '' si se envió explícitamente; solo el omitido se
          // convierte en null (no existe una convención distinta en el
          // backend para "descripción vacía" vs. "sin descripción").
          descripcionTarea: dto.descripcionTarea ?? null,
          // fechaLimite es @db.Date: se ancla a medianoche UTC del mismo
          // día calendario validado por el DTO, sin usar getters locales,
          // igual que la lectura ya verificada en TasksService (Tarea 15).
          fechaLimite: new Date(`${dto.fechaLimite}T00:00:00.000Z`),
          prioridad: dto.prioridad,
          // Estado inicial fijo: no existe todavía un contrato de API que
          // permita elegirlo desde el cliente (Tarea 11), y el schema no
          // define @default para fechaLimite ni para este flujo de
          // creación explícita, así que se establece explícitamente con
          // el enum real en vez de depender del @default(POR_HACER).
          estadoTarea: EstadoTarea.POR_HACER,
          tiempoEstimadoHoras: dto.tiempoEstimadoHoras ?? null,
          idHito: recursos.hito?.idHito ?? null,
          idRolProyecto: recursos.rolProyecto?.idRolProyecto ?? null,
        },
      });

      if (dto.idUsuarioAsignado !== undefined) {
        await tx.asignacionTarea.create({
          data: {
            idTarea: tarea.idTarea,
            idUsuario: dto.idUsuarioAsignado,
            // X1.1: participación exacta ya resuelta por
            // validateCreateTaskRelations (misma fila validada, sin
            // segunda consulta) — nunca queda NULL para una asignación
            // inicial real, condición que HoursRecognitionService (B10)
            // exige para poder reconocer horas de este tramo.
            idParticipacion: recursos.idParticipacionAsignado ?? null,
            asignadoPor: userId,
            desasignadaEn: null,
          },
        });
      }

      if (recursos.etiquetas && recursos.etiquetas.length > 0) {
        await tx.tareaEtiqueta.createMany({
          data: recursos.etiquetas.map((etiqueta) => ({
            idTarea: tarea.idTarea,
            idEtiqueta: etiqueta.idEtiqueta,
          })),
        });
      }

      const filaFinal = await tx.tarea.findFirst({
        where: { idTarea: tarea.idTarea, idProyecto: projectId, eliminadoEn: null },
        select: TASK_SELECT,
      });

      if (!filaFinal) {
        // Invariante interno: la tarea recién creada en esta misma
        // transacción debería ser siempre legible. Si no lo es, algo está
        // genuinamente mal en el servidor; se lanza un error no-HTTP para
        // que se traduzca en 500 y, sobre todo, para que Prisma revierta
        // toda la transacción.
        throw new Error(
          `No se pudo leer la tarea con id ${tarea.idTarea} recién creada dentro de la transacción`,
        );
      }

      // A12.1: una tarea nueva con idHito != null cambia el conjunto de
      // tareas vigentes que determina el progreso de ese Hito (nace
      // POR_HACER, así que puede degradar un Hito antes COMPLETADO) —
      // mismo mecanismo de sincronización que updateEstado/closeAssignment
      // (A12), reutilizado sin duplicar la fórmula.
      if (filaFinal.idHito !== null) {
        await this.syncHitoEstado(tx, filaFinal.idHito);
      }

      return filaFinal;
    });

    const tareaCreada = mapTarea(row);

    // Tarea 34: un rol siempre gana sobre el asignado inicial, incluso si
    // ambos se enviaron en la creación — nunca se notifica a ambos.
    // Reutiliza _notifyAssignment (ya excluye al actor) para la rama sin
    // rol, exactamente el mismo comportamiento que ya tenía esta operación.
    if (tareaCreada.idRolProyecto !== null) {
      await this.notifyTaskAudience(
        { kind: 'role', projectId: tareaCreada.idProyecto, roleId: tareaCreada.idRolProyecto },
        userId,
        {
          tipoNotificacion: TipoNotificacion.TAREA_ACTUALIZADA,
          tituloNotificacion: 'Nueva tarea en tu rol',
          mensajeNotificacion: `Se creó la tarea "${tareaCreada.tituloTarea}" en tu rol del proyecto.`,
          datosJson: {
            projectId: tareaCreada.idProyecto,
            taskId: tareaCreada.idTarea,
            taskTitle: tareaCreada.tituloTarea,
          },
        },
      );
    } else if (dto.idUsuarioAsignado !== undefined) {
      await this._notifyAssignment(tareaCreada, userId, dto.idUsuarioAsignado);
    }

    return tareaCreada;
  }

  /**
   * Edita título, descripción, prioridad, fecha límite, tiempo estimado,
   * hito, rol de proyecto y el conjunto completo de etiquetas dentro de una
   * única transacción: autorización → relaciones enviadas → compatibilidad
   * del asignado activo (solo si cambia idRolProyecto) → tarea → etiquetas
   * → lectura final. No toca AsignacionTarea. Un campo se distingue de
   * "omitido" por presencia real de la clave en dto (hasOwnProperty), nunca
   * por su valor: '' en descripcionTarea y null en idHito/idRolProyecto son
   * envíos explícitos válidos que undefined-checks confundirían.
   */
  async update(
    projectId: number,
    taskId: number,
    userId: number,
    dto: UpdateTaskDto,
  ): Promise<TareaPublica> {
    const huboCampoEnviado = UPDATE_TASK_FIELDS.some((campo) =>
      Object.prototype.hasOwnProperty.call(dto, campo),
    );
    if (!huboCampoEnviado) {
      throw new BadRequestException('Debe enviar al menos un campo para actualizar la tarea');
    }

    const row = await this.prisma.$transaction(async (tx) => {
      await this.tasksAuthorization.assertCanEditTask(projectId, taskId, userId, tx);

      const relacionesInput: RelatedResourcesInput = {};
      if (Object.prototype.hasOwnProperty.call(dto, 'idHito')) {
        relacionesInput.idHito = dto.idHito;
      }
      if (Object.prototype.hasOwnProperty.call(dto, 'idRolProyecto')) {
        relacionesInput.idRolProyecto = dto.idRolProyecto;
      }
      if (Object.prototype.hasOwnProperty.call(dto, 'idsEtiquetas')) {
        relacionesInput.idsEtiquetas = dto.idsEtiquetas;
      }

      const recursos = await this.tasksRelations.validateRelatedResources(
        projectId,
        relacionesInput,
        tx,
      );

      // El rol no se toca desde este endpoint, pero un cambio de rol no
      // puede dejar a un asignado activo en un rol que ya no participa.
      // Solo se consulta la asignación cuando idRolProyecto fue enviado.
      if (Object.prototype.hasOwnProperty.call(dto, 'idRolProyecto')) {
        const asignacionActiva = await this.tasksContext.getActiveAssignment(taskId, tx);
        if (asignacionActiva) {
          const rolEfectivo = recursos.rolProyecto?.idRolProyecto ?? null;
          await this.tasksRelations.assertUserAssignableToProject(
            projectId,
            asignacionActiva.idUsuario,
            rolEfectivo,
            tx,
          );
        }
      }

      const data: Prisma.TareaUncheckedUpdateInput = {};
      if (Object.prototype.hasOwnProperty.call(dto, 'tituloTarea')) {
        data.tituloTarea = dto.tituloTarea;
      }
      if (Object.prototype.hasOwnProperty.call(dto, 'descripcionTarea')) {
        data.descripcionTarea = dto.descripcionTarea;
      }
      if (Object.prototype.hasOwnProperty.call(dto, 'prioridad')) {
        data.prioridad = dto.prioridad;
      }
      if (Object.prototype.hasOwnProperty.call(dto, 'tiempoEstimadoHoras')) {
        data.tiempoEstimadoHoras = dto.tiempoEstimadoHoras;
      }
      if (Object.prototype.hasOwnProperty.call(dto, 'fechaLimite')) {
        data.fechaLimite = new Date(`${dto.fechaLimite}T00:00:00.000Z`);
      }
      if (Object.prototype.hasOwnProperty.call(dto, 'idHito')) {
        data.idHito = recursos.hito?.idHito ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(dto, 'idRolProyecto')) {
        data.idRolProyecto = recursos.rolProyecto?.idRolProyecto ?? null;
      }

      await tx.tarea.update({ where: { idTarea: taskId }, data });

      if (Object.prototype.hasOwnProperty.call(dto, 'idsEtiquetas')) {
        await tx.tareaEtiqueta.deleteMany({ where: { idTarea: taskId } });

        if (recursos.etiquetas && recursos.etiquetas.length > 0) {
          await tx.tareaEtiqueta.createMany({
            data: recursos.etiquetas.map((etiqueta) => ({
              idTarea: taskId,
              idEtiqueta: etiqueta.idEtiqueta,
            })),
          });
        }
      }

      const filaFinal = await tx.tarea.findFirst({
        where: { idTarea: taskId, idProyecto: projectId, eliminadoEn: null },
        select: TASK_SELECT,
      });

      if (!filaFinal) {
        throw new Error(
          `No se pudo leer la tarea con id ${taskId} recién actualizada dentro de la transacción`,
        );
      }

      return filaFinal;
    });

    const tareaActualizada = mapTarea(row);

    // Tarea 34: audiencia calculada del estado FINAL comprometido (nunca
    // del rol/asignado anterior a la edición). update() nunca toca
    // AsignacionTarea, así que asignacionActiva ya refleja exactamente lo
    // que la tarea conservaba antes de esta edición.
    await this.notifyTaskAudience(
      this.resolveTaskNotificationAudience(
        tareaActualizada.idRolProyecto,
        tareaActualizada.idProyecto,
        tareaActualizada.asignacionActiva?.idUsuario ?? null,
      ),
      userId,
      {
        tipoNotificacion: TipoNotificacion.TAREA_ACTUALIZADA,
        tituloNotificacion: 'Tarea actualizada',
        mensajeNotificacion: `La tarea "${tareaActualizada.tituloTarea}" fue actualizada.`,
        datosJson: {
          projectId: tareaActualizada.idProyecto,
          taskId: tareaActualizada.idTarea,
          taskTitle: tareaActualizada.tituloTarea,
        },
      },
    );

    return tareaActualizada;
  }

  /**
   * Cambia estadoTarea libremente entre los cuatro valores del enum, sin
   * máquina de transiciones: el DTO ya valida que el valor pertenezca al
   * enum real, así que cualquier combinación (incluido retroceder o repetir
   * el estado actual) es una escritura válida. Autorización y escritura
   * ocurren en la misma transacción: assertCanChangeTaskState (líder o
   * asignado activo, consultado en cada llamada) → tarea.update del único
   * campo → lectura final con el mismo TASK_SELECT/mapTarea que el resto de
   * endpoints. No se toca asignación, etiquetas, hito ni rol.
   */
  async updateEstado(
    projectId: number,
    taskId: number,
    userId: number,
    dto: UpdateTaskEstadoDto,
  ): Promise<TareaPublica> {
    const row = await this.prisma.$transaction(async (tx) => {
      await this.tasksAuthorization.assertCanChangeTaskState(projectId, taskId, userId, tx);

      await tx.tarea.update({
        where: { idTarea: taskId },
        data: { estadoTarea: dto.estadoTarea },
      });

      const filaFinal = await tx.tarea.findFirst({
        where: { idTarea: taskId, idProyecto: projectId, eliminadoEn: null },
        select: TASK_SELECT,
      });

      if (!filaFinal) {
        throw new Error(
          `No se pudo leer la tarea con id ${taskId} recién actualizada dentro de la transacción`,
        );
      }

      // A12: updateEstado escribe estadoTarea incondicionalmente (sin
      // atajo de idempotencia, ver docstring de este método) — si la
      // tarea pertenece a un Hito, su progreso persistido puede haber
      // cambiado.
      if (filaFinal.idHito !== null) {
        await this.syncHitoEstado(tx, filaFinal.idHito);
      }

      return filaFinal;
    });

    const tareaConEstado = mapTarea(row);

    // Tarea 34: el método actualmente ESCRIBE siempre (no hay atajo de
    // idempotencia para "mismo estado"; ver docstring de updateEstado), así
    // que se notifica en cada invocación exitosa, sin introducir aquí una
    // regla nueva de "sin cambios reales" que el método no tiene.
    await this.notifyTaskAudience(
      this.resolveTaskNotificationAudience(
        tareaConEstado.idRolProyecto,
        tareaConEstado.idProyecto,
        tareaConEstado.asignacionActiva?.idUsuario ?? null,
      ),
      userId,
      {
        tipoNotificacion: TipoNotificacion.TAREA_ACTUALIZADA,
        tituloNotificacion: 'Estado de tarea actualizado',
        mensajeNotificacion: `La tarea "${tareaConEstado.tituloTarea}" cambió de estado a ${tareaConEstado.estadoTarea}.`,
        datosJson: {
          projectId: tareaConEstado.idProyecto,
          taskId: tareaConEstado.idTarea,
          taskTitle: tareaConEstado.tituloTarea,
          estado: tareaConEstado.estadoTarea,
        },
      },
    );

    return tareaConEstado;
  }

  /**
   * Soft delete: exclusivo del líder (assertCanDeleteTask). Un único
   * timestamp (`eliminadoEn`) se usa tanto para marcar la tarea como para
   * cerrar la asignación activa, de modo que ambas escrituras queden
   * atadas al mismo instante lógico de eliminación y no a dos llamadas
   * independientes a `new Date()`. `updateMany` sobre la asignación es
   * intencional: funciona igual con 0 o 1 fila activa, sin necesitar una
   * lectura previa, y el filtro `desasignadaEn: null` deja intactas las
   * asignaciones históricas. No se borra físicamente nada; todo el
   * historial (asignaciones, etiquetas, comentarios, evidencias) permanece.
   * Tarea 34: la audiencia (rol o asignado previo) se captura como snapshot
   * DENTRO de la transacción, antes de cerrar la asignación — nunca se
   * consulta la asignación después del cierre (ya estaría `desasignadaEn`
   * no-null) ni se relee la tarea después del commit (ya estaría
   * `eliminadoEn` no-null, invisible para cualquier helper que filtre por
   * `eliminadoEn: null`).
   */
  async remove(projectId: number, taskId: number, userId: number): Promise<void> {
    const snapshot = await this.prisma.$transaction(async (tx) => {
      const tarea = await this.tasksAuthorization.assertCanDeleteTask(projectId, taskId, userId, tx);
      const asignacionActiva = await this.tasksContext.getActiveAssignment(taskId, tx);

      const eliminadoEn = new Date();

      await tx.asignacionTarea.updateMany({
        where: { idTarea: taskId, desasignadaEn: null },
        data: { desasignadaEn: eliminadoEn },
      });

      await tx.tarea.update({
        where: { idTarea: taskId },
        data: { eliminadoEn },
      });

      // A12.1: el soft-delete saca la tarea del conjunto vigente
      // (`eliminadoEn: null`) que determina el progreso de su Hito — la
      // misma invariante que corrige la creación; se resincroniza con el
      // mismo mecanismo (A12), dentro de esta misma transacción.
      if (tarea.idHito !== null) {
        await this.syncHitoEstado(tx, tarea.idHito);
      }

      return {
        taskId: tarea.idTarea,
        projectId: tarea.idProyecto,
        taskTitle: tarea.tituloTarea,
        idRolProyecto: tarea.idRolProyecto ?? null,
        previousAssigneeId: asignacionActiva?.idUsuario ?? null,
      };
    });

    await this.notifyTaskAudience(
      this.resolveTaskNotificationAudience(
        snapshot.idRolProyecto,
        snapshot.projectId,
        snapshot.previousAssigneeId,
      ),
      userId,
      {
        tipoNotificacion: TipoNotificacion.TAREA_ACTUALIZADA,
        tituloNotificacion: 'Tarea eliminada',
        mensajeNotificacion: `La tarea "${snapshot.taskTitle}" fue eliminada.`,
        datosJson: {
          projectId: snapshot.projectId,
          taskId: snapshot.taskId,
          taskTitle: snapshot.taskTitle,
        },
      },
    );
  }

  /**
   * Asigna o reasigna la tarea; exclusivo del líder (assertCanAssignTask).
   * El rol efectivo para validar al candidato viene siempre de la tarea ya
   * validada por la autorización (`tarea.idRolProyecto`), nunca del DTO ni
   * de una relectura aparte. La asignación activa se consulta de nuevo en
   * cada llamada (nunca se confía en un resultado previo): si ya pertenece
   * al candidato solicitado, la operación es idempotente y no escribe nada
   * en AsignacionTarea; si pertenece a otra persona, se cierra esa fila
   * (updateMany con idAsignacion+idTarea+desasignadaEn:null, para no tocar
   * historial ni otras tareas) y se crea una fila nueva — nunca se
   * reescribe el idUsuario de la fila anterior. Sin asignación activa,
   * simplemente se crea la primera fila. Tarea 34: la audiencia se resuelve
   * después del commit y ÚNICAMENTE cuando esta llamada escribió realmente
   * (`escribio`); la rama idempotente (mismo usuario ya asignado) no
   * notifica. Con rol, se notifica a sus miembros activos tanto en la
   * asignación inicial como en cualquier reasignación — nunca al asignado
   * anterior ni, por separado, al nuevo. Sin rol, se reutiliza
   * `_notifyAssignment` (ya excluye al actor), igual que en `create()`;
   * el usuario anterior nunca es candidato.
   */
  async assign(
    projectId: number,
    taskId: number,
    actorUserId: number,
    dto: AssignTaskDto,
  ): Promise<TareaPublica> {
    const resultado = await this.prisma.$transaction(async (tx) => {
      const tarea = await this.tasksAuthorization.assertCanAssignTask(
        projectId,
        taskId,
        actorUserId,
        tx,
      );

      const rolEfectivo = tarea.idRolProyecto ?? null;
      // X1.1: idParticipacion exacto ya resuelto por esta misma validación
      // (rol exacto si la tarea tiene idRolProyecto, participación ACTIVO
      // del proyecto si no) — se reutiliza tal cual al crear la fila
      // activa, sin una segunda consulta y sin adivinar entre varias
      // participaciones del mismo usuario (multirol).
      const idParticipacionResuelta = await this.tasksRelations.assertUserAssignableToProject(
        projectId,
        dto.idUsuario,
        rolEfectivo,
        tx,
      );

      const asignacionActiva = await this.tasksContext.getActiveAssignment(taskId, tx);
      let escribio = false;

      if (!asignacionActiva) {
        await this.createActiveAssignment(tx, {
          idTarea: taskId,
          idUsuario: dto.idUsuario,
          idParticipacion: idParticipacionResuelta,
          asignadoPor: actorUserId,
          desasignadaEn: null,
        });
        escribio = true;
      } else if (asignacionActiva.idUsuario !== dto.idUsuario) {
        const desasignadaEn = new Date();

        await tx.asignacionTarea.updateMany({
          where: {
            idAsignacion: asignacionActiva.idAsignacion,
            idTarea: taskId,
            desasignadaEn: null,
          },
          data: { desasignadaEn },
        });

        await this.createActiveAssignment(tx, {
          idTarea: taskId,
          idUsuario: dto.idUsuario,
          idParticipacion: idParticipacionResuelta,
          asignadoPor: actorUserId,
          desasignadaEn: null,
        });
        escribio = true;
      }
      // Si asignacionActiva.idUsuario === dto.idUsuario: idempotente, sin escrituras.

      const filaFinal = await tx.tarea.findFirst({
        where: { idTarea: taskId, idProyecto: projectId, eliminadoEn: null },
        select: TASK_SELECT,
      });

      if (!filaFinal) {
        throw new Error(
          `No se pudo leer la tarea con id ${taskId} recién asignada dentro de la transacción`,
        );
      }

      return { fila: filaFinal, escribio };
    });

    const tareaAsignada = mapTarea(resultado.fila);

    if (resultado.escribio) {
      if (tareaAsignada.idRolProyecto !== null) {
        await this.notifyTaskAudience(
          {
            kind: 'role',
            projectId: tareaAsignada.idProyecto,
            roleId: tareaAsignada.idRolProyecto,
          },
          actorUserId,
          {
            tipoNotificacion: TipoNotificacion.TAREA_ASIGNADA,
            tituloNotificacion: 'Tarea asignada',
            mensajeNotificacion: `Se asignó la tarea "${tareaAsignada.tituloTarea}" dentro de tu rol.`,
            datosJson: {
              projectId: tareaAsignada.idProyecto,
              taskId: tareaAsignada.idTarea,
              taskTitle: tareaAsignada.tituloTarea,
            },
          },
        );
      } else {
        await this._notifyAssignment(tareaAsignada, actorUserId, dto.idUsuario);
      }
    }

    return tareaAsignada;
  }

  /**
   * Crea la fila activa de AsignacionTarea y traduce ÚNICAMENTE la
   * violación reconocida del índice parcial asignacion_tarea_activa_unique
   * a 409; cualquier otro error (otro P2002, P2003, P2025, errores de
   * conexión, errores genéricos) se relanza sin cambios. Único punto de
   * `tx.asignacionTarea.create` en assign(): se reutiliza tanto para la
   * asignación inicial como para la reasignación, de modo que el manejo de
   * la colisión no se duplica ni se olvida en ninguno de los dos caminos.
   */
  private async createActiveAssignment(
    tx: Prisma.TransactionClient,
    data: {
      idTarea: number;
      idUsuario: number;
      idParticipacion: number;
      asignadoPor: number;
      desasignadaEn: null;
    },
  ): Promise<AsignacionTarea> {
    try {
      return await tx.asignacionTarea.create({ data });
    } catch (error) {
      if (this.isActiveAssignmentCollision(error)) {
        throw new ConflictException('La tarea ya tiene una asignación activa');
      }
      throw error;
    }
  }

  /**
   * Reconoce específicamente la violación del índice parcial
   * asignacion_tarea_activa_unique (Tarea 9), reproducida empíricamente
   * contra PostgreSQL real antes de escribir este detector (Tarea 26):
   * Prisma 6.19.2 no expone el nombre del índice parcial en `error.meta`
   * para esta violación — solo entrega `modelName` y `target` (las
   * columnas involucradas, en snake_case real de la base: `id_tarea`). Por
   * eso no basta `error.code === 'P2002'`: se exige además que el modelo
   * sea AsignacionTarea y que el target sea exactamente ['id_tarea'], la
   * combinación más estrecha posible con la metadata realmente disponible.
   * Un P2002 de otro modelo u otro target, un P2003 (FK), un P2025
   * (registro no encontrado) o cualquier error sin esa forma exacta
   * devuelven false y se relanzan sin cambios por el llamador.
   */
  private isActiveAssignmentCollision(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return false;
    }
    if (error.code !== 'P2002') {
      return false;
    }

    const modelName = error.meta?.modelName;
    const target = error.meta?.target;

    return (
      modelName === 'AsignacionTarea' &&
      Array.isArray(target) &&
      target.length === 1 &&
      target[0] === 'id_tarea'
    );
  }

  /**
   * Cierra la asignación activa; exclusivo del líder (assertCanUnassignTask).
   * No usa TasksRelationsService: no hay candidato nuevo que validar. La
   * asignación activa se consulta de nuevo en cada llamada; sin fila activa
   * es un no-op exitoso (204 idempotente). El cierre usa `updateMany` con
   * idAsignacion+idTarea+idUsuario+desasignadaEn:null como filtro completo:
   * si `count` da 0 (otra solicitud ya la cerró entre la lectura y la
   * escritura), se trata igual que "sin asignación activa" — nunca se
   * relanza, nunca se notifica dos veces. La notificación al usuario que
   * dejó de estar asignado ocurre después de resolver la transacción
   * (nunca dentro), y solo cuando esta llamada fue la que realmente cerró
   * la fila (`cerrada: true`).
   */
  async unassign(projectId: number, taskId: number, actorUserId: number): Promise<void> {
    const resultado = await this.prisma.$transaction(async (tx) => {
      const tarea = await this.tasksAuthorization.assertCanUnassignTask(
        projectId,
        taskId,
        actorUserId,
        tx,
      );

      const asignacionActiva = await this.tasksContext.getActiveAssignment(taskId, tx);
      if (!asignacionActiva) {
        return { cerrada: false as const };
      }

      const desasignadaEn = new Date();
      const closed = await tx.asignacionTarea.updateMany({
        where: {
          idAsignacion: asignacionActiva.idAsignacion,
          idTarea: taskId,
          idUsuario: asignacionActiva.idUsuario,
          desasignadaEn: null,
        },
        data: { desasignadaEn },
      });

      if (closed.count === 0) {
        return { cerrada: false as const };
      }

      return {
        cerrada: true as const,
        previousUserId: asignacionActiva.idUsuario,
        taskId: tarea.idTarea,
        projectId: tarea.idProyecto,
        taskTitle: tarea.tituloTarea,
      };
    });

    if (resultado.cerrada) {
      await this._notifyUnassignment(
        resultado.taskId,
        resultado.projectId,
        resultado.taskTitle,
        actorUserId,
        resultado.previousUserId,
      );
    }
  }

  async closeAssignment(
    projectId: number,
    taskId: number,
    assignmentId: number,
    actorUserId: number,
    dto: CloseAssignmentDto,
  ): Promise<TareaPublica> {
    this.assertValidAssignmentClosureInput(dto);

    const row = await this.prisma.$transaction(async (tx) => {
      await this.tasksContext.getTaskInProjectOrThrow(projectId, taskId, tx);

      const asignacion = await tx.asignacionTarea.findFirst({
        where: { idAsignacion: assignmentId, idTarea: taskId },
        select: {
          idAsignacion: true,
          idTarea: true,
          idUsuario: true,
          desasignadaEn: true,
        },
      });
      if (!asignacion) {
        throw new NotFoundException(
          `Asignación con id ${assignmentId} no encontrada en la tarea ${taskId}`,
        );
      }

      if (asignacion.idUsuario !== actorUserId) {
        throw new ForbiddenException('Solo el usuario asignado puede cerrar este tramo');
      }

      await this.tasksContext.assertActiveProjectParticipant(projectId, actorUserId, tx);

      const desasignadaEn = new Date();
      const closed = await tx.asignacionTarea.updateMany({
        where: {
          idAsignacion: assignmentId,
          idTarea: taskId,
          idUsuario: actorUserId,
          desasignadaEn: null,
        },
        data: {
          horasReales: dto.horasReales,
          desasignadaEn,
        },
      });

      if (closed.count !== 1) {
        throw new ConflictException('La asignación ya fue cerrada');
      }

      await tx.registroAvanceAsignacion.create({
        data: {
          idAsignacion: assignmentId,
          idAutor: actorUserId,
          contenido: dto.contenidoAvance,
        },
      });

      if (dto.marcarComoHecha === true) {
        await tx.tarea.update({
          where: { idTarea: taskId },
          data: { estadoTarea: EstadoTarea.HECHO },
        });
      }

      const filaFinal = await tx.tarea.findFirst({
        where: { idTarea: taskId, idProyecto: projectId, eliminadoEn: null },
        select: TASK_SELECT,
      });

      if (!filaFinal) {
        throw new Error(
          `No se pudo leer la tarea con id ${taskId} recién cerrada dentro de la transacción`,
        );
      }

      // A12: solo cuando este cierre de tramo efectivamente cambió
      // estadoTarea (marcarComoHecha) y la tarea pertenece a un Hito.
      if (dto.marcarComoHecha === true && filaFinal.idHito !== null) {
        await this.syncHitoEstado(tx, filaFinal.idHito);
      }

      return filaFinal;
    });

    return mapTarea(row);
  }

  /**
   * A12: sincroniza `Hito.estadoHito` con el progreso real derivado de sus
   * tareas vigentes — misma fórmula única que `ProjectsService.calcularAvanceHitos`
   * (vía `calcularProgresoHito`, src/common/hito-progreso.ts), nunca una
   * segunda definición. Se llama SIEMPRE dentro de la misma transacción que
   * acaba de escribir `estadoTarea`, así que la consulta ve el estado ya
   * comprometido (no el anterior). Acotado por `idHito`: una sola consulta
   * (`tarea.findMany` filtrado por ese Hito, `eliminadoEn: null`) y una sola
   * escritura (`hito.update`) — nunca recorre otros Hitos ni otros
   * proyectos. El caller es responsable de solo invocar esto cuando la
   * tarea realmente tiene `idHito !== null`.
   */
  private async syncHitoEstado(tx: Prisma.TransactionClient, idHito: number): Promise<void> {
    const tareasHito = await tx.tarea.findMany({
      where: { idHito, eliminadoEn: null },
      select: { estadoTarea: true },
    });
    const { estadoHito } = calcularProgresoHito(tareasHito);
    await tx.hito.update({
      where: { idHito },
      data: { estadoHito },
    });
  }

  private assertValidAssignmentClosureInput(dto: CloseAssignmentDto): void {
    if (!Number.isFinite(dto.horasReales) || dto.horasReales < 0) {
      throw new BadRequestException('horasReales debe ser un número válido mayor o igual a 0');
    }

    if (
      typeof dto.contenidoAvance !== 'string' ||
      dto.contenidoAvance.trim().length < MIN_PROGRESS_CONTENT_LENGTH
    ) {
      throw new BadRequestException(
        `contenidoAvance debe tener al menos ${MIN_PROGRESS_CONTENT_LENGTH} caracteres significativos`,
      );
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
  private resolveTaskNotificationAudience(
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
  private async notifyTaskAudience(
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
  private async _notifyAssignment(
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
   * _notifyAssignment (auxiliares de actor/proyecto resueltas aquí, nunca
   * dentro de la transacción de unassign; un fallo se registra con Logger
   * y no se relanza — entrega "como máximo una vez", no un mecanismo de
   * reintento). Solo se invoca cuando esta llamada cerró realmente la
   * asignación, así que no hay riesgo de notificar dos veces ante
   * solicitudes repetidas o una carrera con count: 0. Tarea 34: excluye al
   * actor (líder que se desasigna a sí mismo) antes de notificar.
   */
  private async _notifyUnassignment(
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
