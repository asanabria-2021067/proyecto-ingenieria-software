import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { projectSprintsQueryKey, sprintClosingSummaryQueryKey } from '@/lib/query-keys/sprints';
import {
  closeReadinessPrefix,
  closureDraftQueryKey,
  closureRevisionPrefix,
  closureRevisionsPrefix,
} from '@/lib/query-keys/closure';
import { projectDetailQueryKey } from '@/lib/query-keys/project';
import { historicalProjectQueryKey } from '@/lib/query-keys/historical';
import {
  leadershipAppealsPrefix,
  leadershipCandidatesQueryKey,
  leadershipContextQueryKey,
  leadershipHistoryPrefix,
} from '@/lib/query-keys/leadership';
import { projectMembersQueryKey, projectTeamSummaryQueryKey } from '@/lib/query-keys/members';
import { adminAppealsPrefix, adminProjectDetailQueryKey, adminProjectsPrefix } from '@/lib/query-keys/admin-projects';
import { projectTasksQueryKey, taskHoursQueryKey } from '@/lib/query-keys/tasks';

export interface Notification {
  tipoNotificacion: string;
  tituloNotificacion: string;
  mensajeNotificacion?: string;
  datosJson?: any;
}

/** Payload real de A4/A9.1 — ver notifications.gateway.ts (backend): `{ projectId, sprintId }`. */
interface SprintRealtimePayload {
  projectId: number;
  sprintId: number;
}

/** Payload real de HU-142/T-171 — ver notifications.gateway.ts (backend): `{ projectId, taskId, idAsignacion }`. */
interface TaskHoursLoggedPayload {
  projectId: number;
  taskId: number;
  idAsignacion: number;
}

/** S7 — payload real de `SPRINT_HOURS_ADJUSTED` (notifications.service.ts): `{ projectId, sprintId, idAsignacion }`. */
interface SprintHoursAdjustedPayload {
  projectId: number;
  sprintId: number;
  idAsignacion: number;
}

/** S7 — payload real de `PROJECT_STATE_CHANGED`: `{ projectId, estadoProyecto }`. Solo se usa `projectId`. */
interface ProjectStateChangedPayload {
  projectId: number;
  estadoProyecto: string;
}

/** S7 — payload real de `LEADERSHIP_CHANGED`: solo IDs. NUNCA se derivan permisos de él. */
interface LeadershipChangedPayload {
  projectId: number;
  historialId: number;
  liderAnteriorId: number;
  liderNuevoId: number;
  origen: string;
}

/** S7 — payload real de `CLOSURE_REVIEW_UPDATED`: `{ projectId, revisionId }`. */
interface ClosureReviewUpdatedPayload {
  projectId: number;
  revisionId: number;
}

export function useRealtimeNotifications(enabled: boolean) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [latestNotification, setLatestNotification] = useState<Notification | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    // El esquema ws/wss se deriva de cómo se sirve la página (no del prefijo
    // http/https de NEXT_PUBLIC_API_URL): si la página es https y el env var
    // quedó en http (proxy externo con TLS añadido después del build), un
    // ws:// literal sería mixed content y el navegador lo bloquearía.
    const wsScheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = apiUrl.replace(/^https?/, wsScheme);

    // La sesión vive en la cookie httpOnly access_token; `withCredentials`
    // hace que el handshake (polling + upgrade) la adjunte, sin que el JS
    // del navegador necesite leerla ni pasarla en `auth.token`.
    const newSocket = io(`${wsUrl}/notifications`, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    const handleConnect = () => {
      setIsConnected(true);
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    const handleConnected = (data: unknown) => {
      console.log('WebSocket connected:', data);
    };

    const handleNotification = (data: Notification) => {
      setLatestNotification(data);
    };

    // F6 (A4/A9.1): el estado real de un Sprint sigue viviendo en la query
    // `project-sprints` (F1) — estos dos handlers únicamente invalidan esa
    // key con el `projectId` real del payload, nunca guardan un booleano de
    // "finalizando"/"cerrado" aparte. Así, FinalizationLockBanner deriva
    // siempre del backend (persistencia tras reload/reconexión/entrar
    // tarde ya cubierta por la propia query, no por haber presenciado el
    // evento). `projectId` (no `idProyecto`) porque así lo emite el
    // gateway real — ver payload documentado arriba.
    const handleSprintFinalizationStarted = (payload: SprintRealtimePayload) => {
      queryClient.invalidateQueries({ queryKey: projectSprintsQueryKey(payload.projectId) });
    };

    const handleSprintClosed = (payload: SprintRealtimePayload) => {
      queryClient.invalidateQueries({ queryKey: projectSprintsQueryKey(payload.projectId) });
    };

    // HU-142 (T-171): mismo criterio que los handlers de Sprint — invalida
    // las queries reales (`project-tasks` y `task-hours`) en vez de guardar
    // un estado aparte, para que el total de horas registradas se mantenga
    // correcto en cualquier pestaña abierta cuando otra persona registra
    // horas sobre la misma tarea.
    const handleTaskHoursLogged = (payload: TaskHoursLoggedPayload) => {
      queryClient.invalidateQueries({ queryKey: projectTasksQueryKey(payload.projectId) });
      queryClient.invalidateQueries({ queryKey: taskHoursQueryKey(payload.projectId, payload.taskId) });
    };

    // S7 (F002): punto de extensión de realtime. Cada evento nuevo SOLO
    // invalida las queries que le corresponden con los ids del payload; el
    // backend decide el nuevo estado al reconsultar. Nunca se deriva estado
    // de dominio ni permisos del payload.
    const handleSprintHoursAdjusted = (payload: SprintHoursAdjustedPayload) => {
      queryClient.invalidateQueries({
        queryKey: sprintClosingSummaryQueryKey(payload.projectId, payload.sprintId),
      });
    };

    // S7 (F005): el estado del proyecto NUNCA se deriva del payload
    // (`estadoProyecto` viaja solo como diagnóstico); se invalida el detalle
    // y el readiness para que el servidor vuelva a decidir.
    const handleProjectStateChanged = (payload: ProjectStateChangedPayload) => {
      queryClient.invalidateQueries({ queryKey: projectDetailQueryKey(payload.projectId) });
      queryClient.invalidateQueries({ queryKey: closeReadinessPrefix(payload.projectId) });
      // VIEW-02: el GET público (`['proyecto', id]`) y el histórico cambian
      // cuando el proyecto pasa a CERRADO; el modo read-only aparece sin recargar.
      queryClient.invalidateQueries({ queryKey: ['proyecto', String(payload.projectId)] });
      queryClient.invalidateQueries({ queryKey: historicalProjectQueryKey(payload.projectId) });
      // VIEW-12: el conteo «Cierre pendiente» del panel administrativo (key ya existente).
      queryClient.invalidateQueries({ queryKey: ['adminStats'] });
      // VIEW-15/16: la bandeja administrativa mueve el proyecto de grupo y el detalle cambia de estado.
      queryClient.invalidateQueries({ queryKey: adminProjectsPrefix });
      queryClient.invalidateQueries({ queryKey: adminProjectDetailQueryKey(payload.projectId) });
    };

    const handleClosureReviewUpdated = (payload: ClosureReviewUpdatedPayload) => {
      queryClient.invalidateQueries({ queryKey: closureDraftQueryKey(payload.projectId) });
      queryClient.invalidateQueries({ queryKey: closeReadinessPrefix(payload.projectId) });
      queryClient.invalidateQueries({ queryKey: closureRevisionsPrefix(payload.projectId) });
      queryClient.invalidateQueries({ queryKey: closureRevisionPrefix(payload.projectId) });
      queryClient.invalidateQueries({ queryKey: ['adminStats'] });
      queryClient.invalidateQueries({ queryKey: adminProjectsPrefix });
    };

    // S7 (F008): un cambio de liderazgo invalida TODO lo que deriva del líder,
    // incluido el detalle del proyecto (`['project', id]`): la sidebar deriva
    // `isLeader` de `Proyecto.creadoPor` y sin esta invalidación un ex-líder
    // seguiría viendo destinos de líder hasta recargar. El servidor decide.
    const handleLeadershipChanged = (payload: LeadershipChangedPayload) => {
      queryClient.invalidateQueries({ queryKey: leadershipContextQueryKey(payload.projectId) });
      queryClient.invalidateQueries({ queryKey: leadershipCandidatesQueryKey(payload.projectId) });
      queryClient.invalidateQueries({ queryKey: leadershipHistoryPrefix(payload.projectId) });
      queryClient.invalidateQueries({ queryKey: leadershipAppealsPrefix(payload.projectId) });
      queryClient.invalidateQueries({ queryKey: projectDetailQueryKey(payload.projectId) });
      queryClient.invalidateQueries({ queryKey: ['proyecto', String(payload.projectId)] });
      queryClient.invalidateQueries({ queryKey: projectTeamSummaryQueryKey(payload.projectId) });
      queryClient.invalidateQueries({ queryKey: projectMembersQueryKey(payload.projectId) });
      queryClient.invalidateQueries({ queryKey: adminProjectDetailQueryKey(payload.projectId) });
      queryClient.invalidateQueries({ queryKey: adminAppealsPrefix });
    };

    newSocket.on('connect', handleConnect);
    newSocket.on('disconnect', handleDisconnect);
    newSocket.on('connected', handleConnected);
    newSocket.on('notification', handleNotification);
    newSocket.on('SPRINT_FINALIZATION_STARTED', handleSprintFinalizationStarted);
    newSocket.on('SPRINT_CLOSED', handleSprintClosed);
    newSocket.on('TASK_HOURS_LOGGED', handleTaskHoursLogged);
    newSocket.on('SPRINT_HOURS_ADJUSTED', handleSprintHoursAdjusted);
    newSocket.on('PROJECT_STATE_CHANGED', handleProjectStateChanged);
    newSocket.on('CLOSURE_REVIEW_UPDATED', handleClosureReviewUpdated);
    newSocket.on('LEADERSHIP_CHANGED', handleLeadershipChanged);

    const timeoutId = window.setTimeout(() => setSocket(newSocket), 0);

    return () => {
      window.clearTimeout(timeoutId);
      newSocket.off('connect', handleConnect);
      newSocket.off('disconnect', handleDisconnect);
      newSocket.off('connected', handleConnected);
      newSocket.off('notification', handleNotification);
      newSocket.off('SPRINT_FINALIZATION_STARTED', handleSprintFinalizationStarted);
      newSocket.off('SPRINT_CLOSED', handleSprintClosed);
      newSocket.off('TASK_HOURS_LOGGED', handleTaskHoursLogged);
      newSocket.off('SPRINT_HOURS_ADJUSTED', handleSprintHoursAdjusted);
      newSocket.off('PROJECT_STATE_CHANGED', handleProjectStateChanged);
      newSocket.off('CLOSURE_REVIEW_UPDATED', handleClosureReviewUpdated);
      newSocket.off('LEADERSHIP_CHANGED', handleLeadershipChanged);
      newSocket.close();
    };
  }, [enabled, queryClient]);

  return { socket, latestNotification, isConnected };
}
