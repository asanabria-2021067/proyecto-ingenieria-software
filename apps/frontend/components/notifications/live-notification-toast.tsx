'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { toast } from 'sonner';

/**
 * IESUC-568 (B3, NeuroLab): el aviso en vivo de una notificación (p. ej. una
 * tarea asignada) pasaba desapercibido. Dura al menos 8 s (10 s), se pausa
 * mientras el puntero está encima o el foco está dentro, y usa los tokens de
 * texto y superficie del sistema, que cumplen AA en claro y en oscuro.
 *
 * Sonner pausa con el puntero pero no con el foco del teclado, por eso el
 * temporizador vive aquí y el toast se crea con duración infinita.
 */
export const DURACION_NOTIFICACION_EN_VIVO_MS = 10_000;

interface LiveNotificationToastProps {
  id: string | number;
  titulo: string;
  mensaje?: string | null;
  onVer?: () => void;
  duracionMs?: number;
}

export function LiveNotificationToast({
  id,
  titulo,
  mensaje,
  onVer,
  duracionMs = DURACION_NOTIFICACION_EN_VIVO_MS,
}: LiveNotificationToastProps) {
  const [puntero, setPuntero] = useState(false);
  const [foco, setFoco] = useState(false);
  const pausado = puntero || foco;
  const restante = useRef(duracionMs);
  const cerrar = useCallback(() => toast.dismiss(id), [id]);

  useEffect(() => {
    if (pausado) return;
    const inicio = Date.now();
    const temporizador = setTimeout(cerrar, restante.current);
    return () => {
      clearTimeout(temporizador);
      restante.current = Math.max(0, restante.current - (Date.now() - inicio));
    };
  }, [pausado, cerrar]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-pausado={pausado ? 'true' : undefined}
      onMouseEnter={() => setPuntero(true)}
      onMouseLeave={() => setPuntero(false)}
      onFocus={() => setFoco(true)}
      onBlur={(evento) => {
        if (!evento.currentTarget.contains(evento.relatedTarget as Node | null)) setFoco(false);
      }}
      className="flex w-[356px] max-w-[calc(100vw-2rem)] items-start gap-3 rounded-lg border-2 border-primary bg-card p-4 text-text-primary shadow-xl"
    >
      <BellRing className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold leading-snug">{titulo}</p>
        {mensaje && <p className="mt-1 text-sm leading-snug">{mensaje}</p>}
        {onVer && (
          <button
            type="button"
            onClick={() => {
              onVer();
              cerrar();
            }}
            className="mt-3 inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-bold text-on-primary hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            Ver
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={cerrar}
        aria-label="Cerrar notificación"
        className="-m-1 rounded-md p-1 text-text-primary hover:bg-on-surface/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Muestra el aviso en vivo; el cierre automático lo maneja el propio componente. */
export function mostrarNotificacionEnVivo(datos: { titulo: string; mensaje?: string | null; onVer?: () => void }) {
  return toast.custom((id) => <LiveNotificationToast id={id} {...datos} />, { duration: Infinity });
}
