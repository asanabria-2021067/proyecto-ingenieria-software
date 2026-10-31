import { EventEmitter2 } from '@nestjs/event-emitter';
import { HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { EstadoTarea, Prisma } from '@prisma/client';
import { INSIGNIAS_EVENTO } from '../insignias/insignias.catalog';
import { ProjectTransactionService } from '../common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../common/project-policy/project-policy.service';
import { TimeRecordsService } from '../time-records/time-records.service';
import { BitacoraEventosService } from '../bitacora/bitacora-eventos.service';
import { TipoEventoBitacora } from '../bitacora/tipos-evento-bitacora';
import { TasksContextService } from './tasks-context.service';
import { TasksRelationsService } from './tasks-relations.service';
import { TasksNotificationsService } from './tasks-notifications.service';
import type { AccionMasivaTarea, BulkTaskActionDto } from './dto/bulk-task-action.dto';
import { TASK_SELECT, compareTareas, mapTarea, type TareaPublica } from './tasks.mapper';
import { createActiveAssignment, lockedProject, syncHitoEstado } from './tasks-writes.helpers';

/**
 * HU-202/T-383: columnas mínimas que la acción masiva necesita de cada tarea
 * antes de escribir (Sprint para la política, Hito para resincronizar, rol
 * para validar al candidato y título para los mensajes de error).
 */
interface TareaAccionMasiva {
  idTarea: number;
  idSprint: number | null;
  idHito: number | null;
  idRolProyecto: number | null;
  tituloTarea: string;
  estadoTarea: EstadoTarea;
}

export interface ResultadoAccionMasiva {
  accion: AccionMasivaTarea;
  /** Todas las tareas pedidas, ya con su estado final (mismo contrato que el tablero). */
  tareas: TareaPublica[];
  /** Solo las que realmente cambiaron (las que ya estaban así no se reescriben). */
  idsActualizadas: number[];
}

/** HU-202/T-383: acción masiva del tablero, extraída de TasksService sin cambios de comportamiento. */
@Injectable()
export class TasksBulkService {
  constructor(
    private readonly projectTx: ProjectTransactionService,
    private readonly policy: ProjectPolicyService,
    private readonly tasksContext: TasksContextService,
    private readonly tasksRelations: TasksRelationsService,
    private readonly timeRecords: TimeRecordsService,
    private readonly notifier: TasksNotificationsService,
    private readonly bitacoraEventos?: BitacoraEventosService,
    private readonly events?: EventEmitter2,
  ) {}

  /**
   * HU-202/T-383: acción masiva del tablero (mover de columna, asignar,
   * quitar asignación, agregar o quitar etiquetas) sobre varias tareas en una
   * sola operación. Exclusiva del líder del proyecto, aunque las acciones
   * individuales admitan a otros actores: la HU es "como líder".
   *
   * Todo o nada: corre en un único `projectTx.run` (lock del proyecto
   * primero). Si una tarea no existe, no es del proyecto, su Sprint no está
   * ACTIVO o no admite la acción (p. ej. el integrante no pertenece a su rol),
   * se lanza y la transacción revierte TODO. El error de una tarea concreta
   * lleva su título para que el líder sepa cuál falló.
   *
   * Reutiliza los mismos efectos que la acción individual (recálculo de
   * horas antes de cerrar una asignación, sincronización del Hito, evento de
   * bitácora por tarea, insignias al pasar a HECHO). Las tareas que ya
   * estaban en el estado pedido no se reescriben. Después del commit, cada
   * persona afectada recibe UNA notificación agrupada, no una por tarea.
   */
  async bulkAction(
    projectId: number,
    userId: number,
    dto: BulkTaskActionDto,
  ): Promise<ResultadoAccionMasiva> {
    const familia = dto.accion === 'ASIGNAR' || dto.accion === 'DESASIGNAR' ? 'TAREA_ASIGNACION' : 'TAREA_WRITE';

    const resultado = await this.projectTx.run(projectId, userId, 'tasks.bulkAction', async (ctx) => {
      const { tx } = ctx;
      const proyecto = lockedProject(ctx);
      await this.tasksContext.assertProjectLeader(projectId, userId, tx);

      const tareas: TareaAccionMasiva[] = await tx.tarea.findMany({
        where: { idTarea: { in: dto.idsTareas }, idProyecto: projectId, eliminadoEn: null },
        select: {
          idTarea: true,
          idSprint: true,
          idHito: true,
          idRolProyecto: true,
          tituloTarea: true,
          estadoTarea: true,
        },
      });
      const encontradas = new Set(tareas.map((tarea) => tarea.idTarea));
      const faltantes = dto.idsTareas.filter((idTarea) => !encontradas.has(idTarea));
      if (faltantes.length > 0) {
        throw new NotFoundException(
          `Tarea(s) con id ${faltantes.join(', ')} no encontrada(s) en el proyecto ${projectId}`,
        );
      }

      // Misma política que la acción individual, partida en dos: la del
      // proyecto (estado P/E, Sprint ambiente ACTIVO) una sola vez, y la de
      // la entidad una vez por Sprint distinto (normalmente uno solo), con los
      // títulos de sus tareas en el error: desde la Lista de tareas se pueden
      // seleccionar tareas de un Sprint ya cerrado.
      await this.policy.assertWriteTx(tx, proyecto, familia, userId);
      for (const sprintId of new Set(tareas.map((tarea) => tarea.idSprint))) {
        if (sprintId === null) continue;
        const titulos = tareas.filter((tarea) => tarea.idSprint === sprintId).map((tarea) => tarea.tituloTarea);
        // TAREA_WRITE y TAREA_ASIGNACION exigen la entidad en un Sprint ACTIVO.
        await this.conTituloDeTarea(titulos, () => this.policy.assertEntitySprintTx(tx, sprintId, 'ACTIVO'));
      }

      const asignadosPrevios = new Map<number, number>();
      let idsCambiadas: number[];
      switch (dto.accion) {
        case 'MOVER':
          idsCambiadas = await this.moverTareasMasivo(tx, projectId, userId, tareas, dto.estadoTarea!);
          break;
        case 'ASIGNAR':
          idsCambiadas = await this.asignarTareasMasivo(tx, projectId, userId, tareas, dto.idUsuario!);
          break;
        case 'DESASIGNAR':
          idsCambiadas = await this.desasignarTareasMasivo(tx, tareas, asignadosPrevios);
          break;
        case 'AGREGAR_ETIQUETAS':
        case 'QUITAR_ETIQUETAS':
          idsCambiadas = await this.cambiarEtiquetasMasivo(
            tx,
            projectId,
            userId,
            tareas,
            dto.idsEtiquetas!,
            dto.accion === 'AGREGAR_ETIQUETAS' ? 'AGREGAR' : 'QUITAR',
          );
          break;
      }

      const filas = await tx.tarea.findMany({
        where: { idTarea: { in: dto.idsTareas }, idProyecto: projectId, eliminadoEn: null },
        select: TASK_SELECT,
      });

      return { filas, idsCambiadas, asignadosPrevios };
    });

    const tareasFinales = resultado.filas.map(mapTarea).sort(compareTareas);

    if (dto.accion === 'MOVER' && dto.estadoTarea === EstadoTarea.HECHO) {
      for (const idTarea of resultado.idsCambiadas) {
        this.events?.emit(INSIGNIAS_EVENTO, { claves: ['tareas', 'sprints'], idTarea });
      }
    }

    const cambiadas = new Set(resultado.idsCambiadas);
    await this.notifier.notificarAccionMasiva(
      projectId,
      userId,
      dto,
      tareasFinales.filter((tarea) => cambiadas.has(tarea.idTarea)),
      resultado.asignadosPrevios,
    );

    return { accion: dto.accion, tareas: tareasFinales, idsActualizadas: resultado.idsCambiadas };
  }

  /** MOVER: solo reescribe las que cambian de columna; cada Hito afectado se resincroniza una vez. */
  private async moverTareasMasivo(
    tx: Prisma.TransactionClient,
    projectId: number,
    userId: number,
    tareas: TareaAccionMasiva[],
    estadoTarea: EstadoTarea,
  ): Promise<number[]> {
    const aMover = tareas.filter((tarea) => tarea.estadoTarea !== estadoTarea);
    if (aMover.length === 0) {
      return [];
    }

    await tx.tarea.updateMany({
      where: { idTarea: { in: aMover.map((tarea) => tarea.idTarea) }, idProyecto: projectId },
      data: { estadoTarea },
    });

    const hitos = new Set(aMover.map((tarea) => tarea.idHito).filter((idHito): idHito is number => idHito !== null));
    for (const idHito of hitos) {
      await syncHitoEstado(tx, idHito);
    }

    for (const tarea of aMover) {
      await this.bitacoraEventos?.registrarEvento({
        tx,
        tipoEvento: TipoEventoBitacora.TASK_STATUS_CHANGED,
        idActor: userId,
        idProyecto: projectId,
        idSprint: tarea.idSprint,
        tipoEntidad: 'TAREA',
        idEntidad: tarea.idTarea,
        valorAnterior: { estadoTarea: tarea.estadoTarea },
        valorNuevo: { estadoTarea },
      });
    }

    return aMover.map((tarea) => tarea.idTarea);
  }

  /**
   * ASIGNAR: mismo flujo que `assign()` por tarea — el candidato se valida
   * contra el rol de CADA tarea; si ya era el asignado activo, no se escribe;
   * si había otra persona, se recalculan sus horas, se cierra su tramo y se
   * abre uno nuevo (nunca se reescribe la fila anterior).
   */
  private async asignarTareasMasivo(
    tx: Prisma.TransactionClient,
    projectId: number,
    actorUserId: number,
    tareas: TareaAccionMasiva[],
    idUsuario: number,
  ): Promise<number[]> {
    const cambiadas: number[] = [];
    for (const tarea of tareas) {
      const escribio = await this.conTituloDeTarea(tarea.tituloTarea, async () => {
        const idParticipacion = await this.tasksRelations.assertUserAssignableToProject(
          projectId,
          idUsuario,
          tarea.idRolProyecto ?? null,
          tx,
          { nuevaAsignacion: true, actorId: actorUserId },
        );

        const asignacionActiva = await this.tasksContext.getActiveAssignment(tarea.idTarea, tx);
        if (asignacionActiva?.idUsuario === idUsuario) {
          return false;
        }

        if (asignacionActiva) {
          await this.timeRecords.recalculateAssignment(tx, asignacionActiva.idAsignacion);
          await tx.asignacionTarea.updateMany({
            where: {
              idAsignacion: asignacionActiva.idAsignacion,
              idTarea: tarea.idTarea,
              desasignadaEn: null,
            },
            data: { desasignadaEn: new Date() },
          });
        }

        await createActiveAssignment(tx, {
          idTarea: tarea.idTarea,
          idUsuario,
          idParticipacion,
          asignadoPor: actorUserId,
          desasignadaEn: null,
        });

        await this.bitacoraEventos?.registrarEvento({
          tx,
          tipoEvento: asignacionActiva
            ? TipoEventoBitacora.TASK_REASSIGNED
            : TipoEventoBitacora.TASK_ASSIGNED,
          idActor: actorUserId,
          idProyecto: projectId,
          idSprint: tarea.idSprint,
          tipoEntidad: 'TAREA',
          idEntidad: tarea.idTarea,
          valorAnterior: { idUsuario: asignacionActiva?.idUsuario ?? null },
          valorNuevo: { idUsuario },
        });
        return true;
      });
      if (escribio) {
        cambiadas.push(tarea.idTarea);
      }
    }
    return cambiadas;
  }

  /**
   * DESASIGNAR: mismo cierre que `unassign()` (recalcular antes de cerrar,
   * filtro completo en el `updateMany`); sin asignación activa no hay nada que
   * hacer. Guarda quién estaba asignado para avisarle después del commit.
   */
  private async desasignarTareasMasivo(
    tx: Prisma.TransactionClient,
    tareas: TareaAccionMasiva[],
    asignadosPrevios: Map<number, number>,
  ): Promise<number[]> {
    const cambiadas: number[] = [];
    for (const tarea of tareas) {
      const asignacionActiva = await this.tasksContext.getActiveAssignment(tarea.idTarea, tx);
      if (!asignacionActiva) {
        continue;
      }

      await this.timeRecords.recalculateAssignment(tx, asignacionActiva.idAsignacion);
      const cerradas = await tx.asignacionTarea.updateMany({
        where: {
          idAsignacion: asignacionActiva.idAsignacion,
          idTarea: tarea.idTarea,
          idUsuario: asignacionActiva.idUsuario,
          desasignadaEn: null,
        },
        data: { desasignadaEn: new Date() },
      });
      if (cerradas.count === 0) {
        continue;
      }

      asignadosPrevios.set(tarea.idTarea, asignacionActiva.idUsuario);
      cambiadas.push(tarea.idTarea);
    }
    return cambiadas;
  }

  /**
   * AGREGAR/QUITAR etiquetas: solo toca las etiquetas pedidas; las demás de
   * cada tarea se conservan. Las etiquetas se validan contra el proyecto con
   * la misma regla que `update()` (existen y son de este proyecto).
   */
  private async cambiarEtiquetasMasivo(
    tx: Prisma.TransactionClient,
    projectId: number,
    userId: number,
    tareas: TareaAccionMasiva[],
    idsEtiquetas: number[],
    modo: 'AGREGAR' | 'QUITAR',
  ): Promise<number[]> {
    await this.tasksRelations.validateRelatedResources(projectId, { idsEtiquetas }, tx);

    const actuales = await tx.tareaEtiqueta.findMany({
      where: { idTarea: { in: tareas.map((tarea) => tarea.idTarea) } },
      select: { idTarea: true, idEtiqueta: true },
    });
    const etiquetasPorTarea = new Map<number, number[]>();
    for (const { idTarea, idEtiqueta } of actuales) {
      etiquetasPorTarea.set(idTarea, [...(etiquetasPorTarea.get(idTarea) ?? []), idEtiqueta]);
    }

    const cambios: { tarea: TareaAccionMasiva; antes: number[]; despues: number[] }[] = [];
    for (const tarea of tareas) {
      const antes = etiquetasPorTarea.get(tarea.idTarea) ?? [];
      const despues =
        modo === 'AGREGAR'
          ? [...antes, ...idsEtiquetas.filter((idEtiqueta) => !antes.includes(idEtiqueta))]
          : antes.filter((idEtiqueta) => !idsEtiquetas.includes(idEtiqueta));
      if (despues.length !== antes.length) {
        cambios.push({ tarea, antes, despues });
      }
    }
    if (cambios.length === 0) {
      return [];
    }

    if (modo === 'AGREGAR') {
      await tx.tareaEtiqueta.createMany({
        data: cambios.flatMap(({ tarea, antes }) =>
          idsEtiquetas
            .filter((idEtiqueta) => !antes.includes(idEtiqueta))
            .map((idEtiqueta) => ({ idTarea: tarea.idTarea, idEtiqueta })),
        ),
        skipDuplicates: true,
      });
    } else {
      await tx.tareaEtiqueta.deleteMany({
        where: {
          idTarea: { in: cambios.map(({ tarea }) => tarea.idTarea) },
          idEtiqueta: { in: idsEtiquetas },
        },
      });
    }

    const ordenar = (ids: number[]) => [...ids].sort((a, b) => a - b);
    for (const { tarea, antes, despues } of cambios) {
      await this.bitacoraEventos?.registrarEvento({
        tx,
        tipoEvento: TipoEventoBitacora.TASK_UPDATED,
        idActor: userId,
        idProyecto: projectId,
        idSprint: tarea.idSprint,
        tipoEntidad: 'TAREA',
        idEntidad: tarea.idTarea,
        valorAnterior: { idsEtiquetas: ordenar(antes) },
        valorNuevo: { idsEtiquetas: ordenar(despues) },
      });
    }

    return cambios.map(({ tarea }) => tarea.idTarea);
  }

  /**
   * Antepone el título de la(s) tarea(s) al mensaje de un error HTTP (mismo
   * status y mismo cuerpo, p. ej. `code`), para que el líder sepa qué tarea
   * impidió la acción masiva. Cualquier otro error se relanza sin cambios.
   */
  private async conTituloDeTarea<T>(titulos: string | string[], operacion: () => Promise<T>): Promise<T> {
    try {
      return await operacion();
    } catch (error) {
      if (!(error instanceof HttpException)) {
        throw error;
      }
      const lista = Array.isArray(titulos) ? titulos : [titulos];
      const nombrados = lista.slice(0, 3).map((titulo) => `"${titulo}"`).join(', ');
      const resto = lista.length > 3 ? ` y ${lista.length - 3} más` : '';
      const prefijo = `${lista.length === 1 ? 'Tarea' : 'Tareas'} ${nombrados}${resto}`;

      const respuesta = error.getResponse();
      const esObjeto = typeof respuesta === 'object' && respuesta !== null;
      const original = esObjeto ? (respuesta as { message?: unknown }).message : respuesta;
      const texto = Array.isArray(original) ? original.join(', ') : String(original ?? error.message);
      const cuerpo = esObjeto ? respuesta : { statusCode: error.getStatus() };
      throw new HttpException({ ...cuerpo, message: `${prefijo}: ${texto}` }, error.getStatus());
    }
  }
}
