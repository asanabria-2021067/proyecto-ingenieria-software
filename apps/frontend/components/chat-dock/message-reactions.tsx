'use client';

import { useState } from 'react';
import { SmilePlus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EMOJIS_REACCION } from '@/lib/chat-reacciones';
import type { ChatReaccion } from '@/lib/types/chat';

interface MessageReactionsProps {
  reacciones: ChatReaccion[];
  onToggle: (emoji: string) => void;
}

function moverFoco(event: React.KeyboardEvent<HTMLDivElement>) {
  const paso = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
  if (!paso) return;
  const botones = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
  const i = botones.indexOf(document.activeElement as HTMLButtonElement);
  botones[(i + paso + botones.length) % botones.length]?.focus();
  event.preventDefault();
}

export function MessageReactions({ reacciones, onToggle }: MessageReactionsProps) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {reacciones.map(({ emoji, count, reaccionadoPorMi }) => (
        <button
          key={emoji}
          type="button"
          aria-pressed={reaccionadoPorMi}
          aria-label={`${emoji} ${count} ${count === 1 ? 'reacción' : 'reacciones'}${reaccionadoPorMi ? ', incluyes la tuya' : ''}`}
          onClick={() => onToggle(emoji)}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-on-surface ${
            reaccionadoPorMi
              ? 'border-primary bg-primary/15 font-bold ring-1 ring-primary'
              : 'border-outline-variant bg-surface-container-lowest hover:bg-on-surface/10'
          }`}
        >
          <span aria-hidden="true">{emoji}</span>
          <span aria-hidden="true">{count}</span>
        </button>
      ))}

      <Popover open={abierto} onOpenChange={setAbierto}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Reaccionar al mensaje"
            className="inline-flex size-6 items-center justify-center rounded-full border border-outline-variant bg-surface-container-lowest text-text-secondary hover:bg-on-surface/10 hover:text-text-primary"
          >
            <SmilePlus className="size-3.5" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-auto p-1"
          role="group"
          aria-label="Elegir reacción"
          onKeyDown={moverFoco}
        >
          <div className="flex gap-1">
            {EMOJIS_REACCION.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={`Reaccionar con ${emoji}`}
                onClick={() => {
                  onToggle(emoji);
                  setAbierto(false);
                }}
                className="rounded-control p-1 text-lg hover:bg-on-surface/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span aria-hidden="true">{emoji}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
