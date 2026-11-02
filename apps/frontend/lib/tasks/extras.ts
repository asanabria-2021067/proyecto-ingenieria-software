import type {
  CreateTaskInput,
  PlantillaTareaDTO,
  RepeticionTarea,
  TareaPublicaDTO,
  UpdateTaskInput,
} from '@/lib/types/tasks';

/** Valores del formulario de tarea que no forman parte del esquema base: bloqueo, repetición y checklist inicial. */
export interface TaskExtrasValue {
  idTareaBloqueante: number | null;
  repeticion: RepeticionTarea | null;
  /** Solo al crear (p. ej. desde una plantilla); en edición el checklist se maneja en el detalle. */
  checklist: string[];
}

export const REPETICION_LABEL: Record<RepeticionTarea, string> = {
  DIARIA: 'Cada día',
  SEMANAL: 'Cada semana',
  MENSUAL: 'Cada mes',
};

export function extrasIniciales(task: TareaPublicaDTO | null): TaskExtrasValue {
  return {
    idTareaBloqueante: task?.idTareaBloqueante ?? null,
    repeticion: task?.repeticion ?? null,
    checklist: [],
  };
}

/** Campos extra que se suman al payload de creación (solo los que tienen valor). */
export function extrasParaCrear(extras: TaskExtrasValue): Pick<CreateTaskInput, 'idTareaBloqueante' | 'repeticion' | 'checklist'> {
  const input: Pick<CreateTaskInput, 'idTareaBloqueante' | 'repeticion' | 'checklist'> = {};
  if (extras.idTareaBloqueante !== null) input.idTareaBloqueante = extras.idTareaBloqueante;
  if (extras.repeticion !== null) input.repeticion = extras.repeticion;
  if (extras.checklist.length > 0) input.checklist = extras.checklist;
  return input;
}

/** Diferencia contra la tarea original; `null` si no hay nada que enviar. `null` en un campo lo quita. */
export function extrasParaEditar(original: TareaPublicaDTO, extras: TaskExtrasValue): UpdateTaskInput | null {
  const input: UpdateTaskInput = {};
  if (extras.idTareaBloqueante !== original.idTareaBloqueante) input.idTareaBloqueante = extras.idTareaBloqueante;
  if (extras.repeticion !== original.repeticion) input.repeticion = extras.repeticion;
  return Object.keys(input).length > 0 ? input : null;
}

/**
 * Tareas que pueden bloquear a `idActual`: las demás del proyecto, sin las que
 * ya dependen (directa o indirectamente) de ella — elegirlas cerraría un ciclo,
 * que el servidor rechaza. `idActual` es null al crear.
 */
export function candidatosBloqueo(tareas: TareaPublicaDTO[], idActual: number | null): TareaPublicaDTO[] {
  const bloqueante = new Map(tareas.map((t) => [t.idTarea, t.idTareaBloqueante]));
  const dependeDeActual = (id: number): boolean => {
    const vistos = new Set<number>();
    let actual: number | null | undefined = bloqueante.get(id);
    while (actual != null && !vistos.has(actual)) {
      if (actual === idActual) return true;
      vistos.add(actual);
      actual = bloqueante.get(actual);
    }
    return false;
  };
  return tareas
    .filter((t) => t.idTarea !== idActual && (idActual === null || !dependeDeActual(t.idTarea)))
    .sort((a, b) => a.tituloTarea.localeCompare(b.tituloTarea, 'es'));
}

/** Valores del formulario base que rellena una plantilla (todo texto, como el formulario). */
export function valoresDePlantilla(plantilla: PlantillaTareaDTO) {
  return {
    tituloTarea: plantilla.tituloTarea,
    descripcionTarea: plantilla.descripcionTarea ?? '',
    prioridad: plantilla.prioridad,
    tiempoEstimadoHoras: plantilla.tiempoEstimadoHoras === null ? '' : String(plantilla.tiempoEstimadoHoras),
  };
}

/** MEJ-51: «Solo mis tareas» — las que tienen asignación activa del usuario. */
export function soloMisTareas(tareas: TareaPublicaDTO[], idUsuario: number | null): TareaPublicaDTO[] {
  if (idUsuario === null) return [];
  return tareas.filter((t) => t.asignacionActiva?.idUsuario === idUsuario);
}
