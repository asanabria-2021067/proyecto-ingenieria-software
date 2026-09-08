'use client';

import { useContext, useMemo } from 'react';
import { QueryClient, QueryClientContext, useQuery } from '@tanstack/react-query';
import { leadershipContextQueryKey } from '@/lib/query-keys/leadership';
import { projectSprintsQueryKey } from '@/lib/query-keys/sprints';
import { getLeadershipContext } from '@/lib/services/leadership';
import { getProjectSprints } from '@/lib/services/sprints';
import { getMe, type UserProfile } from '@/lib/services/users';
import type { LeadershipContextDto } from '@/lib/types/leadership';
import type { SprintDto } from '@/lib/types/sprints';

/**
 * VIEW-10 (F020) — bloqueos del ciclo de Sprint 7 para la preparación de
 * salida de rol. Cada uno explica QUÉ HACER, no solo que está bloqueado.
 * `PROYECTO_CERRADO` no aparece aquí: la vista lo trata aparte con
 * `ReadOnlyProjectBanner` (la salida ya no aplica).
 */
export type ExitS7BlockerCode =
  | 'SPRINT_EN_FINALIZACION'
  | 'PROYECTO_EN_SOLICITUD_CIERRE'
  | 'ES_LIDER'
  | 'HORAS_SIN_CONSOLIDAR';

export interface ExitS7Blocker {
  code: ExitS7BlockerCode;
  titulo: string;
  accion: string;
  /** `true` impide continuar la solicitud; `false` es solo orientación. */
  bloqueante: boolean;
  href?: string;
  hrefLabel?: string;
}

export interface ExitS7Input {
  idProyecto: number;
  estadoProyecto: string;
  /** Estado del Sprint operable (no CERRADO), si existe. */
  sprintOperableEstado: string | null;
  esLider: boolean;
  /** Alguna responsabilidad vigente sin horas consolidadas (B6: `tieneHoras=false`). */
  horasSinConsolidar: boolean;
}

/** Traducción presentacional y pura: no decide nada que el backend no rechace ya (C085, 06 v2 §13/§18/§29). */
export function deriveExitS7Blockers(input: ExitS7Input): ExitS7Blocker[] {
  const blockers: ExitS7Blocker[] = [];
  if (input.estadoProyecto === 'EN_SOLICITUD_CIERRE') {
    blockers.push({
      code: 'PROYECTO_EN_SOLICITUD_CIERRE',
      titulo: 'El proyecto está en revisión de cierre',
      accion: 'Tu solicitud de salida no puede continuar hasta que un administrador resuelva el cierre.',
      bloqueante: true,
    });
  }
  if (input.sprintOperableEstado === 'EN_FINALIZACION') {
    blockers.push({
      code: 'SPRINT_EN_FINALIZACION',
      titulo: 'El Sprint se está cerrando; podrás solicitar la salida cuando termine',
      accion: 'Mientras el líder consolida las horas del Sprint, ninguna solicitud de salida puede crearse ni continuar.',
      bloqueante: true,
    });
  }
  if (input.esLider) {
    blockers.push({
      code: 'ES_LIDER',
      titulo: 'Debes resolver el liderazgo antes de salir',
      accion: 'Eres el líder actual: apela el cambio de liderazgo y, una vez transferido, podrás solicitar tu salida.',
      bloqueante: true,
      href: `/dashboard/proyectos/${input.idProyecto}/miembros`,
      hrefLabel: 'Apelar el liderazgo',
    });
  }
  if (input.horasSinConsolidar) {
    blockers.push({
      code: 'HORAS_SIN_CONSOLIDAR',
      titulo: 'Tienes horas sin consolidar en el Sprint actual',
      accion: 'Cierra el tramo de cada responsabilidad pendiente (botón «Cerrar tramo») para dejar tus horas registradas.',
      bloqueante: false,
    });
  }
  return blockers;
}

/** Sprint operable = el único no CERRADO (ACTIVO o EN_FINALIZACION). */
export function sprintOperableEstado(sprints: SprintDto[] | undefined): string | null {
  return sprints?.find((s) => s.estado !== 'CERRADO')?.estado ?? null;
}

let fallbackClient: QueryClient | null = null;
function getFallbackClient(): QueryClient {
  fallbackClient ??= new QueryClient();
  return fallbackClient;
}

function isValidId(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

export interface ExitS7Context {
  blockers: ExitS7Blocker[];
  /** Primer bloqueo duro (deshabilita «Continuar»), o `null`. */
  bloqueo: ExitS7Blocker | null;
  esLider: boolean;
  sprintOperableEstado: string | null;
  isLoading: boolean;
}

/**
 * Contexto S7 de la salida: Sprint operable, liderazgo (`GET
 * …/liderazgo/contexto`, F008) y usuario actual. Usa las mismas query keys
 * canónicas que los hooks de Sprints/liderazgo, así que LEADERSHIP_CHANGED,
 * SPRINT_FINALIZATION_STARTED y SPRINT_CLOSED ya lo refrescan.
 *
 * La vista de preparación se monta en contextos sin `QueryClientProvider`
 * (sus consumidores mockean los hooks de salida); si no hay cliente en el
 * árbol, las consultas quedan deshabilitadas y solo se derivan los bloqueos
 * que dependen del estado del proyecto ya cargado.
 */
export function useExitS7Context(
  idProyecto: number,
  estadoProyecto: string | undefined,
  horasSinConsolidar: boolean,
  enabled = true,
): ExitS7Context {
  const contextClient = useContext(QueryClientContext);
  const client = useMemo(() => contextClient ?? getFallbackClient(), [contextClient]);
  const activo = Boolean(contextClient) && enabled && isValidId(idProyecto) && estadoProyecto !== 'CERRADO';

  const sprints = useQuery<SprintDto[]>(
    { queryKey: projectSprintsQueryKey(idProyecto), queryFn: () => getProjectSprints(idProyecto), enabled: activo, retry: false },
    client,
  );
  const contexto = useQuery<LeadershipContextDto>(
    { queryKey: leadershipContextQueryKey(idProyecto), queryFn: () => getLeadershipContext(idProyecto), enabled: activo, retry: false },
    client,
  );
  const me = useQuery<UserProfile>(
    { queryKey: ['currentUser'], queryFn: getMe, enabled: activo, retry: false, staleTime: 5 * 60 * 1000 },
    client,
  );

  const estadoSprint = sprintOperableEstado(sprints.data);
  const esLider = Boolean(contexto.data && me.data && contexto.data.liderActual.idUsuario === me.data.idUsuario);

  const blockers = useMemo(
    () =>
      deriveExitS7Blockers({
        idProyecto,
        estadoProyecto: estadoProyecto ?? '',
        sprintOperableEstado: estadoSprint,
        esLider,
        horasSinConsolidar,
      }),
    [idProyecto, estadoProyecto, estadoSprint, esLider, horasSinConsolidar],
  );

  return {
    blockers,
    bloqueo: blockers.find((b) => b.bloqueante) ?? null,
    esLider,
    sprintOperableEstado: estadoSprint,
    isLoading: activo && (sprints.isPending || contexto.isPending || me.isPending),
  };
}
