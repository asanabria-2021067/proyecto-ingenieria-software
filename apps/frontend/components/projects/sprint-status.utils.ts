import type { EstadoHito, EstadoSprint } from '@/lib/types/sprints';

/**
 * Etiquetas de estado de Sprint e hito, compartidas por la lista, el detalle,
 * la finalización y las analíticas de Sprints y por la ficha de integrante
 * (antes cada página repetía el mapa). `className` es un tono `pill-*` de
 * app/global.css; la forma la pone `.pill`. Exhaustivo por diseño: un estado
 * nuevo rompe la compilación en vez de caer en un color incorrecto.
 */
export const ESTADO_SPRINT_STYLE: Record<EstadoSprint, { label: string; className: string }> = {
  ACTIVO: { label: 'Activo', className: 'pill-success' },
  // Ámbar de atención (cierre en curso, pide una acción): el lima resultaba fluorescente.
  EN_FINALIZACION: { label: 'En finalización', className: 'pill-amber' },
  CERRADO: { label: 'Cerrado', className: 'pill-neutral' },
};

/** `bar` es el relleno de la barra de avance del hito, del mismo tono que su etiqueta. */
export const ESTADO_HITO_STYLE: Record<EstadoHito, { label: string; className: string; bar: string }> = {
  PENDIENTE: { label: 'Pendiente', className: 'pill-neutral', bar: 'bg-outline' },
  EN_PROGRESO: { label: 'En progreso', className: 'pill-lime', bar: 'bg-accent' },
  COMPLETADO: { label: 'Completado', className: 'pill-success', bar: 'bg-primary' },
};
