/**
 * Clave del detalle del proyecto — EXACTAMENTE la misma forma que ya usa
 * `useProjectDetail` (`['project', id]`), extraída aquí como factoría para que
 * las invalidaciones S7 (realtime, cierre, liderazgo) no repitan el literal.
 * La sidebar deriva `isLeader` de esta query (`useIsProjectLeader`): por eso
 * `LEADERSHIP_CHANGED` y `PROJECT_STATE_CHANGED` deben invalidarla.
 */
export const projectDetailQueryKey = (idProyecto: number) => ['project', idProyecto] as const;
