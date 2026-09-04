import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { projectSprintsQueryKey } from '@/lib/query-keys/sprints';

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

    newSocket.on('connect', handleConnect);
    newSocket.on('disconnect', handleDisconnect);
    newSocket.on('connected', handleConnected);
    newSocket.on('notification', handleNotification);
    newSocket.on('SPRINT_FINALIZATION_STARTED', handleSprintFinalizationStarted);
    newSocket.on('SPRINT_CLOSED', handleSprintClosed);

    const timeoutId = window.setTimeout(() => setSocket(newSocket), 0);

    return () => {
      window.clearTimeout(timeoutId);
      newSocket.off('connect', handleConnect);
      newSocket.off('disconnect', handleDisconnect);
      newSocket.off('connected', handleConnected);
      newSocket.off('notification', handleNotification);
      newSocket.off('SPRINT_FINALIZATION_STARTED', handleSprintFinalizationStarted);
      newSocket.off('SPRINT_CLOSED', handleSprintClosed);
      newSocket.close();
    };
  }, [enabled, queryClient]);

  return { socket, latestNotification, isConnected };
}
