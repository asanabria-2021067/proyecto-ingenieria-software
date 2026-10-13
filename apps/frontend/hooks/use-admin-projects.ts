'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  adminProjectDetailQueryKey,
  adminProjectsPrefix,
  adminProjectsQueryKey,
} from '@/lib/query-keys/admin-projects';
import { getAdminProjectDetail, getAdminProjects } from '@/lib/services/admin-projects';
import type { HistoricalProjectView } from '@/lib/services/historical';
import {
  ADMIN_PROJECTS_MAX_LIMIT,
  type AdminProjectDetail,
  type AdminProjectGroup,
  type AdminProjectListItem,
  type AdminProjectsPage,
} from '@/lib/types/admin-projects';

/**
 * VIEW-15 (F012) — bandeja administrativa. `placeholderData: keepPreviousData`
 * para que el cambio de página no parpadee. El grupo y la paginación viven
 * en la key (y en la URL).
 */
export function useAdminProjects(grupo: AdminProjectGroup, page = 1, limit = 20, enabled = true) {
  const limitSeguro = Math.min(Math.max(limit, 1), 50);
  return useQuery<AdminProjectsPage>({
    queryKey: adminProjectsQueryKey(grupo, page, limitSeguro),
    queryFn: () => getAdminProjects({ grupo, page, limit: limitSeguro }),
    placeholderData: keepPreviousData,
    enabled,
    retry: false,
  });
}

/**
 * Lista COMPLETA de un grupo (activos, cerrados) para sus bandejas con
 * búsqueda y filtros en cliente. El
 * backend solo pagina (`limit ≤ 50`) y no acepta búsqueda ni filtros, así que
 * la única forma de que los filtros del cliente sean correctos es tener toda
 * la población: se pide la primera página al máximo y, si hay más, el resto
 * en paralelo dentro de la misma consulta lógica. Una petición por página,
 * nunca una por proyecto.
 *
 * La key cae bajo `adminProjectsPrefix`, así que las invalidaciones por
 * socket (`PROJECT_STATE_CHANGED`, …) la refrescan igual que a las páginas.
 */
export function useAllAdminProjects(grupo: AdminProjectGroup, enabled = true) {
  return useQuery<{ items: AdminProjectListItem[]; total: number }>({
    queryKey: [...adminProjectsPrefix, grupo, 'todos'],
    queryFn: async () => {
      const limit = ADMIN_PROJECTS_MAX_LIMIT;
      const primera = await getAdminProjects({ grupo, page: 1, limit });
      const paginas = Math.ceil(primera.total / limit);
      if (paginas <= 1) return { items: primera.items, total: primera.total };
      const resto = await Promise.all(
        Array.from({ length: paginas - 1 }, (_, i) => getAdminProjects({ grupo, page: i + 2, limit })),
      );
      return {
        items: [...primera.items, ...resto.flatMap((p) => p.items)],
        total: primera.total,
      };
    },
    enabled,
    retry: false,
  });
}

/** Población completa de proyectos activos (bandeja de supervisión). */
export function useAllActiveAdminProjects(enabled = true) {
  return useAllAdminProjects('activos', enabled);
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
