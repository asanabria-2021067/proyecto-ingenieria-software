'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Hash, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ChatMessageItem } from '@/components/chat-dock/chat-message-item';
import { ChatFijadosBarra } from '@/components/chat-dock/chat-fijados';
import { useFijadosOrganizacion, usePinMessageOrganizacion } from '@/hooks/use-chat-extras';
import type { ChatMensaje } from '@/lib/types/chat';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useCanalOrganizacion, useEnviarMensajeOrganizacion, useMensajesOrganizacion } from '@/hooks/use-organizations';
import { mensajeErrorOrganizacion } from '@/lib/organizations/errors';
import { aviso } from '@/lib/mensajes';

const sinAccion = () => {};

/** Canal #general: reutiliza la burbuja del chat de proyecto; todos los miembros leen y escriben (salvo archivada). */
export function OrgChat({ idOrganizacion, puedeFijar = false }: { idOrganizacion: number; puedeFijar?: boolean }) {
  const { data: usuario } = useCurrentUser();
  const { data: canal, isLoading, isError } = useCanalOrganizacion(idOrganizacion);
  const idConversacion = canal?.idConversacion ?? null;
  const { data: mensajes = [] } = useMensajesOrganizacion(idOrganizacion, idConversacion);
  const enviar = useEnviarMensajeOrganizacion(idOrganizacion, idConversacion);
  const { fijados } = useFijadosOrganizacion(idOrganizacion, idConversacion);
  const fijar = usePinMessageOrganizacion(idOrganizacion, idConversacion);
  const [texto, setTexto] = useState('');
  const fondo = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLDivElement>(null);

  const ordenados = useMemo(() => [...mensajes].sort((a, b) => a.idMensaje - b.idMensaje), [mensajes]);

  useEffect(() => {
    fondo.current?.scrollIntoView?.({ block: 'end' });
  }, [ordenados.length]);

  if (isLoading) return <Skeleton className="h-96 w-full rounded-card" />;
  if (isError || !canal || idConversacion === null) {
    return <p role="alert" className="text-sm text-on-surface-variant">No se pudo abrir el chat de la organización.</p>;
  }

  const alternarFijado = (mensaje: ChatMensaje, fijarMensaje: boolean) =>
    fijar.mutate(
      { idMensaje: mensaje.idMensaje, fijar: fijarMensaje },
      { onError: (err) => aviso.error('No se pudo actualizar el mensaje fijado', mensajeErrorOrganizacion(err)) },
    );

  const irAlMensaje = (idMensaje: number) =>
    lista.current?.querySelector(`[data-mensaje="${idMensaje}"]`)?.scrollIntoView?.({ block: 'center' });

  const enviarMensaje = (e: React.FormEvent) => {
    e.preventDefault();
    const contenido = texto.trim();
    if (!contenido) return;
    enviar.mutate(contenido, {
      onSuccess: () => setTexto(''),
      onError: (err) => aviso.error('No se pudo enviar el mensaje', mensajeErrorOrganizacion(err)),
    });
  };

  return (
    <div className="flex h-[32rem] max-h-[70vh] flex-col overflow-hidden rounded-card border border-outline-variant/60">
      <div className="flex items-center gap-2 border-b border-outline-variant/60 px-4 py-3">
        <Hash aria-hidden="true" className="size-4 text-on-surface-variant" />
        <h3 className="text-sm font-bold text-on-surface">{(canal.nombre ?? 'general').replace(/^#/, '')}</h3>
        <span className="text-xs text-on-surface-variant">{canal.miembros.length} miembros</span>
      </div>

      <ChatFijadosBarra
        fijados={fijados}
        onIrA={irAlMensaje}
        puedeDesfijar={() => puedeFijar && !canal.archivada}
        onDesfijar={(m) => alternarFijado(m, false)}
      />

      <div ref={lista} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" role="log" aria-label="Mensajes de #general" aria-live="polite">
        {ordenados.length === 0 && (
          <p className="py-8 text-center text-sm text-on-surface-variant">Aún no hay mensajes. Escribe el primero.</p>
        )}
        {ordenados.map((m) => (
          <ChatMessageItem
            key={m.idMensaje}
            simple
            mensaje={m}
            propio={m.remitente.idUsuario === usuario?.idUsuario}
            idProyecto={0}
            idConversacion={idConversacion}
            puedeFijar={puedeFijar && !canal.archivada}
            onFijar={alternarFijado}
            onResponder={sinAccion}
            onIrAlOriginal={sinAccion}
            onReaccionar={sinAccion}
          />
        ))}
        <div ref={fondo} />
      </div>

      {canal.archivada ? (
        <p className="border-t border-outline-variant/60 px-4 py-3 text-center text-xs text-on-surface-variant">
          La organización está archivada: el chat queda en solo lectura.
        </p>
      ) : (
        <form onSubmit={enviarMensaje} className="flex items-center gap-2 border-t border-outline-variant/60 p-3">
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={4000}
            placeholder="Escribe un mensaje a todos"
            aria-label="Mensaje para #general"
            autoComplete="off"
          />
          <Button type="submit" size="icon" disabled={!texto.trim() || enviar.isPending} aria-label="Enviar mensaje">
            <Send aria-hidden="true" />
          </Button>
        </form>
      )}
    </div>
  );
}
