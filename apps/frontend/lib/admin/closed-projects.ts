import { normalizar } from '@/lib/admin/active-projects';
import type { AdminProjectListItem } from '@/lib/types/admin-projects';

/**
 * Búsqueda, filtro y orden de la bandeja de proyectos CERRADOS. Opera sobre
 * la lista completa ya cargada: solo compara y ordena lo que entrega el backend.
 */

export const FILTRO_TODOS = 'TODOS';

export type OrdenCerrados = 'PREDETERMINADO' | 'NOMBRE_ASC';

export const OPCIONES_ORDEN_CERRADOS: { value: OrdenCerrados; label: string }[] = [
  { value: 'PREDETERMINADO', label: 'Orden predeterminado' },
  { value: 'NOMBRE_ASC', label: 'Nombre A–Z' },
];

/** Búsqueda parcial, sin distinguir mayúsculas ni tildes, por proyecto o nombre/apellido del líder. */
export function searchClosedProjects(items: readonly AdminProjectListItem[], query: string): AdminProjectListItem[] {
  const termino = normalizar(query.trim());
  if (termino === '') return [...items];
  return items.filter(
    (item) =>
      normalizar(item.tituloProyecto).includes(termino) ||
      normalizar(`${item.lider.nombre} ${item.lider.apellido}`).includes(termino),
  );
}

export function filterClosedByTipo(items: readonly AdminProjectListItem[], tipo: string): AdminProjectListItem[] {
  return tipo === FILTRO_TODOS ? [...items] : items.filter((item) => item.tipoProyecto === tipo);
}

/** `PREDETERMINADO` conserva el orden del backend (lo último que se movió va primero). */
export function sortClosedProjects(items: readonly AdminProjectListItem[], orden: OrdenCerrados): AdminProjectListItem[] {
  const copia = [...items];
  if (orden === 'NOMBRE_ASC') copia.sort((a, b) => a.tituloProyecto.localeCompare(b.tituloProyecto, 'es'));
  return copia;
}
