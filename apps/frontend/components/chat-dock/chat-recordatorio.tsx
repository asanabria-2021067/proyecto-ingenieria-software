'use client';

import { useState } from 'react';
import { AlarmClock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCreateReminder } from '@/hooks/use-chat-extras';
import { contenidoAEditable } from '@/lib/mentions/mention-tokens';
import {
  aInputLocal,
  errorFechaRecordatorio,
  fechaDesdeInputLocal,
  opcionesRecordatorio,
} from '@/lib/chat-recordatorio';
import type { ChatMensaje } from '@/lib/types/chat';

interface RecordatorioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  idProyecto: number;
  idConversacion: number;
  /** Mensaje del que se quiere el recordatorio; el dialogo no se muestra sin el. */
  mensaje: ChatMensaje | null;
}

function formatFechaHora(fecha: Date): string {
  return fecha.toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'short' });
}

/** MEJ-46: «Recuérdamelo»: 1 h, 3 h, mañana 8:00 o una fecha propia; avisa con una notificacion con enlace al mensaje. */
export function RecordatorioDialog({ open, onOpenChange, idProyecto, idConversacion, mensaje }: RecordatorioDialogProps) {
  const crear = useCreateReminder(idProyecto, idConversacion);
  const [personalizado, setPersonalizado] = useState(false);
  const [valor, setValor] = useState('');
  const [error, setError] = useState<string | null>(null);

  const cerrar = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setPersonalizado(false);
      setValor('');
      setError(null);
    }
  };

  const programar = (fecha: Date | null) => {
    const mensajeError = errorFechaRecordatorio(fecha);
    setError(mensajeError);
    if (mensajeError || !fecha || !mensaje) return;
    crear.mutate(
      { idMensaje: mensaje.idMensaje, recordarEn: fecha.toISOString() },
      {
        onSuccess: () => {
          cerrar(false);
          toast.success(`Te lo recordaremos el ${formatFechaHora(fecha)}`);
        },
        onError: (e) => setError(e.message || 'No se pudo crear el recordatorio'),
      },
    );
  };

  const ahora = new Date();
  const opciones = opcionesRecordatorio(ahora);

  return (
    <Dialog open={open && mensaje !== null} onOpenChange={cerrar}>
      <DialogContent className="w-[96vw] max-w-[380px] gap-0 border-outline-variant bg-surface-container-lowest p-0">
        <DialogHeader className="border-b border-outline-variant/35 px-6 pb-4 pt-5 text-left">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-on-surface">
            <AlarmClock className="size-5 text-primary" aria-hidden="true" />
            Recuérdamelo
          </DialogTitle>
          <DialogDescription className="text-sm text-on-surface-variant">
            Recibirás una notificación con el enlace a este mensaje.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 px-6 py-4">
          {mensaje && (
            <p className="line-clamp-2 rounded-md bg-surface-container px-2 py-1.5 text-xs text-on-surface-variant">
              <span className="font-semibold">{mensaje.remitente.nombre}: </span>
              {contenidoAEditable(mensaje.contenido).texto || 'Mensaje con adjunto'}
            </p>
          )}
          {opciones.map((o) => (
            <Button
              key={o.id}
              type="button"
              variant="outline"
              disabled={crear.isPending}
              onClick={() => programar(o.fecha)}
              className="h-10 w-full justify-between text-sm"
            >
              <span>{o.etiqueta}</span>
              <span className="text-xs font-normal text-tertiary">{formatFechaHora(o.fecha)}</span>
            </Button>
          ))}
          {personalizado ? (
            <form
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                programar(fechaDesdeInputLocal(valor));
              }}
              className="space-y-2 pt-1"
            >
              <label htmlFor="chat-recordatorio-fecha" className="text-xs font-semibold text-on-surface">
                Recordarme el
              </label>
              <input
                id="chat-recordatorio-fecha"
                type="datetime-local"
                value={valor}
                min={aInputLocal(new Date(ahora.getTime() + 60_000))}
                onChange={(event) => setValor(event.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'chat-recordatorio-error' : undefined}
                className="h-9 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-2 text-sm text-on-surface"
              />
              <Button type="submit" disabled={crear.isPending} className="h-9 w-full gap-1.5 text-xs font-bold">
                {crear.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
                Crear recordatorio
              </Button>
            </form>
          ) : (
            <Button type="button" variant="ghost" onClick={() => setPersonalizado(true)} className="h-10 w-full text-sm">
              Elegir fecha y hora…
            </Button>
          )}
          {error && (
            <p id="chat-recordatorio-error" role="alert" className="text-xs text-error">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="border-t border-outline-variant/35 px-6 py-3">
          <Button type="button" variant="ghost" onClick={() => cerrar(false)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
