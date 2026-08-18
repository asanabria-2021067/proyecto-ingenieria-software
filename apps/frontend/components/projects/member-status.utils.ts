export type EstadoParticipacion = 'ACTIVO' | 'RETIRADO' | 'COMPLETADO';

export interface EstadoParticipacionStyle {
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
  ACTIVO: { className: 'bg-primary-container text-on-primary-container', label: 'Activo' },
  RETIRADO: { className: 'bg-surface-container-high text-tertiary', label: 'Retirado' },
  COMPLETADO: { className: 'bg-secondary-container/30 text-secondary', label: 'Completado' },
};
