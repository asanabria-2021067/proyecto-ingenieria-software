import { createElement } from 'react';
import {
  CalendarDays,
  ClipboardCheck,
  FileCheck2,
  GraduationCap,
  Hammer,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { TipoEvento } from '@/lib/services/events';

/** HU-184: uno de los 6 tonos de la paleta del calendario (`--color-cal-N` en global.css). */
export type TonoCalendario = 1 | 2 | 3 | 4 | 5 | 6;

export interface ClasesTono {
  /** Fondo suave + texto legible encima (bloques de evento, pastillas). */
  bloque: string;
  /** Borde izquierdo fuerte del bloque. */
  borde: string;
  /** Punto o marca sólida (leyendas, vista compacta). */
  punto: string;
  /**
   * Contorno del avatar de un calendario compartido. G04 (UI-34): se pinta
   * discontinuo (`border-dashed`), igual que los bloques de esa persona, para
   * que su identidad no dependa solo del color (los tonos son los mismos seis
   * de los tipos de evento).
   */
  contorno: string;
}

/**
 * Clases literales por tono: Tailwind solo genera utilidades que aparecen
 * escritas completas en el código, así que no se arman con plantillas.
 */
export const TONO_CLASES: Record<TonoCalendario, ClasesTono> = {
  1: { bloque: 'bg-cal-1 text-on-cal-1', borde: 'border-l-cal-1-strong', punto: 'bg-cal-1-strong', contorno: 'border-cal-1-strong' },
  2: { bloque: 'bg-cal-2 text-on-cal-2', borde: 'border-l-cal-2-strong', punto: 'bg-cal-2-strong', contorno: 'border-cal-2-strong' },
  3: { bloque: 'bg-cal-3 text-on-cal-3', borde: 'border-l-cal-3-strong', punto: 'bg-cal-3-strong', contorno: 'border-cal-3-strong' },
  4: { bloque: 'bg-cal-4 text-on-cal-4', borde: 'border-l-cal-4-strong', punto: 'bg-cal-4-strong', contorno: 'border-cal-4-strong' },
  5: { bloque: 'bg-cal-5 text-on-cal-5', borde: 'border-l-cal-5-strong', punto: 'bg-cal-5-strong', contorno: 'border-cal-5-strong' },
  6: { bloque: 'bg-cal-6 text-on-cal-6', borde: 'border-l-cal-6-strong', punto: 'bg-cal-6-strong', contorno: 'border-cal-6-strong' },
};

/**
 * Los calendarios compartidos reciben tono por orden de aparición, en ciclo.
 * G04 (UI-34): son los mismos seis tonos de los tipos de evento y, con siete
 * o más personas, se repiten. Por eso el tono nunca es la única pista de quién
 * es una actividad: lo compartido lleva además borde discontinuo y el nombre
 * de la persona (visible y en la etiqueta accesible). Los proyectos ya no
 * reciben tono: en las vistas el color es del tipo de evento, no del proyecto.
 */
export function tonoPorIndice(indice: number): TonoCalendario {
  return ((((indice % 6) + 6) % 6) + 1) as TonoCalendario;
}

export interface TipoEventoEstilo {
  label: string;
  icon: LucideIcon;
  tono: TonoCalendario;
}

/** HU-184: color, ícono y nombre de cada tipo de evento (mismo enum que el backend). */
export const TIPO_EVENTO_ESTILO: Record<TipoEvento, TipoEventoEstilo> = {
  TUTORIA: { label: 'Tutoría', icon: GraduationCap, tono: 1 },
  REUNION: { label: 'Reunión', icon: Users, tono: 3 },
  ENTREGA: { label: 'Entrega', icon: FileCheck2, tono: 4 },
  REVISION: { label: 'Revisión', icon: ClipboardCheck, tono: 5 },
  TALLER: { label: 'Taller', icon: Hammer, tono: 6 },
  OTRO: { label: 'Otro', icon: CalendarDays, tono: 2 },
};

export const TIPOS_EVENTO_EN_ORDEN: TipoEvento[] = ['TUTORIA', 'REUNION', 'ENTREGA', 'REVISION', 'TALLER', 'OTRO'];

/**
 * G04 (UI-37): color por prioridad real de una tarea (dato del backend, no
 * decorativo). Antes cada vista repetía su propio mapa; cambiar un color
 * exigía tocar tres archivos. Clases literales, como todo en este módulo.
 */
export const PRIORIDAD_DOT: Record<string, string> = {
  ALTA: 'bg-status-error',
  MEDIA: 'bg-status-warning',
  BAJA: 'bg-outline-variant',
};

/** Borde izquierdo de la fila de una tarea, con la misma escala que `PRIORIDAD_DOT`. */
export const PRIORIDAD_BORDE: Record<string, string> = {
  ALTA: 'border-l-status-error',
  MEDIA: 'border-l-status-warning',
  BAJA: 'border-l-outline-variant',
};

/**
 * G04 (UI-37): cuadro del color del evento con el ícono de su tipo y su nombre
 * para lectores de pantalla (nunca solo color). Recibe el tono ya resuelto
 * (`tonoDeEvento`, que vive en `time-grid.ts`) para que este módulo no importe
 * a quien lo importa. Sin JSX porque el archivo es `.ts`.
 */
export function IconoTipoEvento({ tipo, tono, className = '' }: { tipo: TipoEvento; tono: TonoCalendario; className?: string }) {
  const estilo = TIPO_EVENTO_ESTILO[tipo];
  return createElement(
    'span',
    {
      className: `flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-control ${TONO_CLASES[tono].bloque} ${className}`.trim(),
      title: estilo.label,
    },
    createElement(estilo.icon, { className: 'h-2.5 w-2.5', 'aria-hidden': true }),
    createElement('span', { className: 'sr-only' }, estilo.label),
  );
}
