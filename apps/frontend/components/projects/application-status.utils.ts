import { CheckCircle, Clock, XCircle } from 'lucide-react';
import type { TagTone } from '@/components/ui/tag';
import type { EstadoPostulacion } from '@/types';

/**
 * Etiqueta de estado de postulación, compartida por Mis Postulaciones, las
 * postulaciones recibidas de un proyecto y el dashboard (antes cada vista
 * repetía el mapa). El icono acompaña siempre al texto: el estado nunca
 * depende solo del color.
 */
export const ESTADO_POSTULACION_STYLE: Record<EstadoPostulacion, { label: string; icon: typeof Clock; tone: TagTone }> = {
  PENDIENTE: { label: 'Pendiente', icon: Clock, tone: 'neutral' },
  ACEPTADA: { label: 'Aceptada', icon: CheckCircle, tone: 'success' },
  RECHAZADA: { label: 'Rechazada', icon: XCircle, tone: 'red' },
};
