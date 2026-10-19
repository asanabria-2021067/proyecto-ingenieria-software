import { X } from 'lucide-react';
import type { ChatCita } from '@/lib/types/chat';

const EXTRACTO_MAX = 120;

/** Mismo recorte que aplica el backend al resumen del citado. */
export function extractoDe(contenido: string): string {
  const texto = contenido.replace(/\s+/g, ' ').trim();
  return texto.length > EXTRACTO_MAX ? `${texto.slice(0, EXTRACTO_MAX)}…` : texto;
}

interface ChatCitaBloqueProps {
  cita: ChatCita;
  propio: boolean;
  onIrAlOriginal: (idMensaje: number) => void;
}

/** Cita dentro de la burbuja: botón nativo, así Enter y clic saltan al original. */
export function ChatCitaBloque({ cita, propio, onIrAlOriginal }: ChatCitaBloqueProps) {
  const nombre = `${cita.remitente.nombre} ${cita.remitente.apellido}`.trim();
  return (
    <button
      type="button"
      onClick={() => onIrAlOriginal(cita.idMensaje)}
      aria-label={`Ir al mensaje original de ${nombre}: ${cita.eliminado ? 'Mensaje eliminado' : cita.extracto}`}
      className={`mb-1 block w-full rounded-md border-l-4 px-2 py-1 text-left text-xs ${
        propio
          ? 'border-primary-foreground/60 bg-primary-foreground/15 text-primary-foreground'
          : 'border-primary bg-on-surface/5 text-on-surface'
      }`}
    >
      <span className="block font-semibold">{nombre}</span>
      <span className={`line-clamp-2 break-words opacity-90 ${cita.eliminado ? 'italic' : ''}`}>
        {cita.eliminado ? 'Mensaje eliminado' : cita.extracto}
      </span>
    </button>
  );
}

interface ChatCitaVistaPreviaProps {
  nombre: string;
  extracto: string;
  onCancelar: () => void;
}

/** Barra sobre el input con la respuesta en curso; se cancela con el botón o con Esc. */
export function ChatCitaVistaPrevia({ nombre, extracto, onCancelar }: ChatCitaVistaPreviaProps) {
  return (
    <div className="flex items-start gap-2 border-t border-outline-variant bg-surface-container px-3 py-2 text-xs">
      <div className="min-w-0 flex-1 border-l-4 border-primary pl-2">
        <p className="font-semibold text-on-surface">Respondiendo a {nombre}</p>
        <p className="line-clamp-2 break-words text-text-secondary">{extracto}</p>
      </div>
      <button
        type="button"
        onClick={onCancelar}
        aria-label="Cancelar respuesta"
        className="rounded-control p-1 text-text-secondary hover:bg-on-surface/10 hover:text-text-primary"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
