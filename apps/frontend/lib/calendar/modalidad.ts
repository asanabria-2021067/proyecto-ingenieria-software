import { MapPin, Users, Video, type LucideIcon } from 'lucide-react';
import type { ModalidadEvento } from '@/lib/services/events';

export interface ModalidadEstilo {
  label: string;
  icon: LucideIcon;
}

/**
 * HU-184: ícono y nombre de cada modalidad del evento. El color del evento
 * ya no sale de la modalidad sino de su tipo (lib/calendar/paleta.ts); la
 * modalidad se reconoce por su ícono y su etiqueta.
 */
export const MODALIDAD_ESTILO: Record<ModalidadEvento, ModalidadEstilo> = {
  PRESENCIAL: { label: 'Presencial', icon: MapPin },
  VIRTUAL: { label: 'Virtual', icon: Video },
  MIXTA: { label: 'Híbrida', icon: Users },
};

export const MODALIDADES_EN_ORDEN: ModalidadEvento[] = ['PRESENCIAL', 'VIRTUAL', 'MIXTA'];
