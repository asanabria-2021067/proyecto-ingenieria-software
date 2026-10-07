import type { AdminProjectListItem } from '@/lib/types/admin-projects';
import type { AdminSprintCalendarItem, AdminSprintSituacion } from '@/lib/types/admin-sprints';

/**
 * Búsqueda, filtros y orden de la bandeja administrativa de proyectos
 * ACTIVOS. Todo opera sobre la lista completa ya cargada y sobre los valores
 * que entrega el backend: aquí no se decide qué Sprint venció ni cuándo, solo
 * se compara, agrupa y ordena lo recibido (`situacion`, `fechaFinPlaneada`).
 */

/** Un proyecto activo con su Sprint operable del calendario administrativo (si lo hay). */
export interface ActiveProjectRow {
  project: AdminProjectListItem;
  /**
   * `undefined` cuando el calendario todavía no se conoce (cargando o con
   * error); `null` cuando el calendario sí llegó y no trae Sprint operable
   * para este proyecto.
   */
  sprint: AdminSprintCalendarItem | null | undefined;
}

export const FILTRO_TODOS = 'TODOS';

export type FiltroSprint = typeof FILTRO_TODOS | 'ACTIVO' | 'EN_FINALIZACION' | 'SIN_SPRINT';
export type FiltroSituacion = typeof FILTRO_TODOS | AdminSprintSituacion;

export type OrdenActivos =
  'PREDETERMINADO' | 'NOMBRE_ASC' | 'FIN_PROXIMA' | 'FIN_LEJANA' | 'USUARIOS_DESC' | 'USUARIOS_ASC';

export const OPCIONES_ORDEN: { value: OrdenActivos; label: string }[] = [
  { value: 'PREDETERMINADO', label: 'Orden predeterminado' },
  { value: 'NOMBRE_ASC', label: 'Nombre A–Z' },
  { value: 'FIN_PROXIMA', label: 'Finalización más próxima' },
  { value: 'FIN_LEJANA', label: 'Finalización más lejana' },
  { value: 'USUARIOS_DESC', label: 'Más usuarios activos' },
  { value: 'USUARIOS_ASC', label: 'Menos usuarios activos' },
];

/** Índice `idProyecto → Sprint operable` del calendario, para unir en O(1) por fila. */
export function indexSprintsByProject(
  items: readonly AdminSprintCalendarItem[] | undefined,
): Map<number, AdminSprintCalendarItem> | undefined {
  if (!items) return undefined;
  const porProyecto = new Map<number, AdminSprintCalendarItem>();
  for (const item of items) porProyecto.set(item.idProyecto, item);
  return porProyecto;
}

export function joinProjectsWithSprints(
  projects: readonly AdminProjectListItem[],
  sprintByProject: Map<number, AdminSprintCalendarItem> | undefined,
): ActiveProjectRow[] {
  return projects.map((project) => ({
    project,
    sprint: sprintByProject ? (sprintByProject.get(project.idProyecto) ?? null) : undefined,
  }));
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Búsqueda parcial, sin distinguir mayúsculas ni tildes, por proyecto o nombre/apellido del líder. */
export function searchActiveProjects(rows: readonly ActiveProjectRow[], query: string): ActiveProjectRow[] {
  const termino = normalizar(query.trim());
  if (termino === '') return [...rows];
  return rows.filter(({ project }) => {
    const lider = `${project.lider.nombre} ${project.lider.apellido}`;
    return normalizar(project.tituloProyecto).includes(termino) || normalizar(lider).includes(termino);
  });
}

export function filterByEstado(rows: readonly ActiveProjectRow[], estado: string): ActiveProjectRow[] {
  if (estado === FILTRO_TODOS) return [...rows];
  return rows.filter(({ project }) => project.estadoProyecto === estado);
}

/**
 * «Sin Sprint» es un proyecto activo sin Sprint operable (`sprintAmbiente`
 * nulo). No es lo mismo que un Sprint sin fecha planificada (`SIN_FECHA`).
 */
export function filterBySprint(rows: readonly ActiveProjectRow[], filtro: FiltroSprint): ActiveProjectRow[] {
  if (filtro === FILTRO_TODOS) return [...rows];
  if (filtro === 'SIN_SPRINT') return rows.filter(({ project }) => project.sprintAmbiente === null);
  return rows.filter(({ project }) => project.sprintAmbiente?.estado === filtro);
}

/** Filtra por la situación temporal que YA calculó el backend; un proyecto sin Sprint no tiene situación. */
export function filterBySituacion(rows: readonly ActiveProjectRow[], filtro: FiltroSituacion): ActiveProjectRow[] {
  if (filtro === FILTRO_TODOS) return [...rows];
  return rows.filter(({ sprint }) => sprint?.situacion === filtro);
}

/**
 * Orden estable. `PREDETERMINADO` conserva el orden administrativo del
 * backend (lo último que se movió va primero). Las finalizaciones comparan el
 * día `YYYY-MM-DD` tal cual (ordena lexicográficamente); sin fecha o sin
 * Sprint van siempre al final.
 */
export function sortActiveProjects(rows: readonly ActiveProjectRow[], orden: OrdenActivos): ActiveProjectRow[] {
  const copia = [...rows];
  if (orden === 'PREDETERMINADO') return copia;

  const fecha = (row: ActiveProjectRow) => row.sprint?.fechaFinPlaneada ?? null;
  const porFecha = (direccion: 1 | -1) => (a: ActiveProjectRow, b: ActiveProjectRow) => {
    const fa = fecha(a);
    const fb = fecha(b);
    if (fa === null && fb === null) return 0;
    if (fa === null) return 1;
    if (fb === null) return -1;
    return fa.localeCompare(fb) * direccion;
  };

  switch (orden) {
    case 'NOMBRE_ASC':
      return copia.sort((a, b) => a.project.tituloProyecto.localeCompare(b.project.tituloProyecto, 'es'));
    case 'FIN_PROXIMA':
      return copia.sort(porFecha(1));
    case 'FIN_LEJANA':
      return copia.sort(porFecha(-1));
    case 'USUARIOS_DESC':
      return copia.sort((a, b) => b.project.usuariosActivos - a.project.usuariosActivos);
    case 'USUARIOS_ASC':
      return copia.sort((a, b) => a.project.usuariosActivos - b.project.usuariosActivos);
  }
}
