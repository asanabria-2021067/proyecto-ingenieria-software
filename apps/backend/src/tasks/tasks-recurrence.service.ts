import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EstadoSprint, EstadoTarea } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BitacoraEventosService } from '../bitacora/bitacora-eventos.service';
import { TipoEventoBitacora } from '../bitacora/tipos-evento-bitacora';
import { sumarRepeticion, syncHitoEstado } from './tasks-writes.helpers';

// Mismo huso fijo que TasksDueReminderService (America/Guatemala no tiene horario de verano).
const GUATEMALA_TIME_ZONE = 'America/Guatemala';
const DESFASE_GUATEMALA_MS = 6 * 60 * 60 * 1000;

/** Medianoche UTC del dia calendario de Guatemala de `ahora` (formato de fechaLimite @db.Date). */
export function hoyGuatemala(ahora: Date): Date {
  const local = new Date(ahora.getTime() - DESFASE_GUATEMALA_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

/**
 * MEJ-47: job diario que crea la siguiente copia de cada tarea repetitiva
 * (diaria, semanal o mensual) dentro del Sprint ACTIVO del proyecto. La
 * maestra conserva `repeticionProxima`; reservarla con un UPDATE condicional
 * (valor leido) garantiza una sola copia por ocurrencia aunque dos corridas
 * se crucen. Si el proyecto no tiene Sprint activo no se avanza y la copia se
 * crea en la primera corrida con Sprint. Las ocurrencias perdidas (servidor
 * caido) no se acumulan: se crea una sola copia y la proxima salta a futuro.
 */
@Injectable()
export class TasksRecurrenceService {
  private readonly logger = new Logger(TasksRecurrenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bitacoraEventos: BitacoraEventosService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_6AM, { timeZone: GUATEMALA_TIME_ZONE })
  async generarTareasRepetitivas(ahora = new Date()): Promise<number> {
    const hoy = hoyGuatemala(ahora);
    const maestras = await this.prisma.tarea.findMany({
      where: {
        repeticion: { not: null },
        repeticionProxima: { lte: hoy },
        eliminadoEn: null,
        // Una maestra HECHO en un Sprint CERRADO ya no se puede editar ni borrar (TAREA_WRITE exige Sprint ACTIVO): no se repite.
        OR: [{ idSprint: null }, { sprint: { estado: { not: EstadoSprint.CERRADO } } }],
        proyecto: { eliminadoEn: null },
      },
      select: { idTarea: true },
    });

    let creadas = 0;
    for (const { idTarea } of maestras) {
      try {
        if (await this.crearCopia(idTarea, hoy)) creadas += 1;
      } catch (error) {
        this.logger.warn(`Fallo al repetir la tarea ${idTarea}: ${(error as Error)?.message ?? error}`);
      }
    }
    return creadas;
  }

  private crearCopia(idMaestra: number, hoy: Date): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const maestra = await tx.tarea.findFirst({
        where: { idTarea: idMaestra, eliminadoEn: null, repeticion: { not: null }, repeticionProxima: { lte: hoy }, OR: [{ idSprint: null }, { sprint: { estado: { not: EstadoSprint.CERRADO } } }] },
        include: { etiquetas: { select: { idEtiqueta: true } }, checklist: { orderBy: { orden: 'asc' } } },
      });
      if (!maestra?.repeticion || !maestra.repeticionProxima) return false;

      const sprint = await tx.sprint.findFirst({
        where: { idProyecto: maestra.idProyecto, estado: EstadoSprint.ACTIVO },
        select: { idSprint: true },
      });
      if (!sprint) return false;

      let proxima = maestra.repeticionProxima;
      const fechaCopia = proxima;
      // Se ancla al dia de la fecha limite de la maestra: 31-ene -> 28-feb -> 31-mar.
      const diaAncla = (maestra.fechaLimite ?? fechaCopia).getUTCDate();
      while (proxima <= hoy) proxima = sumarRepeticion(proxima, maestra.repeticion, diaAncla);

      const reservada = await tx.tarea.updateMany({
        where: { idTarea: idMaestra, repeticionProxima: maestra.repeticionProxima },
        data: { repeticionProxima: proxima },
      });
      if (reservada.count === 0) return false; // otra corrida ya la creo

      const copia = await tx.tarea.create({
        data: {
          idProyecto: maestra.idProyecto,
          idSprint: sprint.idSprint,
          idHito: maestra.idHito,
          idRolProyecto: maestra.idRolProyecto,
          idTareaOrigen: maestra.idTarea,
          tituloTarea: maestra.tituloTarea,
          descripcionTarea: maestra.descripcionTarea,
          prioridad: maestra.prioridad,
          tiempoEstimadoHoras: maestra.tiempoEstimadoHoras,
          puntosHistoria: maestra.puntosHistoria,
          creadaPor: maestra.creadaPor,
          estadoTarea: EstadoTarea.POR_HACER,
          fechaLimite: fechaCopia < hoy ? hoy : fechaCopia,
        },
      });
      if (maestra.etiquetas.length > 0) {
        await tx.tareaEtiqueta.createMany({
          data: maestra.etiquetas.map((e) => ({ idTarea: copia.idTarea, idEtiqueta: e.idEtiqueta })),
        });
      }
      if (maestra.checklist.length > 0) {
        await tx.tareaChecklistItem.createMany({
          data: maestra.checklist.map((item) => ({ idTarea: copia.idTarea, texto: item.texto, orden: item.orden })),
        });
      }
      if (copia.idHito !== null) await syncHitoEstado(tx, copia.idHito);

      await this.bitacoraEventos.registrarEvento({
        tx,
        tipoEvento: TipoEventoBitacora.TASK_CREATED,
        idActor: maestra.creadaPor,
        idProyecto: maestra.idProyecto,
        idSprint: sprint.idSprint,
        tipoEntidad: 'TAREA',
        idEntidad: copia.idTarea,
        valorNuevo: {
          tituloTarea: copia.tituloTarea,
          estadoTarea: copia.estadoTarea,
          prioridad: copia.prioridad,
          repeticionDe: maestra.idTarea,
        },
      });
      return true;
    });
  }
}
