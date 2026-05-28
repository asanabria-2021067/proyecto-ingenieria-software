import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export interface Notification {
  tipoNotificacion: string;
  tituloNotificacion: string;
  mensajeNotificacion?: string;
  datosJson?: any;
}

export function useRealtimeNotifications(token: string | null) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [latestNotification, setLatestNotification] = useState<Notification | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!token) return;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const wsUrl = apiUrl.replace(/^http/, 'ws');

    const newSocket = io(`${wsUrl}/notifications`, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    newSocket.on('connect', () => {
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
    });

    newSocket.on('connected', (data) => {
      console.log('WebSocket connected:', data);
    });

    newSocket.on('notification', (data: Notification) => {
      setLatestNotification(data);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [token]);

  return { socket, latestNotification, isConnected };
}
