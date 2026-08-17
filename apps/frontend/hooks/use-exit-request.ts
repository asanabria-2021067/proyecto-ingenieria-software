'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { currentExitRequestQueryKey, exitPreparationSummaryQueryKey } from '@/lib/query-keys/exit-requests';
import {
  projectMemberDetailQueryKey,
  projectMembersQueryKey,
  projectTeamSummaryQueryKey,
} from '@/lib/query-keys/members';
import {
  approveExitRequest,
  cancelExitPreparation,
  continueExitPreparation,
  createExitRequest,
  getCurrentExitRequest,
  getExitPreparationSummary,
  rejectExitRequest,
} from '@/lib/services/exit-requests';
import type {
  CreateExitRequestInput,
  CurrentExitRequestDto,
  ExitPreparationSummaryDto,
} from '@/lib/types/exit-requests';

function isValidProjectId(idProyecto: number): boolean {
  return Number.isInteger(idProyecto) && idProyecto > 0;
}

/**
 * F11.1 — `GET /proyectos/:id/salida/estado`. Fuente de verdad
 * server-authoritative para decidir entre PREPARACION/PENDIENTE_LIDER/NONE:
 * nunca se infiere ese estado a partir de `blockers`/`puedeContinuar` (esos
 * pertenecen exclusivamente a B6) ni de un `useState` poblado solo por la
 * respuesta de una mutation en la misma sesión.
 */
export function useCurrentExitRequest(idProyecto: number) {
  const enabled = isValidProjectId(idProyecto);

  const query = useQuery<CurrentExitRequestDto>({
    queryKey: currentExitRequestQueryKey(idProyecto),
    queryFn: () => getCurrentExitRequest(idProyecto),
    enabled,
  });

  return {
    request: query.data?.solicitud ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * ExitPreparationSummary (B6) — `GET /proyectos/:id/salida/preparacion`. No
 * deriva ni recalcula blockers/cantidadBlockers/puedeContinuar: los expone
 * tal cual los entrega el backend (read-model server-authoritative).
 *
 * F11.1: `habilitado` (default `true`) permite al consumidor apagar esta
 * query cuando ya sabe, vía `useCurrentExitRequest`, que la solicitud no
 * está en PREPARACION — B6 siempre responde 400 en cualquier otro caso, así
 * que dispararla igual solo produciría un error esperado y descartable.
 */
export function useExitPreparationSummary(idProyecto: number, habilitado: boolean = true) {
  const enabled = isValidProjectId(idProyecto) && habilitado;

  const query = useQuery<ExitPreparationSummaryDto>({
    queryKey: exitPreparationSummaryQueryKey(idProyecto),
    queryFn: () => getExitPreparationSummary(idProyecto),
    enabled,
  });

  return {
    summary: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * B5 — `POST /proyectos/:id/solicitudes-salida`. Antes de crear, B6 no tenía
 * ninguna PREPARACION del actor que consultar (`getExitPreparationSummary`
 * lanza 400); tras crear, esa consulta pasa a ser válida — `exit-preparation-summary`
 * del proyecto queda obsoleto. F11.1: también nace una solicitud abierta
 * donde antes no había ninguna (`currentExitRequestQueryKey` pasaba de
 * `{ solicitud: null }` a la fila real) — se invalida junto con el summary,
 * nunca con una key inline. B5 no toca `AsignacionTarea` ni
 * `ParticipacionProyecto`, así que no hay causa contractual para invalidar
 * tasks/members desde aquí.
 */
export function useCreateExitRequest(idProyecto: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateExitRequestInput) => createExitRequest(idProyecto, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: exitPreparationSummaryQueryKey(idProyecto) });
      queryClient.invalidateQueries({ queryKey: currentExitRequestQueryKey(idProyecto) });
    },
  });
}

/**
 * B7 — `POST /proyectos/:id/salida/preparacion/continuar` (PREPARACION ->
 * PENDIENTE_LIDER). El backend ya revalida blockers server-side
 * (exit-requests.service.ts:150-161); este hook no replica esa validación,
 * solo ejecuta la transición.
 *
 * F11.1 — la fuente de verdad de "¿en qué estado está mi solicitud?" pasa a
 * ser exclusivamente `currentExitRequestQueryKey` (F11.1), nunca el valor en
 * memoria de esta mutation ni un `useState` del consumidor: se siembra el
 * caché con el body REAL de la respuesta de B7 (transición inmediata, sin
 * flash) y de inmediato se invalida para que la próxima lectura reconcilie
 * con el servidor (GET /salida/estado). Ya no se invalida
 * `exit-preparation-summary` aquí: en cuanto `currentExitRequestQueryKey`
 * dice PENDIENTE_LIDER, el consumidor debe deshabilitar esa query (B6
 * siempre respondería 400) — invalidarla solo produciría un fetch inútil.
 */
export function useContinueExitPreparation(idProyecto: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => continueExitPreparation(idProyecto),
    onSuccess: (data) => {
      queryClient.setQueryData(currentExitRequestQueryKey(idProyecto), {
        solicitud: { ...data, estadoSolicitud: 'PENDIENTE_LIDER' as const },
      });
      queryClient.invalidateQueries({ queryKey: currentExitRequestQueryKey(idProyecto) });
    },
  });
}

/**
 * B8 — `POST /proyectos/:id/salida/preparacion/cancelar` (PREPARACION ->
 * CANCELADA). No valida blockers en el cliente: B8 permite cancelar
 * independientemente de `cantidadBlockers`. Mismo razonamiento de
 * invalidación que `useContinueExitPreparation` — `exit-preparation-summary`
 * queda obsoleto porque la solicitud deja PREPARACION.
 */
export function useCancelExitPreparation(idProyecto: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => cancelExitPreparation(idProyecto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: exitPreparationSummaryQueryKey(idProyecto) });
      // F11.1: CANCELADA deja de ser una solicitud "abierta" — currentExitRequestQueryKey
      // debe volver a resolver `{ solicitud: null }` en la próxima lectura.
      queryClient.invalidateQueries({ queryKey: currentExitRequestQueryKey(idProyecto) });
    },
  });
}

/**
 * B9 — `POST /proyectos/:id/solicitudes-salida/:idSolicitud/aprobar`
 * (PENDIENTE_LIDER -> APROBADA). No toca `exit-preparation-summary`:
 * ese read-model solo consulta solicitudes en PREPARACION del actor, y una
 * solicitud PENDIENTE_LIDER nunca calificó para esa query.
 *
 * Side effect real auditado en exit-requests.service.ts:279-313: además del
 * estado de la solicitud, retira TODAS las `ParticipacionProyecto` ACTIVO
 * del usuario en el proyecto (ACTIVO -> RETIRADO) y reconoce sus horas del
 * Sprint activo. Eso deja obsoletos tres read-models cross-domain ya
 * existentes que sí reflejan `estadoParticipacion`:
 *  - `GET /proyectos/:id/equipo` (`findTeam`, filtra ACTIVO) — el usuario
 *    desaparece de la lista.
 *  - `GET /proyectos/:id/miembros/resumen` (T-106, person-centric).
 *  - `GET /proyectos/:id/equipo/:idUsuario` (`findTeamMemberDetail`, incluye
 *    histórico — su `estadoParticipacion` cambia para ESTE usuario).
 * No se invalida `sprint-closing-summary`: el reconocimiento de horas ocurre
 * sobre el Sprint activo resuelto server-side, cuyo `idSprint` esta
 * respuesta nunca expone — no hay forma de construir esa key sin inventar
 * un id (ver riesgos de la auditoría final).
 */
export function useApproveExitRequest(idProyecto: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (idSolicitud: number) => approveExitRequest(idProyecto, idSolicitud),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: projectMembersQueryKey(idProyecto) });
      queryClient.invalidateQueries({ queryKey: projectTeamSummaryQueryKey(idProyecto) });
      queryClient.invalidateQueries({
        queryKey: projectMemberDetailQueryKey(idProyecto, data.idUsuario),
      });
    },
  });
}

/**
 * B9 — `POST /proyectos/:id/solicitudes-salida/:idSolicitud/rechazar`
 * (PENDIENTE_LIDER -> RECHAZADA). Auditado en
 * exit-requests.service.ts:324-355: a diferencia de aprobar, rechazar no
 * toca `ParticipacionProyecto` ni horas, solo el estado de la solicitud y
 * una notificación. Ningún read-model consumido por F7 (ni
 * `exit-preparation-summary`, que solo mira PREPARACION; ni
 * `members`/`team`, que rechazar nunca modifica) queda obsoleto, así que
 * esta mutation no invalida ninguna query.
 */
export function useRejectExitRequest(idProyecto: number) {
  return useMutation({
    mutationFn: (idSolicitud: number) => rejectExitRequest(idProyecto, idSolicitud),
  });
}
