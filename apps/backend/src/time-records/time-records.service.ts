import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EstadoProyecto, EstadoSprint, Prisma, type OrigenReporteTramo } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TasksContextService } from '../tasks/tasks-context.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ProjectTransactionService,
  type ProjectLockRow,
  type ProjectTransactionContext,
} from '../common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../common/project-policy/project-policy.service';
import { ProjectReadPolicyService } from '../common/project-policy/project-read-policy.service';
import { BitacoraEventosService } from '../bitacora/bitacora-eventos.service';
import { TipoEventoBitacora } from '../bitacora/tipos-evento-bitacora';
import { CreateTimeRecordDto } from './dto/create-time-record.dto';
import { UPDATE_TIME_RECORD_FIELDS, UpdateTimeRecordDto } from './dto/update-time-record.dto';

/**
 * C062 (06 v2 §9 REVOKE): una segunda revocación no es un error del cliente
 * ni una operación idempotente silenciosa — es un conflicto explícito con
 * código estable, para que quien lo reciba distinga «ya estaba revocado» de
 * cualquier otro 409 del tramo.
 */
export const REGISTRO_YA_REVOCADO_CODE = 'REGISTRO_YA_REVOCADO';

const TIME_RECORD_SELECT = {
  idRegistroTiempo: true,
  idAsignacion: true,
  idUsuario: true,
  horas: true,
  fecha: true,
  nota: true,
  creadoEn: true,
  usuario: {
    select: { idUsuario: true, nombre: true, apellido: true, fotoUrl: true },
  },
} satisfies Prisma.RegistroTiempoTareaSelect;

type TimeRecordRow = Prisma.RegistroTiempoTareaGetPayload<{ select: typeof TIME_RECORD_SELECT }>;

interface UsuarioResumenPublico {
  idUsuario: number;
  nombre: string;
  apellido: string;
  fotoUrl: string | null;
}

export interface RegistroTiempoTareaPublico {
  idRegistroTiempo: number;
  idAsignacion: number;
  idUsuario: number;
  horas: number;
  fecha: string;
  nota: string | null;
  creadoEn: Date;
  usuario: UsuarioResumenPublico;
}

/**
 * `fecha` es @db.Date: Prisma la devuelve como Date a medianoche UTC del día
 * calendario almacenado — mismo comportamiento ya documentado y verificado
 * en TasksService.toDateOnly (tasks.service.ts). Reutiliza exactamente esa
 * misma extracción vía toISOString() (nunca getters locales, que pueden
 * desplazar el día según la zona horaria del proceso).
 */
function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Prisma serializa Decimal a JSON como string (Decimal.js#toJSON), no como
 * number — sin esta conversión explícita, el frontend recibe "horas" como
 * string y una suma ingenua (`total + registro.horas`) concatena en vez de
 * sumar. Misma convención `.toNumber()` ya usada en todo el resto del
 * backend para exponer campos Decimal (ver TeamService, ExitRequestsService,
 * HoursRecognitionService).
 */
function mapRegistroTiempo(row: TimeRecordRow): RegistroTiempoTareaPublico {
  return {
    idRegistroTiempo: row.idRegistroTiempo,
    idAsignacion: row.idAsignacion,
    idUsuario: row.idUsuario,
    horas: row.horas.toNumber(),
    fecha: toDateOnly(row.fecha),
    nota: row.nota,
    creadoEn: row.creadoEn,
    usuario: row.usuario,
  };
}

/**
 * C067 (06 v2 §46 TaskHoursSummary + §8): proyección de lectura de las horas
 * de una tarea. Los importes viajan como string decimal de dos posiciones —
 * nunca como number — para que ningún consumidor pierda escala por el camino.
 *
 * `horasLegacyNoGranulares` existe precisamente para NO hacer pasar un importe
 * histórico sin registros por una suma de RegistroTiempoTarea: se informa
 * aparte y no participa en la regla de sobreestimación de §10.
 */
export interface TramoHorasResumen {
  idAsignacion: number;
  usuario: UsuarioResumenPublico;
  idParticipacion: number | null;
  rolHistorico: { idRolProyecto: number; nombreRol: string } | null;
  abierto: boolean;
  origen: OrigenReporteTramo;
  /** SUM de registros efectivos de ESTE tramo. Un tramo LEGACY reporta 0.00. */
  reportadas: string;
  /** Delta del ajuste vigente del líder, o null si no hay ninguno. */
  ajuste: string | null;
  /** Caché del tramo + delta vigente (06 v2 §8). */
  propuestas: string;
  reconocidoEn: Date | null;
  /** Justificaciones de exceso de los registros que este lector puede ver. */
  justificaciones: string[];
}

export interface TaskHoursSummary {
  taskId: number;
  sprintId: number;
  estimacion: number | null;
  horasReportadasTarea: string;
  horasLegacyNoGranulares: string;
  restantes: string | null;
  sobreEstimacion: string | null;
  puedeCrear: boolean;
  puedeEditar: boolean;
  puedeRevocar: boolean;
  tramos: TramoHorasResumen[];
}

/**
 * C065 (06 v2 §10): la obligación de justificar es EXACTA — solo la operación
 * que cruza el umbral la exige: `antes <= estimación AND después > estimación`.
 * Con estimación nula no hay umbral y nunca se exige nada. Una reducción o una
 * revocación jamás pueden cumplir el predicado, así que corregir a la baja
 * nunca queda bloqueado.
 */
function crossesEstimate(
  antes: Prisma.Decimal,
  despues: Prisma.Decimal,
  estimacion: number | null,
): boolean {
  if (estimacion === null) {
    return false;
  }
  const umbral = new Prisma.Decimal(estimacion);
  return antes.lte(umbral) && despues.gt(umbral);
}

/**
 * C065 (06 v2 §10): indicadores derivados del total efectivo. Sin estimación
 * no existe ni restante ni exceso — son `null`, nunca `0`, porque «no hay
 * umbral» y «el umbral se cumple justo» son estados distintos.
 */
export function computeHoursIndicators(total: Prisma.Decimal, estimacion: number | null) {
  if (estimacion === null) {
    return { total, restantes: null, sobreEstimacion: null };
  }
  const umbral = new Prisma.Decimal(estimacion);
  return {
    total,
    restantes: Prisma.Decimal.max(umbral.minus(total), 0),
    sobreEstimacion: Prisma.Decimal.max(total.minus(umbral), 0),
  };
}

/**
 * C061 (06 v2 §9 UPDATE): la bitácora de una edición debe mostrar el antes y
 * el después completos del registro, no solo los campos enviados. Decimal se
 * serializa con toFixed(2) para que el detalle JSON conserve la escala
 * contractual en vez de depender de la representación de Decimal.js.
 */
function snapshotRegistro(row: {
  horas: Prisma.Decimal;
  fecha: Date;
  nota: string | null;
  justificacionExceso: string | null;
  editadoEn: Date | null;
}) {
  return {
    horas: row.horas.toFixed(2),
    fecha: toDateOnly(row.fecha),
    nota: row.nota,
    justificacionExceso: row.justificacionExceso,
    editadoEn: row.editadoEn?.toISOString() ?? null,
  };
}

/**
 * HU-142 (T-170): tabla aditiva RegistroTiempoTarea. Cada registro se crea
 * exclusivamente sobre el tramo ACTIVO de la tarea (AsignacionTarea con
 * desasignadaEn: null) y por el propio usuario asignado — nunca el líder ni
 * un tercero, y nunca sobre un tramo ya cerrado (misma inmutabilidad que
 * closeAssignment). El lock del proyecto serializa altas y cierres.
 * recalculateAssignment materializa la suma efectiva en la transacción
 * del caller, sin reabrir tramos ni sobrescribir reportes históricos.
 */
@Injectable()
export class TimeRecordsService {
  private readonly logger = new Logger(TimeRecordsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksContext: TasksContextService,
    private readonly notifications: NotificationsService,
    private readonly projectTx: ProjectTransactionService,
    private readonly policy: ProjectPolicyService,
    private readonly readPolicy: ProjectReadPolicyService,
    // Opcional por el mismo motivo que en Tasks/Sprints: las suites existentes
    // construyen el servicio con argumentos posicionales; en producción
    // TimeRecordsModule siempre lo provee vía BitacoraModule.
    private readonly bitacoraEventos?: BitacoraEventosService,
  ) {}

  private lockedProject(ctx: Pick<ProjectTransactionContext, 'project'>): ProjectLockRow {
    if (!ctx.project) {
      throw new NotFoundException('Proyecto no encontrado');
    }
    return ctx.project;
  }

  async recalculateAssignment(tx: Prisma.TransactionClient, idAsignacion: number): Promise<Prisma.Decimal> {
    const assignment = await tx.asignacionTarea.findUniqueOrThrow({
      where: { idAsignacion },
      select: { origenReporte: true, horasReales: true, reconocidoEn: true },
    });
    if (assignment.origenReporte === 'POR_CONCILIAR' || assignment.reconocidoEn !== null) {
      throw new ConflictException('El tramo requiere conciliación o ya fue consumido');
    }
    if (assignment.origenReporte === 'LEGACY') {
      if (assignment.horasReales === null) {
        throw new ConflictException('El tramo legacy carece de importe histórico');
      }
      return assignment.horasReales;
    }
    const sum = await tx.registroTiempoTarea.aggregate({
      where: { idAsignacion, revocadoEn: null },
      _sum: { horas: true },
    });
    const hours = new Prisma.Decimal(sum._sum.horas ?? 0);
    if (hours.isNegative() || hours.gt('9999999999.99')) {
      throw new BadRequestException('El total de horas excede el dominio del agregado');
    }
    const updated = await tx.asignacionTarea.updateMany({
      where: { idAsignacion, origenReporte: 'GRANULAR', reconocidoEn: null },
      data: { horasReales: hours },
    });
    if (updated.count !== 1) {
      throw new ConflictException('El tramo cambió durante el recálculo');
    }
    return hours;
  }

  async normalizeClosedGranularTx(
    tx: Prisma.TransactionClient,
    scope: { projectId: number; sprintId: number },
  ): Promise<void> {
    const assignments = await tx.asignacionTarea.findMany({
      where: {
        tarea: { idProyecto: scope.projectId, idSprint: scope.sprintId },
        desasignadaEn: { not: null },
        reconocidoEn: null,
        origenReporte: 'GRANULAR',
        horasReales: null,
        registrosTiempo: { none: { revocadoEn: null } },
      },
      select: { idAsignacion: true },
    });
    for (const assignment of assignments) {
      await this.recalculateAssignment(tx, assignment.idAsignacion);
    }
  }

  async create(
    projectId: number,
    taskId: number,
    userId: number,
    dto: CreateTimeRecordDto,
  ): Promise<RegistroTiempoTareaPublico> {
    const registro = await this.projectTx.run(projectId, userId, 'time-records.create', async (ctx) => {
      const { tx } = ctx;
      // C049 (§9): las precondiciones y la suma efectiva ocurren DESPUÉS del
      // lock del proyecto, así que dos registros concurrentes ven un orden
      // completo en vez de competir por la misma caché del tramo.
      const tarea = await this.tasksContext.getTaskInProjectOrThrow(projectId, taskId, tx);

      const asignacionActiva = await this.tasksContext.getActiveAssignment(taskId, tx);
      if (!asignacionActiva) {
        throw new BadRequestException(
          'La tarea no tiene una asignación activa sobre la cual registrar horas',
        );
      }
      if (asignacionActiva.idUsuario !== userId) {
        throw new ForbiddenException('Solo el usuario asignado puede registrar horas en esta tarea');
      }

      await this.tasksContext.assertActiveProjectParticipant(projectId, userId, tx);
      await this.policy.assertWriteTx(tx, this.lockedProject(ctx), 'REGISTRO_TIEMPO', userId, {
        sprintId: tarea?.idSprint ?? null,
      });

      const assignment = await tx.asignacionTarea.findUniqueOrThrow({
        where: { idAsignacion: asignacionActiva.idAsignacion },
        select: { origenReporte: true, reconocidoEn: true, desasignadaEn: true },
      });
      if (assignment.origenReporte !== 'GRANULAR' || assignment.reconocidoEn !== null || assignment.desasignadaEn !== null) {
        throw new ConflictException('El tramo no admite nuevos registros granulares');
      }

      // §10: el umbral se evalúa DESPUÉS del lock, contra el total efectivo
      // real de la tarea en esta misma vista, nunca contra un total leído antes.
      const antes = await this.sumTaskEffectiveTx(tx, taskId);
      const justificacion = dto.justificacionExceso?.trim() ?? null;
      this.assertExcessJustification(
        antes,
        antes.plus(dto.horas),
        tarea.tiempoEstimadoHoras ?? null,
        justificacion,
      );

      const nuevoRegistro = await tx.registroTiempoTarea.create({
        data: {
          idAsignacion: asignacionActiva.idAsignacion,
          idUsuario: userId,
          horas: dto.horas,
          fecha: new Date(`${dto.fecha}T00:00:00.000Z`),
          nota: dto.nota ?? null,
          justificacionExceso: justificacion,
        },
        select: TIME_RECORD_SELECT,
      });

      await this.recalculateAssignment(tx, asignacionActiva.idAsignacion);

      // C049: el evento se persiste en la MISMA transacción que el registro;
      // si algo posterior falla, no queda un evento huérfano.
      await this.bitacoraEventos?.registrarEvento({
        tx,
        tipoEvento: TipoEventoBitacora.TASK_HOURS_LOGGED,
        idActor: userId,
        idProyecto: projectId,
        idSprint: tarea?.idSprint ?? null,
        tipoEntidad: 'TAREA',
        idEntidad: taskId,
        valorNuevo: {
          idAsignacion: asignacionActiva.idAsignacion,
          idRegistroTiempo: nuevoRegistro.idRegistroTiempo,
          horas: dto.horas,
        },
      });

      return mapRegistroTiempo(nuevoRegistro);
    });

    await this.notifyHoursLogged(projectId, taskId, userId, registro);

    return registro;
  }

  /**
   * C065 (06 v2 §10): total efectivo de la TAREA, no del tramo — la
   * sobreestimación se mide contra todo lo acumulado por cualquier persona en
   * cualquier tramo. Se excluyen los revocados por el filtro y los ajustes del
   * líder por construcción: viven en AjusteHoraTarea, otra tabla. Los tramos
   * LEGACY tampoco entran, porque no tienen registros granulares que sumar.
   */
  private async sumTaskEffectiveTx(
    tx: Prisma.TransactionClient,
    taskId: number,
  ): Promise<Prisma.Decimal> {
    const sum = await tx.registroTiempoTarea.aggregate({
      where: { asignacion: { idTarea: taskId }, revocadoEn: null },
      _sum: { horas: true },
    });
    return new Prisma.Decimal(sum._sum.horas ?? 0);
  }

  /**
   * C065 (06 v2 §10): exige texto solo a la operación que cruza. El texto ya
   * llega recortado por el DTO; aquí se vuelve a comprobar porque el servicio
   * también se invoca desde suites que no pasan por el ValidationPipe, y una
   * justificación en blanco no es una justificación.
   */
  private assertExcessJustification(
    antes: Prisma.Decimal,
    despues: Prisma.Decimal,
    estimacion: number | null,
    justificacion: string | null | undefined,
  ): void {
    if (!crossesEstimate(antes, despues, estimacion)) {
      return;
    }
    if (typeof justificacion !== 'string' || justificacion.trim().length === 0) {
      throw new BadRequestException(
        'Este registro cruza la estimación de la tarea: se requiere justificacionExceso',
      );
    }
  }

  /**
   * C062 (06 v2 §9): precondiciones comunes de UPDATE y REVOKE, resueltas
   * SIEMPRE dentro del lock y SIEMPRE por la cadena del propio registro.
   * El orden importa: primero existencia, después autoría (403 al ajeno antes
   * de revelar el estado del tramo), después participación y política, y solo
   * al final el estado del tramo. El registro puede pertenecer a un tramo ya
   * cerrado; lo que lo bloquea es estar consumido, no estar cerrado.
   */
  private async assertRecordOwnerTx(
    tx: Prisma.TransactionClient,
    project: ProjectLockRow,
    tarea: { idTarea: number; idSprint: number },
    recordId: number,
    userId: number,
  ) {
    const actual = await tx.registroTiempoTarea.findFirst({
      where: { idRegistroTiempo: recordId, asignacion: { idTarea: tarea.idTarea } },
      select: {
        idRegistroTiempo: true,
        idAsignacion: true,
        idUsuario: true,
        horas: true,
        fecha: true,
        nota: true,
        justificacionExceso: true,
        editadoEn: true,
        revocadoEn: true,
      },
    });
    if (!actual) {
      throw new NotFoundException(
        `Registro de tiempo con id ${recordId} no encontrado en la tarea ${tarea.idTarea}`,
      );
    }
    if (actual.idUsuario !== userId) {
      throw new ForbiddenException('Solo el autor puede operar sobre su propio registro de horas');
    }
    if (actual.revocadoEn !== null) {
      throw new ConflictException({
        statusCode: 409,
        code: REGISTRO_YA_REVOCADO_CODE,
        message: 'El registro de tiempo ya estaba revocado',
      });
    }

    await this.tasksContext.assertActiveProjectParticipant(project.idProyecto, userId, tx);
    await this.policy.assertWriteTx(tx, project, 'REGISTRO_TIEMPO', userId, {
      sprintId: tarea.idSprint,
    });

    const assignment = await tx.asignacionTarea.findUniqueOrThrow({
      where: { idAsignacion: actual.idAsignacion },
      select: { origenReporte: true, reconocidoEn: true },
    });
    if (assignment.origenReporte !== 'GRANULAR' || assignment.reconocidoEn !== null) {
      throw new ConflictException('El tramo no admite cambios sobre sus registros');
    }

    return actual;
  }

  /**
   * C061 (06 v2 §9 UPDATE / §41 E057): el registro se resuelve por su propia
   * cadena registro→asignación→tarea→proyecto y NUNCA por
   * `getActiveAssignment`. Ese es el punto del contrato: el autor corrige un
   * registro de un tramo ya cerrado aunque la tarea esté hoy asignada a otra
   * persona. El tramo no se reabre, `desasignadaEn` no se toca y solo se
   * recalcula la caché de ese tramo.
   */
  async update(
    projectId: number,
    taskId: number,
    recordId: number,
    userId: number,
    dto: UpdateTimeRecordDto,
  ): Promise<RegistroTiempoTareaPublico> {
    const huboCampoEnviado = UPDATE_TIME_RECORD_FIELDS.some((campo) =>
      Object.prototype.hasOwnProperty.call(dto, campo),
    );
    if (!huboCampoEnviado) {
      throw new BadRequestException('Debe enviar al menos un campo para actualizar el registro');
    }

    const registro = await this.projectTx.run(projectId, userId, 'time-records.update', async (ctx) => {
      const { tx } = ctx;
      const tarea = await this.tasksContext.getTaskInProjectOrThrow(projectId, taskId, tx);

      const actual = await this.assertRecordOwnerTx(tx, this.lockedProject(ctx), tarea, recordId, userId);

      // §10 tabla UPDATE: «antes» es el total efectivo actual, que YA incluye
      // el importe vigente de este registro; «después» lo sustituye por el
      // nuevo. Así, bajar un importe nunca puede cruzar el umbral y por tanto
      // nunca exige una justificación nueva. La justificación vigente cuenta
      // como texto válido cuando el DTO no envía una: §9 la conserva.
      const antes = await this.sumTaskEffectiveTx(tx, taskId);
      const nuevasHoras = dto.horas !== undefined ? new Prisma.Decimal(dto.horas) : actual.horas;
      this.assertExcessJustification(
        antes,
        antes.minus(actual.horas).plus(nuevasHoras),
        tarea.tiempoEstimadoHoras ?? null,
        dto.justificacionExceso ?? actual.justificacionExceso,
      );

      const actualizado = await tx.registroTiempoTarea.update({
        where: { idRegistroTiempo: actual.idRegistroTiempo },
        data: {
          ...(dto.horas !== undefined ? { horas: dto.horas } : {}),
          ...(dto.fecha !== undefined ? { fecha: new Date(`${dto.fecha}T00:00:00.000Z`) } : {}),
          ...(dto.nota !== undefined ? { nota: dto.nota } : {}),
          ...(dto.justificacionExceso !== undefined
            ? { justificacionExceso: dto.justificacionExceso }
            : {}),
          editadoEn: new Date(),
        },
        select: { ...TIME_RECORD_SELECT, justificacionExceso: true, editadoEn: true },
      });

      await this.recalculateAssignment(tx, actual.idAsignacion);

      await this.bitacoraEventos?.registrarEvento({
        tx,
        tipoEvento: TipoEventoBitacora.TIME_RECORD_EDITED,
        idActor: userId,
        idProyecto: projectId,
        idSprint: tarea.idSprint,
        tipoEntidad: 'TAREA',
        idEntidad: taskId,
        valorAnterior: {
          idAsignacion: actual.idAsignacion,
          idRegistroTiempo: actual.idRegistroTiempo,
          ...snapshotRegistro(actual),
        },
        valorNuevo: {
          idAsignacion: actualizado.idAsignacion,
          idRegistroTiempo: actualizado.idRegistroTiempo,
          ...snapshotRegistro(actualizado),
        },
      });

      return mapRegistroTiempo(actualizado);
    });

    await this.notifyHoursLogged(projectId, taskId, userId, registro);

    return registro;
  }

  /**
   * C062 (06 v2 §9 REVOKE / §41 E058): revocación LÓGICA. Nunca hay DELETE
   * físico: el importe, la fecha, la nota y la justificación se conservan
   * como evidencia y lo único que cambia es que la fila deja de contar en el
   * SUM efectivo. El `updateMany` con `revocadoEn: null` es el compare-and-set
   * que hace que dos revocaciones simultáneas produzcan un solo evento.
   */
  async revoke(
    projectId: number,
    taskId: number,
    recordId: number,
    userId: number,
  ): Promise<RegistroTiempoTareaPublico> {
    const registro = await this.projectTx.run(projectId, userId, 'time-records.revoke', async (ctx) => {
      const { tx } = ctx;
      const tarea = await this.tasksContext.getTaskInProjectOrThrow(projectId, taskId, tx);
      const actual = await this.assertRecordOwnerTx(tx, this.lockedProject(ctx), tarea, recordId, userId);

      // §10 tabla REVOKE: «después» = «antes» − el importe revocado. Una
      // revocación solo puede bajar el total, así que el predicado de cruce
      // jamás se cumple; se evalúa igual para que la regla viva en un solo
      // sitio y no por omisión.
      const antes = await this.sumTaskEffectiveTx(tx, taskId);
      this.assertExcessJustification(
        antes,
        antes.minus(actual.horas),
        tarea.tiempoEstimadoHoras ?? null,
        actual.justificacionExceso,
      );

      const revocadoEn = new Date();
      const cas = await tx.registroTiempoTarea.updateMany({
        where: { idRegistroTiempo: actual.idRegistroTiempo, revocadoEn: null },
        // CK03: el revocador es siempre el autor, nunca un tercero.
        data: { revocadoEn, revocadoPor: userId },
      });
      if (cas.count !== 1) {
        throw new ConflictException({
          statusCode: 409,
          code: REGISTRO_YA_REVOCADO_CODE,
          message: 'El registro de tiempo ya estaba revocado',
        });
      }

      const revocado = await tx.registroTiempoTarea.findUniqueOrThrow({
        where: { idRegistroTiempo: actual.idRegistroTiempo },
        select: { ...TIME_RECORD_SELECT, justificacionExceso: true, editadoEn: true },
      });

      await this.recalculateAssignment(tx, actual.idAsignacion);

      await this.bitacoraEventos?.registrarEvento({
        tx,
        tipoEvento: TipoEventoBitacora.TIME_RECORD_REVOKED,
        idActor: userId,
        idProyecto: projectId,
        idSprint: tarea.idSprint,
        tipoEntidad: 'TAREA',
        idEntidad: taskId,
        valorAnterior: {
          idAsignacion: actual.idAsignacion,
          idRegistroTiempo: actual.idRegistroTiempo,
          ...snapshotRegistro(actual),
        },
        valorNuevo: {
          idAsignacion: revocado.idAsignacion,
          idRegistroTiempo: revocado.idRegistroTiempo,
          ...snapshotRegistro(revocado),
          revocadoEn: revocadoEn.toISOString(),
          revocadoPor: userId,
        },
      });

      return mapRegistroTiempo(revocado);
    });

    await this.notifyHoursLogged(projectId, taskId, userId, registro);

    return registro;
  }

  /**
   * C067 (06 v2 §9/§34/§41 E055): la visibilidad la decide el PERFIL que
   * devuelve la política, no una comparación local con `creadoPor`. Los
   * registros revocados no se filtran: el autor ve los suyos y el líder los ve
   * todos, porque una revocación es evidencia conservada, no una fila borrada.
   */
  async findAllForTask(
    projectId: number,
    taskId: number,
    userId: number,
  ): Promise<RegistroTiempoTareaPublico[]> {
    const tarea = await this.tasksContext.getTaskInProjectOrThrow(projectId, taskId);
    const decision = await this.readPolicy.assertRead(undefined, {
      projectId,
      actorId: userId,
      scope: 'horas',
      entitySprintId: tarea.idSprint,
    });

    const rows = await this.prisma.registroTiempoTarea.findMany({
      where: {
        asignacion: { idTarea: tarea.idTarea },
        ...(this.seesEveryRecord(decision) ? {} : { idUsuario: userId }),
      },
      orderBy: [{ fecha: 'desc' }, { idRegistroTiempo: 'desc' }],
      select: TIME_RECORD_SELECT,
    });

    return rows.map(mapRegistroTiempo);
  }

  /** Solo el líder actual y el administrador leen los registros de terceros. */
  private seesEveryRecord(decision: { profile: string }): boolean {
    return decision.profile === 'LIDER' || decision.profile === 'ADMIN';
  }

  /**
   * C067 (06 v2 §46 TaskHoursSummary / §41 E059): captura de lectura de las
   * horas de una tarea. No escribe nada: los indicadores se derivan del estado
   * actual, de modo que subir la estimación a mano recalcula el restante y el
   * exceso sin inventar ninguna obligación retroactiva ni tocar una
   * justificación ya almacenada.
   */
  async getTaskHoursSummary(
    projectId: number,
    taskId: number,
    userId: number,
  ): Promise<TaskHoursSummary> {
    const tarea = await this.tasksContext.getTaskInProjectOrThrow(projectId, taskId);
    const decision = await this.readPolicy.assertRead(undefined, {
      projectId,
      actorId: userId,
      scope: 'horas',
      entitySprintId: tarea.idSprint,
    });
    const verTodo = this.seesEveryRecord(decision);

    const [tramos, sprintAmbiente, sprintEntidad] = await Promise.all([
      this.prisma.asignacionTarea.findMany({
        where: { idTarea: tarea.idTarea },
        orderBy: { idAsignacion: 'asc' },
        select: {
          idAsignacion: true,
          idParticipacion: true,
          desasignadaEn: true,
          origenReporte: true,
          horasReales: true,
          reconocidoEn: true,
          idUsuario: true,
          usuario: { select: { idUsuario: true, nombre: true, apellido: true, fotoUrl: true } },
          participacion: {
            select: { rolProyecto: { select: { idRolProyecto: true, nombreRol: true } } },
          },
          registrosTiempo: {
            select: { idUsuario: true, horas: true, revocadoEn: true, justificacionExceso: true },
          },
          ajustes: {
            where: { anuladoEn: null },
            select: { deltaHoras: true },
          },
        },
      }),
      this.prisma.sprint.findFirst({
        where: { idProyecto: projectId, estado: { in: [EstadoSprint.ACTIVO, EstadoSprint.EN_FINALIZACION] } },
        select: { estado: true },
      }),
      this.prisma.sprint.findUnique({ where: { idSprint: tarea.idSprint }, select: { estado: true } }),
    ]);

    let reportadasTarea = new Prisma.Decimal(0);
    let legacy = new Prisma.Decimal(0);
    const proyeccion: TramoHorasResumen[] = tramos.map((tramo) => {
      const efectivos = tramo.registrosTiempo.filter((registro) => registro.revocadoEn === null);
      const reportadas = efectivos.reduce((acc, registro) => acc.plus(registro.horas), new Prisma.Decimal(0));
      reportadasTarea = reportadasTarea.plus(reportadas);
      if (tramo.origenReporte === 'LEGACY') {
        legacy = legacy.plus(tramo.horasReales ?? 0);
      }
      const delta = tramo.ajustes[0]?.deltaHoras ?? null;
      const cache = tramo.horasReales ?? new Prisma.Decimal(0);
      return {
        idAsignacion: tramo.idAsignacion,
        usuario: tramo.usuario,
        idParticipacion: tramo.idParticipacion,
        rolHistorico: tramo.participacion?.rolProyecto ?? null,
        abierto: tramo.desasignadaEn === null,
        origen: tramo.origenReporte,
        reportadas: reportadas.toFixed(2),
        ajuste: delta ? delta.toFixed(2) : null,
        propuestas: cache.plus(delta ?? 0).toFixed(2),
        reconocidoEn: tramo.reconocidoEn,
        justificaciones: tramo.registrosTiempo
          .filter((registro) => verTodo || registro.idUsuario === userId)
          .map((registro) => registro.justificacionExceso)
          .filter((texto): texto is string => texto !== null),
      };
    });

    // §10: el legacy NO entra en los indicadores de sobreestimación.
    const indicadores = computeHoursIndicators(reportadasTarea, tarea.tiempoEstimadoHoras ?? null);
    const ventanaAbierta =
      (decision.project.estadoProyecto === EstadoProyecto.PUBLICADO ||
        decision.project.estadoProyecto === EstadoProyecto.EN_PROGRESO) &&
      sprintAmbiente?.estado === EstadoSprint.ACTIVO &&
      sprintEntidad?.estado === EstadoSprint.ACTIVO;
    const tramoPropioAbierto = tramos.some(
      (tramo) =>
        tramo.idUsuario === userId &&
        tramo.desasignadaEn === null &&
        tramo.origenReporte === 'GRANULAR' &&
        tramo.reconocidoEn === null,
    );
    const registroPropioMutable = tramos.some(
      (tramo) =>
        tramo.origenReporte === 'GRANULAR' &&
        tramo.reconocidoEn === null &&
        tramo.registrosTiempo.some(
          (registro) => registro.idUsuario === userId && registro.revocadoEn === null,
        ),
    );

    return {
      taskId: tarea.idTarea,
      sprintId: tarea.idSprint,
      estimacion: tarea.tiempoEstimadoHoras ?? null,
      horasReportadasTarea: reportadasTarea.toFixed(2),
      horasLegacyNoGranulares: legacy.toFixed(2),
      restantes: indicadores.restantes?.toFixed(2) ?? null,
      sobreEstimacion: indicadores.sobreEstimacion?.toFixed(2) ?? null,
      puedeCrear: ventanaAbierta && tramoPropioAbierto,
      puedeEditar: ventanaAbierta && registroPropioMutable,
      puedeRevocar: ventanaAbierta && registroPropioMutable,
      tramos: proyeccion,
    };
  }

  /**
   * Post-commit, igual que _notifyAssignment/_notifyUnassignment en
   * TasksService: un fallo al emitir el evento realtime nunca debe afectar
   * la respuesta de creación (ya exitosa) — se registra con Logger y no se
   * relanza.
   */
  private async notifyHoursLogged(
    projectId: number,
    taskId: number,
    actorUserId: number,
    registro: RegistroTiempoTareaPublico,
  ): Promise<void> {
    try {
      await this.notifications.notifyTaskHoursLogged(projectId, actorUserId, {
        projectId,
        taskId,
        idAsignacion: registro.idAsignacion,
      });
    } catch (error) {
      this.logger.error(
        `No se pudo emitir el evento TASK_HOURS_LOGGED para la tarea ${taskId}`,
        error as Error,
      );
    }
  }
}
