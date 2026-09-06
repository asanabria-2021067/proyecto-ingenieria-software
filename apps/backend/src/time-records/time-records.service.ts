import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

      const nuevoRegistro = await tx.registroTiempoTarea.create({
        data: {
          idAsignacion: asignacionActiva.idAsignacion,
          idUsuario: userId,
          horas: dto.horas,
          fecha: new Date(`${dto.fecha}T00:00:00.000Z`),
          nota: dto.nota ?? null,
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

  async findAllForTask(
    projectId: number,
    taskId: number,
    userId: number,
  ): Promise<RegistroTiempoTareaPublico[]> {
    const tarea = await this.tasksContext.getTaskInProjectOrThrow(projectId, taskId);
    // C049 (§34/§41 E055): la política decide el acceso; el filtro por autor
    // que ya distingue líder de integrante se conserva tal cual.
    await this.readPolicy.assertRead(undefined, {
      projectId,
      actorId: userId,
      scope: 'horas',
      entitySprintId: tarea.idSprint,
    });
    await this.tasksContext.assertActiveProjectParticipant(projectId, userId);

    const proyecto = await this.tasksContext.getProjectOrThrow(projectId);
    const esLider = proyecto.creadoPor === userId;

    const rows = await this.prisma.registroTiempoTarea.findMany({
      where: {
        asignacion: { idTarea: tarea.idTarea },
        ...(esLider ? {} : { idUsuario: userId }),
      },
      orderBy: [{ fecha: 'desc' }, { idRegistroTiempo: 'desc' }],
      select: TIME_RECORD_SELECT,
    });

    return rows.map(mapRegistroTiempo);
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
