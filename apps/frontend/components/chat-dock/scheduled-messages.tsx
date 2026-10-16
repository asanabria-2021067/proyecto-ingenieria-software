'use client';

import { useState } from 'react';
import { CalendarClock, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCancelScheduledMessage, useScheduleMessage, useScheduledMessages } from '@/hooks/use-chat';

const MIN_MS = 60_000;
const MAX_MS = 30 * 24 * 60 * 60 * 1000;

/** Valor para <input type="datetime-local"> en hora local: YYYY-MM-DDTHH:mm. */
function aValorLocal(fecha: Date): string {
  const local = new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/** Devuelve el mensaje de error, o null si la fecha es válida (mismas reglas que el backend). */
export function validarEnvio(valor: string, ahora: Date = new Date()): string | null {
  const fecha = new Date(valor);
  if (!valor || Number.isNaN(fecha.getTime())) return 'Elige fecha y hora de envío';
  const diff = fecha.getTime() - ahora.getTime();
  if (diff < MIN_MS) return 'La hora debe ser al menos 1 minuto en el futuro';
  if (diff > MAX_MS) return 'La hora no puede superar los 30 días';
  return null;
}

function formatFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short' });
}

interface ScheduleMessageButtonProps {
  idProyecto: number;
  idConversacion: number;
  texto: string;
  onScheduled: () => void;
}

export function ScheduleMessageButton({ idProyecto, idConversacion, texto, onScheduled }: ScheduleMessageButtonProps) {
  const programar = useScheduleMessage(idProyecto, idConversacion);
  const [open, setOpen] = useState(false);
  const [valor, setValor] = useState('');
  const [error, setError] = useState<string | null>(null);
  const contenido = texto.trim();

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    setValor('');
    setError(null);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const mensajeError = validarEnvio(valor);
    setError(mensajeError);
    if (mensajeError) return;
    programar.mutate(
      { contenido, enviarEn: new Date(valor).toISOString() },
      {
        onSuccess: () => {
          handleOpenChange(false);
          onScheduled();
          toast.success('Mensaje programado');
        },
        onError: () => toast.error('No se pudo programar el mensaje'),
      },
    );
  };

  const ahora = new Date();

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          disabled={contenido.length === 0}
          className="size-9 shrink-0 rounded-full text-text-secondary"
          aria-label="Programar envío"
          title={contenido.length === 0 ? 'Escribe un mensaje para programarlo' : 'Programar envío'}
        >
          <CalendarClock className="size-4" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <form onSubmit={handleSubmit} noValidate className="space-y-3">
          <label htmlFor="chat-programar-fecha" className="text-xs font-semibold text-on-surface">
            Enviar el
          </label>
          <input
            id="chat-programar-fecha"
            type="datetime-local"
            value={valor}
            min={aValorLocal(new Date(ahora.getTime() + MIN_MS))}
            max={aValorLocal(new Date(ahora.getTime() + MAX_MS))}
            onChange={(event) => setValor(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'chat-programar-error' : undefined}
            className="h-9 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-2 text-sm text-on-surface"
          />
          {error && (
            <p id="chat-programar-error" role="alert" className="text-xs text-error">
              {error}
            </p>
          )}
          <Button type="submit" disabled={programar.isPending} className="h-9 w-full gap-1.5 text-xs font-bold">
            {programar.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
            Programar
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

interface ScheduledMessagesListProps {
  idProyecto: number;
  idConversacion: number;
}

export function ScheduledMessagesList({ idProyecto, idConversacion }: ScheduledMessagesListProps) {
  const { programados } = useScheduledMessages(idProyecto, idConversacion);
  const cancelar = useCancelScheduledMessage(idProyecto, idConversacion);

  if (programados.length === 0) return null;

  return (
    <section aria-label="Mensajes programados" className="border-t border-outline-variant bg-surface-container px-3 py-2">
      <p className="mb-1 text-[11px] font-semibold text-tertiary">Programados</p>
      <ul className="space-y-1">
        {programados.map((p) => (
          <li key={p.idMensajeProgramado} className="flex items-center gap-2 text-xs text-on-surface">
            <CalendarClock className="size-3.5 shrink-0 text-tertiary" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{p.contenido}</span>
            <time dateTime={p.enviarEn} className="shrink-0 text-tertiary">
              {formatFechaHora(p.enviarEn)}
            </time>
            <button
              type="button"
              disabled={cancelar.isPending}
              onClick={() =>
                cancelar.mutate(p.idMensajeProgramado, {
                  onSuccess: () => toast.success('Envío programado cancelado'),
                  onError: () => toast.error('No se pudo cancelar el envío programado'),
                })
              }
              aria-label={`Cancelar mensaje programado para ${formatFechaHora(p.enviarEn)}`}
              className="rounded-control p-1 text-text-secondary hover:bg-on-surface/10 hover:text-text-primary"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
