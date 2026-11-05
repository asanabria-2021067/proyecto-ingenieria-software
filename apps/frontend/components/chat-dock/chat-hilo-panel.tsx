'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useHilo, useResponderHilo } from '@/hooks/use-chat-hilos';
import { etiquetaRespuestas } from '@/lib/chat-hilos';
import type { ChatMensaje, ChatUsuario } from '@/lib/types/chat';
import { extractoDe } from './chat-cita';
import { ChatMessageItem } from './chat-message-item';

interface ChatHiloPanelProps {
  idProyecto: number;
  idConversacion: number;
  /** Mensaje original del hilo; su contador `respuestas` lo mantiene la caché del canal. */
  mensaje: ChatMensaje;
  idUsuarioActual: number | null;
  participantes?: ChatUsuario[];
  onCerrar: () => void;
}

/** MEJ-131: panel lateral con las respuestas a un mensaje. Las respuestas no se mezclan con el canal. */
export function ChatHiloPanel({ idProyecto, idConversacion, mensaje, idUsuarioActual, participantes, onCerrar }: ChatHiloPanelProps) {
  const { respuestas, isLoading, isError, refetch, puedeCargarAnteriores, cargarAnteriores, cargandoAnteriores } = useHilo(
    idProyecto,
    idConversacion,
    mensaje.idMensaje,
  );
  const responder = useResponderHilo(idProyecto, idConversacion, mensaje.idMensaje);
  const [texto, setTexto] = useState('');
  const listaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const ultimoId = respuestas[respuestas.length - 1]?.idMensaje;

  useEffect(() => inputRef.current?.focus(), []);
  // Solo al llegar una respuesta nueva: cargar anteriores no debe mover la vista al final.
  useEffect(() => listaRef.current?.scrollTo({ top: listaRef.current.scrollHeight }), [ultimoId]);

  const enviar = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const contenido = texto.trim();
    if (!contenido) return;
    responder.mutate(contenido, {
      onSuccess: () => setTexto(''),
      onError: (error) => toast.error(error.message || 'No se pudo enviar la respuesta'),
    });
  };

  const autor = `${mensaje.remitente.nombre} ${mensaje.remitente.apellido}`.trim();

  return (
    <aside
      aria-label="Hilo de respuestas"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onCerrar();
        }
      }}
      className="absolute inset-y-0 right-0 z-20 flex w-full max-w-[24rem] flex-col border-l border-outline-variant bg-surface-container-lowest shadow-raised"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-outline-variant bg-surface-container px-3 py-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-on-surface">Hilo</h3>
          <p className="text-[11px] text-text-secondary">{etiquetaRespuestas(respuestas.length)}</p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar hilo"
          className="motion-icon motion-focus rounded-md p-1 text-text-secondary hover:bg-on-surface/10 hover:text-text-primary"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="shrink-0 border-b border-outline-variant px-3 py-2">
        <p className="text-[11px] font-semibold text-on-surface">{autor}</p>
        <p className="line-clamp-3 break-words text-xs text-text-secondary">
          {mensaje.eliminadoEn ? 'Mensaje eliminado' : extractoDe(mensaje.contenido) || 'Archivo adjunto'}
        </p>
      </div>

      <div ref={listaRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {puedeCargarAnteriores && (
          <Button type="button" variant="outline" size="sm" onClick={() => void cargarAnteriores()} disabled={cargandoAnteriores} className="mx-auto flex">
            {cargandoAnteriores ? 'Cargando…' : 'Ver respuestas anteriores'}
          </Button>
        )}
        {isLoading && (
          <p className="flex items-center gap-2 text-xs text-tertiary" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Cargando respuestas…
          </p>
        )}
        {isError && (
          <p role="alert" className="text-xs text-error">
            No se pudo cargar el hilo.{' '}
            <button type="button" onClick={() => void refetch()} className="font-semibold underline">
              Reintentar
            </button>
          </p>
        )}
        {!isLoading && !isError && respuestas.length === 0 && (
          <p className="text-xs text-tertiary">Todavía no hay respuestas. Escribe la primera.</p>
        )}
        {respuestas.map((r) => (
          <ChatMessageItem
            key={r.idMensaje}
            mensaje={r}
            propio={r.remitente.idUsuario === idUsuarioActual}
            idProyecto={idProyecto}
            idConversacion={idConversacion}
            idUsuarioActual={idUsuarioActual}
            participantes={participantes}
            simple
            onResponder={() => undefined}
            onIrAlOriginal={() => undefined}
            onReaccionar={() => undefined}
          />
        ))}
      </div>

      <form onSubmit={enviar} className="flex shrink-0 items-center gap-2 border-t border-outline-variant p-2">
        <Input
          ref={inputRef}
          value={texto}
          onChange={(event) => setTexto(event.target.value)}
          maxLength={4000}
          disabled={responder.isPending}
          aria-label="Responder en el hilo"
          placeholder="Responder en el hilo…"
          className="h-9 min-w-0 flex-1 rounded-full border-outline-variant text-sm"
        />
        <Button
          type="submit"
          size="icon"
          disabled={responder.isPending || texto.trim().length === 0}
          aria-label="Enviar respuesta"
          className="size-9 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
        >
          <Send className="size-4" aria-hidden="true" />
        </Button>
      </form>
    </aside>
  );
}
