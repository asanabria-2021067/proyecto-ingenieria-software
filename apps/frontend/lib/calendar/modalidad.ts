import { MapPin, Users, Video, type LucideIcon } from 'lucide-react';
import type { ModalidadEvento } from '@/lib/services/events';

export interface ModalidadEstilo {
  label: string;
  icon: LucideIcon;
  /** Relleno + texto del ícono/pastilla (siempre el par token / on-token). */
  relleno: string;
  /** Punto de color para la vista mensual compacta (móvil). */
  punto: string;
}

/**
 * HU-184 (T-324): color e ícono por modalidad del evento. Solo tokens del
 * sistema de diseño (docs/design-system.md), cada uno con su `on-*`; el
 * ícono y la etiqueta acompañan siempre al color para no depender solo de
 * él. `status-warning` no se usa porque resuelve al mismo color que `accent`.
 */
export const MODALIDAD_ESTILO: Record<ModalidadEvento, ModalidadEstilo> = {
  PRESENCIAL: {
    label: 'Presencial',
    icon: MapPin,
    relleno: 'bg-status-success text-on-status-success',
    punto: 'bg-status-success',
  },
  VIRTUAL: {
    label: 'Virtual',
    icon: Video,
    relleno: 'bg-accent text-on-accent',
    punto: 'bg-accent',
  },
  MIXTA: {
    label: 'Mixta',
    icon: Users,
    relleno: 'bg-action text-on-action',
    punto: 'bg-action',
  },
};

export const MODALIDADES_EN_ORDEN: ModalidadEvento[] = ['PRESENCIAL', 'VIRTUAL', 'MIXTA'];
