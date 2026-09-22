import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EstadoSprint, EstadoTarea, InstantaneaSprint } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * T-238 (HU-160): instantánea diaria del estado de un Sprint activo — única
 * fuente honesta del burndown (T-240). Un burndown dibujado solo con el
 * agregado final es una recta inventada; esto guarda cómo iba el Sprint CADA
 * día.
 *
 * Inmutabilidad estructural: `InstantaneaSprint` tiene
 * `@@unique([idSprint, fecha])`. `generarInstantaneaDelDia` siempre calcula
 * `fecha` como HOY (nunca recibe una fecha del llamador), así que el
 * `upsert` solo puede tocar la fila de hoy — nunca una fecha pasada, sin
 * importar cuántas veces se llame ni si se corrige una tarea vieja después.
 * Eso es lo que hace seguro exponer la regeneración manual (T-238: "la
 * instantánea del día en curso sí se puede regenerar") sin arriesgar el
 * histórico ya tomado.
 */
@Injectable()
export class SprintSnapshotsService {
  private readonly logger = new Logger(SprintSnapshotsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Día calendario UTC de hoy, a medianoche — mismo ancla que `@db.Date` en Postgres. */
  private hoyUTC(): Date {
    const ahora = new Date();
    return new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()));
  }

  /**
   * Calcula el estado ACTUAL del Sprint (tareas no eliminadas) y hace
   * upsert sobre la fila de HOY. `puntosHistoriaRestantes` suma
   * `puntosHistoria` (tratando `null` como 0) únicamente de las tareas NO
   * `HECHO` — es lo que falta por completar, la magnitud que un burndown
   * mide.
   */
  async generarInstantaneaDelDia(sprintId: number): Promise<InstantaneaSprint> {
    const tareas = await this.prisma.tarea.findMany({
      where: { idSprint: sprintId, eliminadoEn: null },
      select: { estadoTarea: true, puntosHistoria: true },
    });

    const pendientes = tareas.filter((tarea) => tarea.estadoTarea !== EstadoTarea.HECHO);
    const tareasCompletadas = tareas.length - pendientes.length;
    const puntosHistoriaRestantes = pendientes.reduce(
      (acumulado, tarea) => acumulado + (tarea.puntosHistoria ?? 0),
      0,
    );

    const fecha = this.hoyUTC();
    return this.prisma.instantaneaSprint.upsert({
      where: { idSprint_fecha: { idSprint: sprintId, fecha } },
      create: {
        idSprint: sprintId,
        fecha,
        tareasPendientes: pendientes.length,
        tareasCompletadas,
        puntosHistoriaRestantes,
      },
      update: {
        tareasPendientes: pendientes.length,
        tareasCompletadas,
        puntosHistoriaRestantes,
      },
    });
  }

  /**
   * Cron diario: genera la instantánea de hoy para TODOS los Sprints
   * `ACTIVO` de todos los proyectos. Un Sprint `EN_FINALIZACION` o `CERRADO`
   * no genera instantáneas nuevas — su histórico ya tomado se conserva tal
   * cual. Si el servidor está caído a esta hora, ese día simplemente queda
   * sin fila (hueco real) en vez de inventarse — así lo pide el AC de T-238.
   * Un fallo en un Sprint no aborta el resto: se registra y se continúa.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async generarInstantaneasDiarias(): Promise<void> {
    const sprintsActivos = await this.prisma.sprint.findMany({
      where: { estado: EstadoSprint.ACTIVO },
      select: { idSprint: true },
    });

    for (const sprint of sprintsActivos) {
      try {
        await this.generarInstantaneaDelDia(sprint.idSprint);
      } catch (error) {
        this.logger.error(
          `No se pudo generar la instantánea diaria del Sprint ${sprint.idSprint}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }
}
