import { EstadoHito } from '@prisma/client';

export interface HitoProgreso {
  estadoHito: EstadoHito;
  porcentaje: number;
}

/**
 * A12: semántica ÚNICA y canónica de progreso de un Hito individual —
 * extraída sin cambiar comportamiento del bucle interno de
 * `ProjectsService.calcularAvanceHitos` (ver su docstring original sobre el
 * bug de `Hito.estadoHito` congelado en PENDIENTE). % = tareas HECHO / total
 * de tareas del hito, redondeado; COMPLETADO al 100% con al menos una
 * tarea; EN_PROGRESO si %>0 (y no ya COMPLETADO); PENDIENTE en cualquier
 * otro caso — incluye explícitamente un Hito sin tareas (total=0 -> 0%,
 * PENDIENTE, sin división por cero).
 *
 * Reutilizada por:
 *   - ProjectsService.calcularAvanceHitos (agregación de varios Hitos, GET
 *     puro, nunca persiste);
 *   - TasksService (persistencia de Hito.estadoHito tras un write-path real
 *     de estadoTarea — A12);
 *   - SprintsService.getSprintDetail (porcentaje expuesto en
 *     SprintDetailHitoDto — A12), con el MISMO scope de tareas (todas las
 *     no eliminadas del Hito en el proyecto, no solo las del Sprint).
 */
export function calcularProgresoHito(tareas: { estadoTarea: string }[]): HitoProgreso {
  const total = tareas.length;
  const hechas = tareas.filter((t) => t.estadoTarea === 'HECHO').length;
  const porcentaje = total === 0 ? 0 : Math.round((hechas / total) * 100);

  let estadoHito: EstadoHito;
  if (porcentaje === 100 && total > 0) {
    estadoHito = EstadoHito.COMPLETADO;
  } else if (porcentaje > 0) {
    estadoHito = EstadoHito.EN_PROGRESO;
  } else {
    estadoHito = EstadoHito.PENDIENTE;
  }

  return { estadoHito, porcentaje };
}
