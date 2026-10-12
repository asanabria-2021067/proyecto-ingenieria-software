'use client';

import { useQuery } from '@tanstack/react-query';
import { adminSprintCalendarQueryKey } from '@/lib/query-keys/admin-sprints';
import { getAdminSprintCalendar } from '@/lib/services/admin-sprints';
import type { AdminSprintCalendar } from '@/lib/types/admin-sprints';

/**
 * Calendario administrativo de Sprints. Sin reintentos automáticos, como el
 * resto de lecturas administrativas: un 403 o un fallo del servidor se
 * muestra de inmediato y quien mira decide si reintenta.
 */
export function useAdminSprintCalendar() {
  return useQuery<AdminSprintCalendar>({
    queryKey: adminSprintCalendarQueryKey,
    queryFn: getAdminSprintCalendar,
    retry: false,
  });
}
