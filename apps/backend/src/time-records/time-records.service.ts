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
