import { EstadoSprint, EstadoTarea, Prioridad } from '@prisma/client';
import { SprintDetailHitoDto } from './sprint-history.dto';

/**
 * T-172: contrato de `GET /proyectos/:projectId/sprints/:sprintId/analytics`
 * — analítica de solo lectura de UN Sprint (HU-143). Restricción vigente:
 * ninguna métrica de "velocity"; `planificadoVsCompletado` cuenta tareas
 * ("tareas completadas por sprint"), nunca puntos/horas de avance.
 *
 * `distribucionPorEstado`/`distribucionPorPrioridad` son exhaustivos sobre
 * los enums actuales (`EstadoTarea`/`Prioridad`) — un valor nuevo en el enum
 * exige tocar este archivo explícitamente, nunca queda en 0 silencioso.
 *
 * `hitos` reutiliza exactamente `SprintDetailHitoDto` (mismo `porcentaje`
 * derivado por `calcularProgresoHito`, mismo scope de "todas las tareas
 * vigentes del Hito en el proyecto") — SprintAnalytics no inventa una
 * segunda fórmula de progreso de Hito.
 */
export interface SprintAnalyticsDto {
  idSprint: number;
  idProyecto: number;
  numero: number;
  estado: EstadoSprint;
  tareasTotales: number;
  distribucionPorEstado: Record<EstadoTarea, number>;
  distribucionPorPrioridad: Record<Prioridad, number>;
  hitos: SprintDetailHitoDto[];
  planificadoVsCompletado: {
    tareasPlanificadas: number;
    tareasCompletadas: number;
    horasEstimadas: number;
  };
}

/**
 * T-173: un elemento de `GET /proyectos/:projectId/sprints/analytics`
 * (analítica comparativa entre Sprints del proyecto, HU-143). El nombre del
 * campo es literalmente "tareasCompletadas" — la HU prohíbe explícitamente
 * llamarlo/tratarlo como "velocity".
 *
 * `porcentajeCumplimiento` = tareasCompletadas / tareasPlanificadas * 100
 * (0 si tareasPlanificadas = 0, nunca división por cero). `hitosTotales`/
 * `hitosCompletados` son la "evolución de hitos" pedida por T-173: hitos
 * DISTINTOS referenciados por tareas de este Sprint, y cuántos de esos ya
 * están `Hito.estadoHito = COMPLETADO` (estado global del Hito, no algo
 * recalculado por Sprint).
 */
export interface SprintComparativeAnalyticsItemDto {
  idSprint: number;
  numero: number;
  estado: EstadoSprint;
  tareasPlanificadas: number;
  tareasCompletadas: number;
  porcentajeCumplimiento: number;
  hitosTotales: number;
  hitosCompletados: number;
}

export interface SprintComparativeAnalyticsDto {
  idProyecto: number;
  sprints: SprintComparativeAnalyticsItemDto[];
}
