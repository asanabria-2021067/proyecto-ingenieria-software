import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TasksContextService } from '../tasks/tasks-context.service';
import { NotificationsService } from '../notifications/notifications.service';
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
 * closeAssignment). Tras cada creación se recalcula
 * AsignacionTarea.horasReales de ese tramo como SUM(RegistroTiempoTarea.horas)
 * dentro de la misma transacción, protegido con `updateMany` +
 * `desasignadaEn: null` (mismo patrón optimista que
 * TasksService.closeAssignment/unassign): si el tramo se cerró entre la
 * lectura y la escritura, la transacción completa se revierte con
 * ConflictException en vez de dejar un registro huérfano o pisar
 * horasReales de un tramo ya inmutable.
 */
@Injectable()
export class TimeRecordsService {
  private readonly logger = new Logger(TimeRecordsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksContext: TasksContextService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(
    projectId: number,
    taskId: number,
    userId: number,
    dto: CreateTimeRecordDto,
  ): Promise<RegistroTiempoTareaPublico> {
    const registro = await this.prisma.$transaction(async (tx) => {
      await this.tasksContext.getTaskInProjectOrThrow(projectId, taskId, tx);

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

      const suma = await tx.registroTiempoTarea.aggregate({
        where: { idAsignacion: asignacionActiva.idAsignacion },
        _sum: { horas: true },
      });

      const actualizado = await tx.asignacionTarea.updateMany({
        where: { idAsignacion: asignacionActiva.idAsignacion, desasignadaEn: null },
        data: { horasReales: suma._sum.horas ?? 0 },
      });

      if (actualizado.count !== 1) {
        throw new ConflictException(
          'El tramo ya fue cerrado; no se pueden registrar más horas sobre él',
        );
      }

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
