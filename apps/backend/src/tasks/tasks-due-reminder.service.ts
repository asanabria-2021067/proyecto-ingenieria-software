import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EstadoTarea } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

// Mismo huso que is-future-calendar-date.validator.ts y events-reminder.service.ts.
// America/Guatemala no tiene horario de verano: el desfase UTC-6 es fijo
// (igual que metricas-periodos.util.ts).
const GUATEMALA_TIME_ZONE = 'America/Guatemala';
const DESFASE_GUATEMALA_MS = 6 * 60 * 60 * 1000;
const UN_DIA_MS = 24 * 60 * 60 * 1000;

/** Ventanas de HU-186, de la más lejana a la más cercana. */
export const VENTANAS_RECORDATORIO = [48, 24] as const;
export type VentanaRecordatorio = (typeof VENTANAS_RECORDATORIO)[number];

/** Tarea candidata tal como la devuelve la consulta del job. */
export interface TareaPorVencer {
  idTarea: number;
  idProyecto: number;
  tituloTarea: string;
  fechaLimite: Date | null;
  proyecto: { tituloProyecto: string };
  asignaciones: { idUsuario: number }[];
}

/**
 * fechaLimite (@db.Date, medianoche UTC del día calendario — ver
 * tasks.service.ts) que corresponde a cada ventana vista desde `ahora`:
 * 24 h = vence mañana y 48 h = vence pasado mañana, en día calendario de
 * Guatemala. Con un job diario cada tarea cae en una sola ventana por corrida.
 */
export function fechaLimiteParaVentana(ventana: VentanaRecordatorio, ahora: Date): Date {
  const local = new Date(ahora.getTime() - DESFASE_GUATEMALA_MS);
  const hoy = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(hoy + (ventana / 24) * UN_DIA_MS);
}

/**
 * HU-186 (T-329/T-330): job diario que detecta tareas próximas a vencer,
 * registra cada aviso una sola vez y lo emite al responsable por el centro
 * de notificaciones (notifyFromTemplate → notifyUsers). Las preferencias de
 * HU-185 se aplican dentro de notifyUsers: este job no las consulta.
 *
 * Responsable = AsignacionTarea vigente (desasignadaEn null; PostgreSQL
 * garantiza a lo sumo una por tarea). Nunca entran tareas HECHO, eliminadas
 * o de proyectos eliminados: el filtro está en la consulta.
 *
 * "Una sola vez" lo garantiza `recordatorio_tarea` (@@unique idTarea +
 * ventanaHoras): el aviso se reserva con INSERT ... ON CONFLICT DO NOTHING
 * antes de emitirlo, así que dos corridas concurrentes no lo duplican. Si
 * la emisión falla se libera la reserva para reintentar en la próxima
 * corrida. Un día sin corrida (servidor caído) es un aviso perdido, no se
 * recupera — igual que los huecos de SprintSnapshotsService.
 */
@Injectable()
export class TasksDueReminderService {
  private readonly logger = new Logger(TasksDueReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM, { timeZone: GUATEMALA_TIME_ZONE })
  async enviarRecordatoriosDeVencimiento(): Promise<void> {
    const ahora = new Date();
    for (const ventana of VENTANAS_RECORDATORIO) {
      const candidatas = await this.prisma.tarea.findMany({
        where: {
          fechaLimite: fechaLimiteParaVentana(ventana, ahora),
          estadoTarea: { not: EstadoTarea.HECHO },
          eliminadoEn: null,
          proyecto: { eliminadoEn: null },
          asignaciones: { some: { desasignadaEn: null } },
          recordatorios: { none: { ventanaHoras: ventana } },
        },
        select: {
          idTarea: true,
          idProyecto: true,
          tituloTarea: true,
          fechaLimite: true,
          proyecto: { select: { tituloProyecto: true } },
          asignaciones: { where: { desasignadaEn: null }, select: { idUsuario: true }, take: 1 },
        },
      });

      for (const tarea of candidatas) {
        await this.procesarAviso(tarea, ventana);
      }
    }
  }

  private async procesarAviso(tarea: TareaPorVencer, ventana: VentanaRecordatorio): Promise<void> {
    const responsable = tarea.asignaciones[0]?.idUsuario;
    if (responsable === undefined || tarea.fechaLimite === null) return;

    let reservado = false;
    try {
      const reserva = await this.prisma.recordatorioTarea.createMany({
        data: [{ idTarea: tarea.idTarea, ventanaHoras: ventana }],
        skipDuplicates: true,
      });
      if (reserva.count === 0) return; // otra corrida ya lo envió
      reservado = true;

      await this.emitirRecordatorio(tarea, ventana, responsable);
    } catch (error) {
      this.logger.warn(
        `Fallo al enviar el recordatorio de ${ventana} h de la tarea ${tarea.idTarea}: ${(error as Error)?.message ?? error}`,
      );
      // Solo se libera la reserva propia: si falló el INSERT, la fila (si
      // existe) es de otra corrida y borrarla permitiría un duplicado.
      if (reservado) await this.liberarReserva(tarea.idTarea, ventana);
    }
  }

  private async liberarReserva(idTarea: number, ventana: VentanaRecordatorio): Promise<void> {
    try {
      await this.prisma.recordatorioTarea.deleteMany({ where: { idTarea, ventanaHoras: ventana } });
    } catch (error) {
      this.logger.warn(
        `No se pudo liberar el recordatorio de ${ventana} h de la tarea ${idTarea}; no se reintentará: ${(error as Error)?.message ?? error}`,
      );
    }
  }

  /**
   * T-330: emisión por el centro de notificaciones. Si el responsable
   * desactivó TAREA_POR_VENCER (HU-185), notifyUsers no guarda ni emite nada
   * y el aviso igualmente queda registrado: no se reintenta cada día.
   */
  protected async emitirRecordatorio(
    tarea: TareaPorVencer,
    ventana: VentanaRecordatorio,
    responsable: number,
  ): Promise<void> {
    if (tarea.fechaLimite === null) return;
    await this.notifications.notifyFromTemplate([responsable], 'TAREA_POR_VENCER', {
      taskTitle: tarea.tituloTarea,
      projectTitle: tarea.proyecto.tituloProyecto,
      taskId: tarea.idTarea,
      projectId: tarea.idProyecto,
      horasAntes: ventana,
      // timeZone UTC: fechaLimite es medianoche UTC del día calendario.
      fechaLimiteTexto: tarea.fechaLimite.toLocaleDateString('es-GT', { dateStyle: 'long', timeZone: 'UTC' }),
    });
  }
}
