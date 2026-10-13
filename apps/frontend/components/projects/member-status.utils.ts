export type EstadoParticipacion = 'ACTIVO' | 'RETIRADO' | 'COMPLETADO';

export interface EstadoParticipacionStyle {
  /** Tono `pill-*` de app/global.css; la forma la pone `.pill`. */
  className: string;
  label: string;
}

/**
 * Estilos de estado de participación centralizados (mismo criterio que
 * ESTADO_COLUMNA_STYLE en task-board.utils.ts): un solo lugar para no
 * repetir estos valores en cada vista que muestre integrantes de un
 * proyecto (detalle de integrante, tabla de miembros).
 */
export const ESTADO_PARTICIPACION_STYLE: Record<EstadoParticipacion, EstadoParticipacionStyle> = {
  ACTIVO: { className: 'pill-success', label: 'Activo' },
  RETIRADO: { className: 'pill-neutral', label: 'Retirado' },
  COMPLETADO: { className: 'pill-sage', label: 'Completado' },
};
