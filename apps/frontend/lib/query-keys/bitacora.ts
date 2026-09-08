import type { FiltrosBitacora } from '@/lib/types/bitacora';

/**
 * Query key canónica de la bitácora (F-bitácora) — incluye los filtros
 * activos en la key para que cada combinación de filtro/página tenga su
 * propia entrada de caché, mismo criterio que otras queries filtradas de
 * este proyecto (p. ej. projectMemberDetailQueryKey incluye ambos ids).
 */
export const projectBitacoraQueryKey = (idProyecto: number, filtros: FiltrosBitacora) =>
  ['project-bitacora', idProyecto, filtros] as const;
