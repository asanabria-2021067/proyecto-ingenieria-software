import type { MiembroProyecto } from '@/hooks/use-project-members';
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
  /** MEJ-109: responsables además del principal (el del selector «Usuario asignado»). */
  idsResponsablesAdicionales: number[];
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
    idsResponsablesAdicionales: adicionalesDe(task),
  };
}

/** Responsables de la tarea sin el principal (el que tiene la asignación activa). */
function adicionalesDe(task: TareaPublicaDTO | null): number[] {
  const principal = task?.asignacionActiva?.idUsuario;
  return (task?.responsables ?? []).map((r) => r.idUsuario).filter((id) => id !== principal);
}

/**
 * MEJ-109: quién puede ser responsable adicional: integrantes del rol de la tarea (todos si no tiene),
 * una vez cada uno y sin el principal. Mismo criterio de elegibilidad que el servidor aplica al asignar.
 */
export function candidatosResponsables(
  members: MiembroProyecto[],
  idRol: number | null,
  idPrincipal: number | null,
): MiembroProyecto[] {
  const porUsuario = new Map<number, MiembroProyecto>();
  for (const m of members) {
    if ((idRol === null || m.idRolProyecto === idRol) && m.idUsuario !== idPrincipal) porUsuario.set(m.idUsuario, m);
  }
  return [...porUsuario.values()].sort((a, b) => `${a.nombre} ${a.apellido}`.localeCompare(`${b.nombre} ${b.apellido}`, 'es'));
}

/** Conjunto de adicionales a guardar al editar; `null` si no cambió respecto a la tarea. */
export function responsablesParaEditar(original: TareaPublicaDTO, ids: number[]): number[] | null {
  const antes = [...adicionalesDe(original)].sort((a, b) => a - b);
  const despues = [...new Set(ids)].sort((a, b) => a - b);
  return JSON.stringify(antes) === JSON.stringify(despues) ? null : despues;
}

/** Campos extra que se suman al payload de creación (solo los que tienen valor). */
export function extrasParaCrear(
  extras: TaskExtrasValue,
): Pick<CreateTaskInput, 'idTareaBloqueante' | 'repeticion' | 'checklist' | 'idsResponsablesAdicionales'> {
  const input: Pick<CreateTaskInput, 'idTareaBloqueante' | 'repeticion' | 'checklist' | 'idsResponsablesAdicionales'> = {};
  if (extras.idTareaBloqueante !== null) input.idTareaBloqueante = extras.idTareaBloqueante;
  if (extras.repeticion !== null) input.repeticion = extras.repeticion;
  if (extras.checklist.length > 0) input.checklist = extras.checklist;
  if (extras.idsResponsablesAdicionales.length > 0) input.idsResponsablesAdicionales = extras.idsResponsablesAdicionales;
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

/**
 * MEJ-106: payload de una subtarea. Hereda hito, rol y prioridad del padre y su fecha límite
 * mientras siga en el futuro; si ya pasó, mañana (el servidor exige fecha posterior a hoy).
 */
export function inputSubtarea(
  padre: TareaPublicaDTO,
  titulo: string,
  idUsuario: number | null,
  hoy: string,
): CreateTaskInput {
  const manana = new Date(`${hoy}T00:00:00.000Z`);
  manana.setUTCDate(manana.getUTCDate() + 1);
  return {
    tituloTarea: titulo.trim(),
    fechaLimite: padre.fechaLimite && padre.fechaLimite > hoy ? padre.fechaLimite : manana.toISOString().slice(0, 10),
    prioridad: padre.prioridad,
    idTareaPadre: padre.idTarea,
    ...(padre.idHito !== null ? { idHito: padre.idHito } : {}),
    ...(padre.idRolProyecto !== null ? { idRolProyecto: padre.idRolProyecto } : {}),
    ...(idUsuario !== null ? { idUsuarioAsignado: idUsuario } : {}),
  };
}
