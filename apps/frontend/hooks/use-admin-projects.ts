'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { adminProjectDetailQueryKey, adminProjectsQueryKey } from '@/lib/query-keys/admin-projects';
import { getAdminProjectDetail, getAdminProjects } from '@/lib/services/admin-projects';
import type { HistoricalProjectView } from '@/lib/services/historical';
import type { AdminProjectDetail, AdminProjectGroup, AdminProjectsPage } from '@/lib/types/admin-projects';

/**
 * VIEW-15 (F012) — bandeja administrativa. `placeholderData: keepPreviousData`
 * para que el cambio de página no parpadee. El grupo y la paginación viven
 * en la key (y en la URL).
 */
export function useAdminProjects(grupo: AdminProjectGroup, page = 1, limit = 20) {
  const limitSeguro = Math.min(Math.max(limit, 1), 50);
  return useQuery<AdminProjectsPage>({
    queryKey: adminProjectsQueryKey(grupo, page, limitSeguro),
    queryFn: () => getAdminProjects({ grupo, page, limit: limitSeguro }),
    placeholderData: keepPreviousData,
    retry: false,
  });
}

/** VIEW-16 (F013) — detalle administrativo (vivo o histórico). */
export function useAdminProjectDetail(idProyecto: number, enabled = true) {
  return useQuery<AdminProjectDetail | HistoricalProjectView>({
    queryKey: adminProjectDetailQueryKey(idProyecto),
    queryFn: () => getAdminProjectDetail(idProyecto),
    enabled: enabled && Number.isInteger(idProyecto) && idProyecto > 0,
    retry: false,
  });
}
