import type { EstadoRevisionCierre } from '@/lib/types/closure';

/**
 * Etiqueta de cada revisión de cierre (historial del detalle de proyecto).
 * `className` es un tono `pill-*` de app/global.css; la forma la pone `.pill`.
 */
export const ESTADO_REVISION_LABEL: Record<EstadoRevisionCierre, { label: string; className: string }> = {
  BORRADOR: { label: 'Borrador', className: 'pill-neutral' },
  ENVIADA: { label: 'Enviada', className: 'pill-neutral' },
  CORRECCION_DOCUMENTAL: { label: 'Corrección documental', className: 'pill-amber' },
  DEVUELTA_A_EJECUCION: { label: 'Devuelta a ejecución', className: 'pill-red' },
  APROBADA: { label: 'Aprobado', className: 'pill-success' },
};
