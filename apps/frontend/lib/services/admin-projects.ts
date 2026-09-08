import { apiFetch } from '@/lib/api/client';
import type { HistoricalProjectView } from '@/lib/services/historical';
import type { AdminProjectDetail, AdminProjectsPage, AdminProjectsQuery } from '@/lib/types/admin-projects';

/** E116 — bandeja administrativa por grupo, paginada (`grupo` obligatorio; `limit ≤ 50`). */
export function getAdminProjects(query: AdminProjectsQuery): Promise<AdminProjectsPage> {
  const params = new URLSearchParams();
  params.set('grupo', query.grupo);
  params.set('page', String(query.page ?? 1));
  params.set('limit', String(Math.min(query.limit ?? 20, 50)));
  return apiFetch<AdminProjectsPage>(`/admin/proyectos?${params.toString()}`);
}

/**
 * E117 — detalle administrativo. En proyecto vivo devuelve `AdminProjectDetail`
 * (solo Sprints cerrados); en `CERRADO` el backend delega en el histórico y
 * devuelve `HistoricalProjectView`. Se distingue por `resumen.estadoProyecto`.
 */
export function getAdminProjectDetail(idProyecto: number): Promise<AdminProjectDetail | HistoricalProjectView> {
  return apiFetch<AdminProjectDetail | HistoricalProjectView>(`/admin/proyectos/${idProyecto}`);
}

export function isHistoricalDetail(
  detail: AdminProjectDetail | HistoricalProjectView,
): detail is HistoricalProjectView {
  return 'miembrosHistoricos' in detail;
}
