'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  getAdminMeetingParticipants,
  getAdminMeetingsInRange,
  getAllAdminMeetings,
  type AdminMeetingsResultado,
} from '@/lib/services/admin-meetings';
import type { AdminMeetingParticipantes } from '@/lib/types/admin-meetings';

/**
 * Lecturas de reuniones de Administración para el calendario. Sin reintentos
 * automáticos, como el resto de lecturas administrativas.
 */

/** Reuniones no canceladas del rango visible (`hasta` exclusivo). La clave lleva el rango. */
export function useAdminMeetingsInRange(desde: Date, hasta: Date) {
  return useQuery<AdminMeetingsResultado>({
    queryKey: ['admin', 'reuniones', 'rango', desde.toISOString(), hasta.toISOString()],
    queryFn: () => getAdminMeetingsInRange(desde, hasta),
    // Al cambiar de periodo se conserva lo anterior hasta que llega lo nuevo (sin parpadeo de vacío).
    placeholderData: keepPreviousData,
    retry: false,
  });
}

/** Agenda activa (no canceladas que aún no terminan), para la vista Lista. */
export function useAdminUpcomingMeetings() {
  return useQuery<AdminMeetingsResultado>({
    queryKey: ['admin', 'reuniones', 'activas'],
    queryFn: () => getAllAdminMeetings('activas'),
    retry: false,
  });
}

export function useAdminMeetingParticipants(idReunion: number) {
  return useQuery<AdminMeetingParticipantes>({
    queryKey: ['admin', 'reuniones', idReunion, 'participantes'],
    queryFn: () => getAdminMeetingParticipants(idReunion),
    retry: false,
  });
}
