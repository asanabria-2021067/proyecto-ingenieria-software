'use client';

import { useCallback, useMemo, useRef } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
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

/** Reutiliza la colección anterior si la nueva tiene las mismas claves y, por clave, un valor equivalente. */
function compartirMapa<V>(previo: Map<number, V> | undefined, nuevo: Map<number, V>, igual: (a: V, b: V) => boolean): Map<number, V> {
  if (!previo) return nuevo;
  let identico = previo.size === nuevo.size;
  for (const [id, valor] of nuevo) {
    const anterior = previo.get(id);
    if (anterior !== undefined && igual(anterior, valor)) nuevo.set(id, anterior);
    else identico = false;
  }
  return identico ? previo : nuevo;
}

function mismoEstado(a: EstadoAgendaCompartida, b: EstadoAgendaCompartida): boolean {
  return (
    a.isLoading === b.isLoading &&
    a.isError === b.isError &&
    a.error === b.error &&
    a.statusCode === b.statusCode &&
    a.revocada === b.revocada &&
    a.refetch === b.refetch
  );
}

/**
 * `refetch` de cada observador de TanStack es estable; se envuelve una sola
 * vez (sin argumentos: un `onClick={estado.refetch}` no le pasa el evento).
 */
const envoltoriosRefetch = new WeakMap<object, () => void>();
function refetchEstable(refetch: () => unknown): () => void {
  let envoltorio = envoltoriosRefetch.get(refetch);
  if (!envoltorio) {
    envoltorio = () => void refetch();
    envoltoriosRefetch.set(refetch, envoltorio);
  }
  return envoltorio;
}

interface AgendasCompartidas {
  agendas: Map<number, AgendaCompartidaDTO>;
  estados: Map<number, EstadoAgendaCompartida>;
  /** Solo quienes fallaron, con su error original (G04, UI-12). */
  erroresPorPropietario: Map<number, unknown>;
}

/**
 * HU-184: agenda (eventos + fechas límite) de cada calendario compartido que
 * el usuario tiene activado, en el rango visible. Una consulta por persona:
 * activar o desactivar a alguien no recarga a los demás. G03 (UI-12): `agendas`
 * solo contiene las que SÍ cargaron (nunca un vacío de relleno); `estados`
 * dice, por persona, si está cargando, falló (y con qué código) o fue
 * revocada, y cómo reintentarla. Un 403 no se reintenta solo: ya no hay
 * permiso.
 *
 * G04 (UI-11): las colecciones son estables. `combine` de TanStack solo se
 * vuelve a ejecutar cuando cambia el resultado de alguna consulta, y aun
 * entonces cada `Map` (y cada entrada) se conserva si su contenido no cambió:
 * un render ajeno (abrir un diálogo, un toast, el reloj) no entrega
 * referencias nuevas ni recalcula lo que dependa de ellas.
 */
export function useAgendasCompartidas(idsPropietarios: number[], desde: Date, hasta: Date) {
  // El contenido manda, no la identidad del array ni de las fechas que pasa quien llama.
  const claveIds = idsPropietarios.join(',');
  const ids = useMemo(() => (claveIds ? claveIds.split(',').map(Number) : []), [claveIds]);
  const desdeIso = desde.toISOString();
  const hastaIso = hasta.toISOString();
  const queries = useMemo(
    () =>
      ids.map((idPropietario) => ({
        queryKey: ['agenda-compartida', idPropietario, desdeIso, hastaIso],
        queryFn: () => getAgendaCompartida(idPropietario, new Date(desdeIso), new Date(hastaIso)),
        retry: (fallos: number, error: unknown) => getApiErrorStatus(error) !== 403 && fallos < 1,
      })),
    [ids, desdeIso, hastaIso],
  );

  const previoRef = useRef<AgendasCompartidas | undefined>(undefined);
  const combine = useCallback(
    (consultas: UseQueryResult<AgendaCompartidaDTO>[]) => {
      const agendas = new Map<number, AgendaCompartidaDTO>();
      const estados = new Map<number, EstadoAgendaCompartida>();
      const errores = new Map<number, unknown>();
      consultas.forEach((consulta, i) => {
        const id = ids[i];
        if (consulta.data) agendas.set(id, consulta.data);
        const statusCode = consulta.isError ? getApiErrorStatus(consulta.error) : undefined;
        if (consulta.isError) errores.set(id, consulta.error);
        estados.set(id, {
          isLoading: consulta.isLoading,
          isError: consulta.isError,
          error: consulta.error,
          statusCode,
          revocada: statusCode === 403,
          refetch: refetchEstable(consulta.refetch),
        });
      });
      const previo = previoRef.current;
      const colecciones: AgendasCompartidas = {
        agendas: compartirMapa(previo?.agendas, agendas, Object.is),
        estados: compartirMapa(previo?.estados, estados, mismoEstado),
        erroresPorPropietario: compartirMapa(previo?.erroresPorPropietario, errores, Object.is),
      };
      previoRef.current = colecciones;
      return {
        ...colecciones,
        isLoading: consultas.some((c) => c.isLoading),
        isError: consultas.some((c) => c.isError),
        /** Reintenta solo las que fallaron. */
        refetchFallidas: () => consultas.forEach((c) => c.isError && void c.refetch()),
      };
    },
    [ids],
  );

  return useQueries({ queries, combine });
}
