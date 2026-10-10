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
  /** Anillo alrededor del avatar de un calendario compartido. */
  anillo: string;
}

/**
 * Clases literales por tono: Tailwind solo genera utilidades que aparecen
 * escritas completas en el código, así que no se arman con plantillas.
 */
export const TONO_CLASES: Record<TonoCalendario, ClasesTono> = {
  1: { bloque: 'bg-cal-1 text-on-cal-1', borde: 'border-l-cal-1-strong', punto: 'bg-cal-1-strong', anillo: 'ring-cal-1-strong' },
  2: { bloque: 'bg-cal-2 text-on-cal-2', borde: 'border-l-cal-2-strong', punto: 'bg-cal-2-strong', anillo: 'ring-cal-2-strong' },
  3: { bloque: 'bg-cal-3 text-on-cal-3', borde: 'border-l-cal-3-strong', punto: 'bg-cal-3-strong', anillo: 'ring-cal-3-strong' },
  4: { bloque: 'bg-cal-4 text-on-cal-4', borde: 'border-l-cal-4-strong', punto: 'bg-cal-4-strong', anillo: 'ring-cal-4-strong' },
  5: { bloque: 'bg-cal-5 text-on-cal-5', borde: 'border-l-cal-5-strong', punto: 'bg-cal-5-strong', anillo: 'ring-cal-5-strong' },
  6: { bloque: 'bg-cal-6 text-on-cal-6', borde: 'border-l-cal-6-strong', punto: 'bg-cal-6-strong', anillo: 'ring-cal-6-strong' },
};

/** Proyectos y calendarios compartidos reciben tono por orden de aparición, en ciclo. */
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
