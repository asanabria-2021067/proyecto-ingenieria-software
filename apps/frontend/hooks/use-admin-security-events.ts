'use client';

import { hashKey, useQuery } from '@tanstack/react-query';
import {
  adminSecurityEventsQueryKey,
  normalizeSecurityEventsFilters,
  normalizeSecurityEventsPaging,
} from '@/lib/query-keys/admin-security';
import { getSecurityEvents } from '@/lib/services/admin-security';
import type { SecurityEventsPage, SecurityEventsQuery } from '@/lib/types/admin-security';

/**
 * T-310 — eventos de seguridad del visor administrativo.
 *
 * Cada combinación de filtros y cada página tienen su propia entrada de caché.
 * Al cambiar de página se mantiene la anterior a la vista mientras llega la
 * nueva (`isPlaceholderData`), pero NUNCA al cambiar de filtros o de tamaño de
 * página: unos resultados de otro filtro no deben pasar por los del actual.
 * La consulta se cancela si deja de usarse antes de responder.
 */
export function useAdminSecurityEvents(query: SecurityEventsQuery = {}, enabled = true) {
  const filtros = normalizeSecurityEventsFilters(query);
  const { page, limit } = normalizeSecurityEventsPaging(query);
  const queryKey = adminSecurityEventsQueryKey(query);
  // Todo menos la página (último elemento de la key).
  const alcance = hashKey(queryKey.slice(0, -1));

  return useQuery<SecurityEventsPage>({
    queryKey,
    queryFn: ({ signal }) =>
      getSecurityEvents(
        {
          ...(filtros.tipo ? { tipo: filtros.tipo } : {}),
          ...(filtros.desde ? { desde: filtros.desde } : {}),
          ...(filtros.hasta ? { hasta: filtros.hasta } : {}),
          ...(filtros.idUsuario ? { idUsuario: filtros.idUsuario } : {}),
          page,
          limit,
        },
        signal,
      ),
    placeholderData: (anterior, consultaAnterior) =>
      consultaAnterior && hashKey(consultaAnterior.queryKey.slice(0, -1)) === alcance ? anterior : undefined,
    enabled,
    // Un 400/401/403 no cambia por repetirlo y un 500 se reintenta a mano desde la vista.
    retry: false,
  });
}
