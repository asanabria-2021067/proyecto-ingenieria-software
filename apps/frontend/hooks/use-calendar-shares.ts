'use client';

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { getApiErrorStatus } from '@/components/projects/api-error';
import {
  compartirCalendario,
  dejarDeCompartirCalendario,
  dejarDeRecibirCalendario,
  getAgendaCompartida,
  getCalendariosCompartidos,
  type AgendaCompartidaDTO,
  type CalendariosCompartidosDTO,
} from '@/lib/services/calendar-shares';

export const calendariosCompartidosQueryKey = ['calendarios-compartidos'] as const;

/** HU-184: con quién compartí mi calendario y quién me compartió el suyo. */
export function useCalendariosCompartidos() {
  return useQuery<CalendariosCompartidosDTO>({
    queryKey: calendariosCompartidosQueryKey,
    queryFn: getCalendariosCompartidos,
  });
}

export function useCompartirCalendario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (idUsuario: number) => compartirCalendario(idUsuario),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: calendariosCompartidosQueryKey });
    },
  });
}

export function useDejarDeCompartirCalendario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (idUsuario: number) => dejarDeCompartirCalendario(idUsuario),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: calendariosCompartidosQueryKey });
    },
  });
}

/**
 * G01 (UI-31): quitarme un calendario recibido. Además de refrescar la lista,
 * descarta la agenda cacheada de esa persona: ya no tengo permiso para verla.
 */
export function useDejarDeRecibirCalendario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (idPropietario: number) => dejarDeRecibirCalendario(idPropietario),
    onSuccess: (_resultado, idPropietario) => {
      queryClient.removeQueries({ queryKey: ['agenda-compartida', idPropietario] });
      void queryClient.invalidateQueries({ queryKey: calendariosCompartidosQueryKey });
    },
  });
}

/** G03 (UI-12): estado de la agenda de una persona, para que un fallo sea diagnosticable y reintentable. */
export interface EstadoAgendaCompartida {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  statusCode?: number;
  /** 403: la persona dejó de compartir (o la compartición ya no existe); no es un fallo de red. */
  revocada: boolean;
  refetch: () => void;
}

/**
 * HU-184: agenda (eventos + fechas límite) de cada calendario compartido que
 * el usuario tiene activado, en el rango visible. Una consulta por persona:
 * activar o desactivar a alguien no recarga a los demás. G03 (UI-12): `agendas`
 * solo contiene las que SÍ cargaron (nunca un vacío de relleno); `estados`
 * dice, por persona, si está cargando, falló (y con qué código) o fue
 * revocada, y cómo reintentarla. Un 403 no se reintenta solo: ya no hay
 * permiso. La estabilización de referencias (`combine`) queda para G04.
 */
export function useAgendasCompartidas(idsPropietarios: number[], desde: Date, hasta: Date) {
  const consultas = useQueries({
    queries: idsPropietarios.map((idPropietario) => ({
      queryKey: ['agenda-compartida', idPropietario, desde.toISOString(), hasta.toISOString()],
      queryFn: () => getAgendaCompartida(idPropietario, desde, hasta),
      retry: (fallos: number, error: unknown) => getApiErrorStatus(error) !== 403 && fallos < 1,
    })),
  });
  const agendas = new Map<number, AgendaCompartidaDTO>();
  const estados = new Map<number, EstadoAgendaCompartida>();
  consultas.forEach((consulta, i) => {
    const id = idsPropietarios[i];
    if (consulta.data) agendas.set(id, consulta.data);
    const statusCode = consulta.isError ? getApiErrorStatus(consulta.error) : undefined;
    estados.set(id, {
      isLoading: consulta.isLoading,
      isError: consulta.isError,
      error: consulta.error,
      statusCode,
      revocada: statusCode === 403,
      refetch: () => void consulta.refetch(),
    });
  });
  return {
    agendas,
    estados,
    isLoading: consultas.some((c) => c.isLoading),
    isError: consultas.some((c) => c.isError),
    /** Reintenta solo las que fallaron. */
    refetchFallidas: () => consultas.forEach((c) => c.isError && void c.refetch()),
  };
}
