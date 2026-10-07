'use client';

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  compartirCalendario,
  dejarDeCompartirCalendario,
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
 * HU-184: agenda (eventos + fechas límite) de cada calendario compartido que
 * el usuario tiene activado, en el rango visible. Una consulta por persona:
 * activar o desactivar a alguien no recarga a los demás.
 */
export function useAgendasCompartidas(idsPropietarios: number[], desde: Date, hasta: Date) {
  const consultas = useQueries({
    queries: idsPropietarios.map((idPropietario) => ({
      queryKey: ['agenda-compartida', idPropietario, desde.toISOString(), hasta.toISOString()],
      queryFn: () => getAgendaCompartida(idPropietario, desde, hasta),
    })),
  });
  const agendas = new Map<number, AgendaCompartidaDTO>();
  consultas.forEach((consulta, i) => {
    if (consulta.data) agendas.set(idsPropietarios[i], consulta.data);
  });
  return {
    agendas,
    isLoading: consultas.some((c) => c.isLoading),
    isError: consultas.some((c) => c.isError),
  };
}
