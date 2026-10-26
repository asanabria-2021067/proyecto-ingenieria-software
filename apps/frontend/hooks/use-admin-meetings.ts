'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  getAdminMeetingParticipants,
  getAdminMeetingsInRange,
  getAllAdminMeetings,
  getEligibleMeetingProjects,
  getMeetingProjectTeam,
  type AdminMeetingsResultado,
} from '@/lib/services/admin-meetings';
import { listAdminUsers } from '@/lib/services/admin';
import type { AdminMeetingParticipantes, EquipoDeProyectoReunion, ProyectoElegibleReunion } from '@/lib/types/admin-meetings';

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

/**
 * Proyectos convocables para el rango de la reunión. La clave lleva el rango:
 * al cambiar fecha u horario se vuelve a consultar. Sin rango válido no se pide.
 */
export function useEligibleMeetingProjects(rango: { fechaInicio: Date; fechaFin: Date } | null, enabled = true) {
  return useQuery<ProyectoElegibleReunion[]>({
    queryKey: ['admin', 'reuniones', 'elegibles', rango?.fechaInicio.toISOString() ?? null, rango?.fechaFin.toISOString() ?? null],
    queryFn: () => getEligibleMeetingProjects(rango ?? undefined),
    enabled: enabled && rango !== null,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

/** Equipo de un proyecto invitado, solo cuando se despliegan sus detalles. */
export function useMeetingProjectTeam(idProyecto: number, enabled: boolean) {
  return useQuery<EquipoDeProyectoReunion>({
    queryKey: ['admin', 'reuniones', 'equipo', idProyecto],
    queryFn: () => getMeetingProjectTeam(idProyecto),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

/** Administradores con cuenta activa, candidatos a editores de una reunión. */
export function useActiveAdministrators(enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'reuniones', 'administradores'],
    queryFn: async () => (await listAdminUsers({ rol: 'administrador', estado: 'ACTIVO', limit: 50 })).data,
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
}
