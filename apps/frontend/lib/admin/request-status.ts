import type { TagTone } from '@/components/ui/tag';
import type { ClosureRequestSituation } from '@/lib/types/admin-projects';

/**
 * Situaciones de las bandejas de solicitudes del administrador, con su tono
 * de etiqueta y el color del punto de su KPI (`ResumenKpi`). Publicación y
 * cierre se mantienen separadas: comparten nombres pero no semántica.
 * `punto` es una clase literal para que Tailwind la genere.
 */
export interface SituacionSolicitud {
  label: string;
  tone: TagTone;
  punto: string;
}

export type PublicationRequestSituation = 'PENDIENTE_DE_REVISION' | 'REENVIADA_PARA_REVISION' | 'EN_ESPERA_DE_CORRECCIONES';

export const SITUACION_PUBLICACION: Record<PublicationRequestSituation, SituacionSolicitud> = {
  PENDIENTE_DE_REVISION: { label: 'Pendientes de revisión', tone: 'neutral', punto: 'bg-on-tag-neutral' },
  REENVIADA_PARA_REVISION: { label: 'Reenviadas para revisión', tone: 'lime', punto: 'bg-tag-lime' },
  EN_ESPERA_DE_CORRECCIONES: { label: 'En espera de correcciones', tone: 'amber', punto: 'bg-on-tag-amber' },
};

export const SITUACION_CIERRE: Record<Exclude<ClosureRequestSituation, 'SIN_CLASIFICACION'>, SituacionSolicitud> = {
  PENDIENTE_DE_EVALUACION: { label: 'Pendientes de evaluación', tone: 'neutral', punto: 'bg-on-tag-neutral' },
  REENVIADA_PARA_REVISION: { label: 'Reenviadas para revisión', tone: 'lime', punto: 'bg-tag-lime' },
  EN_ESPERA_DE_CORRECCIONES: { label: 'En espera de correcciones', tone: 'amber', punto: 'bg-on-tag-amber' },
  SIN_ENTREGA_FORMAL: { label: 'Sin entrega formal', tone: 'subtle', punto: 'bg-on-tag-subtle' },
};
