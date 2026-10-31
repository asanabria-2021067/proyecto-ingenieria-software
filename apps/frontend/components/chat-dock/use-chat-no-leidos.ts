'use client';

import { useEffect, useState } from 'react';
import { useAllConversations, useNoMolestar } from '@/hooks/use-chat';
import { estaEnNoMolestar, totalNoLeidos } from '@/lib/chat-silencio';

/**
 * Contador de mensajes sin leer del chat, compartido por el icono de la barra
 * superior, el botón flotante y la barra lateral. Se alimenta de la lista global
 * que el socket del dock invalida con cada mensaje nuevo; no cuenta lo silenciado
 * ni lo que llega en horario de «No molestar».
 */
export function useChatNoLeidos() {
  const { conversations } = useAllConversations();
  const { config: noMolestar } = useNoMolestar();
  const [ahora, setAhora] = useState(() => new Date());

  // El horario de no molestar entra y sale solo: se reevalúa cada minuto.
  useEffect(() => {
    if (!noMolestar?.activo) return;
    const timer = setInterval(() => setAhora(new Date()), 60_000);
    return () => clearInterval(timer);
  }, [noMolestar?.activo]);

  return {
    total: totalNoLeidos(conversations, ahora, noMolestar),
    enNoMolestar: estaEnNoMolestar(noMolestar, ahora),
  };
}
