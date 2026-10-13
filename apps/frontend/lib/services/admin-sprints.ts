import { apiFetch } from '@/lib/api/client';
import type { AdminSprintCalendar } from '@/lib/types/admin-sprints';

/**
 * Calendario administrativo de Sprints. El endpoint no acepta parámetros:
 * devuelve todos los Sprints operables de proyectos activos, y cada vista
 * agrupa o resume ese mismo payload.
 */
export function getAdminSprintCalendar(): Promise<AdminSprintCalendar> {
  return apiFetch<AdminSprintCalendar>('/admin/sprints/calendario');
}
