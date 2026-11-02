'use client';

import { Pin, PinOff } from 'lucide-react';
import { MAX_FIJADOS, resumenMensaje } from '@/lib/chat-extras';
import type { ChatMensaje } from '@/lib/types/chat';

interface ChatFijadosBarraProps {
  fijados: ChatMensaje[];
  onIrA: (idMensaje: number) => void;
  /** Sin esta función (o si devuelve false para el mensaje) no se muestra «Desfijar». */
  puedeDesfijar?: (mensaje: ChatMensaje) => boolean;
  onDesfijar?: (mensaje: ChatMensaje) => void;
}

/** Barra bajo la cabecera con los mensajes fijados (hasta 3); clic salta al mensaje en el historial. */
export function ChatFijadosBarra({ fijados, onIrA, puedeDesfijar, onDesfijar }: ChatFijadosBarraProps) {
  if (fijados.length === 0) return null;
  return (
    <section aria-label="Mensajes fijados" className="shrink-0 border-b border-outline-variant bg-surface-container px-3 py-2">
      <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-tertiary">
        <Pin className="size-3" aria-hidden="true" />
        Fijados ({fijados.length}/{MAX_FIJADOS})
      </p>
      <ul className="space-y-1">
        {fijados.map((m) => (
          <li key={m.idMensaje} className="flex items-center gap-2 text-xs text-on-surface">
            <button
              type="button"
              onClick={() => onIrA(m.idMensaje)}
              className="min-w-0 flex-1 truncate rounded-control px-1 py-0.5 text-left hover:bg-on-surface/10 motion-focus"
              title={resumenMensaje(m)}
            >
              <span className="font-semibold">{m.remitente.nombre}: </span>
              {resumenMensaje(m)}
            </button>
            {onDesfijar && puedeDesfijar?.(m) && (
              <button
                type="button"
                onClick={() => onDesfijar(m)}
                aria-label={`Desfijar el mensaje de ${m.remitente.nombre}`}
                className="shrink-0 rounded-control p-1 text-text-secondary hover:bg-on-surface/10 hover:text-text-primary"
              >
                <PinOff className="size-3.5" aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
