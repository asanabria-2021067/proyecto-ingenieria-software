'use client';

import { useState } from 'react';
import { BarChart3, Check, Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Tag } from '@/components/ui/tag';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useClosePoll, useCreatePoll, useVotePoll } from '@/hooks/use-chat-extras';
import {
  ENCUESTA_MAX_OPCIONES,
  ENCUESTA_MIN_OPCIONES,
  encuestaCerrada,
  misVotos,
  porcentajeOpcion,
  totalVotantes,
} from '@/lib/chat-extras';
import type { ChatMensaje, CrearEncuestaPayload } from '@/lib/types/chat';

interface ChatEncuestaTarjetaProps {
  mensaje: ChatMensaje;
  idProyecto: number;
  idConversacion: number;
  idUsuarioActual: number | null;
  /** Autor de la encuesta o líder del proyecto. */
  puedeCerrar: boolean;
}

function formatFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short' });
}

/** Encuesta dentro de la burbuja: votar, ver los resultados en vivo (llegan por socket) y cerrarla. */
export function ChatEncuestaTarjeta({ mensaje, idProyecto, idConversacion, idUsuarioActual, puedeCerrar }: ChatEncuestaTarjetaProps) {
  const encuesta = mensaje.encuesta;
  const votar = useVotePoll(idProyecto, idConversacion);
  const cerrar = useClosePoll(idProyecto, idConversacion);
  if (!encuesta) return null;

  const cerrada = encuestaCerrada(encuesta);
  const mios = misVotos(encuesta, idUsuarioActual);
  const votantes = totalVotantes(encuesta);

  const elegir = (idOpcion: number) => {
    const siguientes = encuesta.multiple
      ? mios.includes(idOpcion)
        ? mios.filter((id) => id !== idOpcion)
        : [...mios, idOpcion]
      : mios.includes(idOpcion)
        ? []
        : [idOpcion];
    votar.mutate({ idMensaje: mensaje.idMensaje, idsOpciones: siguientes }, { onError: () => toast.error('No se pudo registrar tu voto') });
  };

  return (
    <div className="min-w-56 space-y-2 rounded-lg bg-surface-container-lowest p-3 text-on-surface" data-testid="encuesta">
      <div className="flex items-start gap-2">
        <BarChart3 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <p className="min-w-0 flex-1 break-words text-sm font-semibold">{encuesta.pregunta}</p>
      </div>
      <p className="text-[11px] text-tertiary">{encuesta.multiple ? 'Puedes elegir varias opciones' : 'Elige una opción'}</p>
      <ul className="space-y-1.5" aria-label="Opciones de la encuesta">
        {encuesta.opciones.map((opcion) => {
          const porcentaje = porcentajeOpcion(encuesta, opcion.idOpcion);
          const elegida = mios.includes(opcion.idOpcion);
          return (
            <li key={opcion.idOpcion}>
              <button
                type="button"
                aria-pressed={elegida}
                disabled={cerrada || votar.isPending}
                onClick={() => elegir(opcion.idOpcion)}
                className={`relative flex w-full items-center gap-2 overflow-hidden rounded-md border px-2.5 py-1.5 text-left text-xs motion-focus disabled:cursor-default ${
                  elegida ? 'border-primary' : 'border-outline-variant'
                }`}
              >
                <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-primary/15" style={{ width: `${porcentaje}%` }} />
                <span className="relative flex size-4 shrink-0 items-center justify-center">
                  {elegida && <Check className="size-4 text-primary" aria-hidden="true" />}
                </span>
                <span className="relative min-w-0 flex-1 break-words font-medium">{opcion.texto}</span>
                <span className="relative shrink-0 tabular-nums text-tertiary" aria-live="polite">
                  {opcion.votos.length} · {porcentaje}%
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-tertiary">
        <span aria-live="polite">{votantes === 1 ? '1 votante' : `${votantes} votantes`}</span>
        {cerrada ? (
          <Tag tone="closed" size="sm">Cerrada</Tag>
        ) : encuesta.cierraEn ? (
          <span>Cierra el {formatFechaHora(encuesta.cierraEn)}</span>
        ) : null}
        {!cerrada && puedeCerrar && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={cerrar.isPending}
            onClick={() =>
              cerrar.mutate(mensaje.idMensaje, {
                onSuccess: () => toast.success('Encuesta cerrada'),
                onError: () => toast.error('No se pudo cerrar la encuesta'),
              })
            }
            className="ml-auto h-6 px-2 text-[11px]"
          >
            Cerrar encuesta
          </Button>
        )}
      </div>
    </div>
  );
}

/** Valor para <input type="datetime-local"> en hora local: YYYY-MM-DDTHH:mm. */
function aValorLocal(fecha: Date): string {
  const local = new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/** Mensaje de error, o null si la encuesta es válida (mismas reglas que el backend). */
export function validarEncuesta(pregunta: string, opciones: string[], cierraEn: string, ahora: Date = new Date()): string | null {
  if (!pregunta.trim()) return 'Escribe la pregunta';
  const textos = opciones.map((o) => o.trim());
  if (textos.some((o) => !o)) return 'Completa o quita las opciones vacías';
  if (textos.length < ENCUESTA_MIN_OPCIONES) return `Agrega al menos ${ENCUESTA_MIN_OPCIONES} opciones`;
  if (new Set(textos.map((o) => o.toLowerCase())).size !== textos.length) return 'Las opciones no se pueden repetir';
  if (cierraEn && new Date(cierraEn).getTime() <= ahora.getTime()) return 'El cierre debe ser una fecha futura';
  return null;
}

interface NuevaEncuestaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  idProyecto: number;
  idConversacion: number;
}

export function NuevaEncuestaDialog({ open, onOpenChange, idProyecto, idConversacion }: NuevaEncuestaDialogProps) {
  const crear = useCreatePoll(idProyecto, idConversacion);
  const [pregunta, setPregunta] = useState('');
  const [opciones, setOpciones] = useState(['', '']);
  const [multiple, setMultiple] = useState(false);
  const [cierraEn, setCierraEn] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Se fija al montar; validarEncuesta vuelve a comprobar la fecha al publicar.
  const [minimoCierre] = useState(() => aValorLocal(new Date(Date.now() + 60_000)));

  const cambiarOpcion = (indice: number, valor: string) => setOpciones((actuales) => actuales.map((o, i) => (i === indice ? valor : o)));

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const mensajeError = validarEncuesta(pregunta, opciones, cierraEn);
    setError(mensajeError);
    if (mensajeError) return;
    const payload: CrearEncuestaPayload = {
      pregunta: pregunta.trim(),
      opciones: opciones.map((o) => o.trim()),
      multiple,
      ...(cierraEn ? { cierraEn: new Date(cierraEn).toISOString() } : {}),
    };
    crear.mutate(payload, {
      onSuccess: () => {
        onOpenChange(false);
        setPregunta('');
        setOpciones(['', '']);
        setMultiple(false);
        setCierraEn('');
        toast.success('Encuesta publicada');
      },
      onError: (e) => setError(e.message || 'No se pudo publicar la encuesta'),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-[440px] gap-0 border-outline-variant bg-surface-container-lowest p-0">
        <form onSubmit={handleSubmit} noValidate>
          <DialogHeader className="border-b border-outline-variant/35 px-6 pb-4 pt-5 text-left">
            <DialogTitle className="text-xl font-bold text-on-surface">Nueva encuesta</DialogTitle>
            <DialogDescription className="text-sm text-on-surface-variant">
              Entre 2 y 6 opciones. Los resultados se actualizan en vivo para todos.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60dvh] space-y-4 overflow-y-auto px-6 py-5">
            <div>
              <label htmlFor="encuesta-pregunta" className="text-xs font-semibold text-on-surface">
                Pregunta
              </label>
              <Input
                id="encuesta-pregunta"
                value={pregunta}
                maxLength={300}
                onChange={(event) => setPregunta(event.target.value)}
                placeholder="Ej. ¿Qué día hacemos la reunión?"
                className="mt-1 h-10 rounded-md border-outline-variant text-sm"
                autoFocus
              />
            </div>

            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold text-on-surface">Opciones</legend>
              {opciones.map((opcion, indice) => (
                <div key={indice} className="flex items-center gap-2">
                  <Input
                    value={opcion}
                    maxLength={120}
                    onChange={(event) => cambiarOpcion(indice, event.target.value)}
                    aria-label={`Opción ${indice + 1}`}
                    placeholder={`Opción ${indice + 1}`}
                    className="h-10 flex-1 rounded-md border-outline-variant text-sm"
                  />
                  {opciones.length > ENCUESTA_MIN_OPCIONES && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setOpciones((actuales) => actuales.filter((_, i) => i !== indice))}
                      aria-label={`Quitar opción ${indice + 1}`}
                    >
                      <X className="size-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              ))}
              {opciones.length < ENCUESTA_MAX_OPCIONES && (
                <Button type="button" variant="outline" size="sm" onClick={() => setOpciones((actuales) => [...actuales, ''])} className="gap-1.5 text-xs font-bold">
                  <Plus className="size-3.5" aria-hidden="true" />
                  Agregar opción
                </Button>
              )}
            </fieldset>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-on-surface">
              <Checkbox checked={multiple} onCheckedChange={(valor) => setMultiple(valor === true)} />
              Permitir elegir varias opciones
            </label>

            <div>
              <label htmlFor="encuesta-cierre" className="text-xs font-semibold text-on-surface">
                Cierre automático (opcional)
              </label>
              <input
                id="encuesta-cierre"
                type="datetime-local"
                value={cierraEn}
                min={minimoCierre}
                onChange={(event) => setCierraEn(event.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-2 text-sm text-on-surface"
              />
            </div>

            {error && (
              <p role="alert" className="text-xs text-error">
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 border-t border-outline-variant/35 px-6 py-4 sm:justify-end">
            <Button type="button" variant="outline" disabled={crear.isPending} onClick={() => onOpenChange(false)} className="h-10 rounded-md border-outline-variant text-xs font-bold">
              Cancelar
            </Button>
            <Button type="submit" disabled={crear.isPending} className="h-10 gap-1.5 rounded-md text-xs font-bold">
              {crear.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
              Publicar encuesta
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
