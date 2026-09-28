'use client';

import { useQuery } from '@tanstack/react-query';
import { misHorasQueryKey } from '@/lib/query-keys/hours';
import { getMisHoras, type MisHorasView } from '@/lib/services/users';

/**
 * HU-158 (T-232): horas del usuario autenticado. Las horas cambian en otras
 * vistas (registrar tiempo, cerrar un Sprint, aprobar un cierre) que nunca
 * están montadas a la vez que Mis Horas, así que en vez de invalidar desde
 * esas mutaciones se relee siempre al entrar y al volver a la pestaña,
 * anulando el `staleTime` global de 60 s. Solo lectura: sin mutations.
 */
export function useMisHoras() {
  return useQuery<MisHorasView>({
    queryKey: misHorasQueryKey,
    queryFn: getMisHoras,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
}
