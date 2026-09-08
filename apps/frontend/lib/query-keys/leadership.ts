/**
 * Query keys de liderazgo (Sprint 7). Un read-model = un namespace; todos
 * los ids y filtros dentro de la key; prefijos para invalidación conjunta.
 */
export const leadershipContextQueryKey = (idProyecto: number) => ['leadership-context', idProyecto] as const;

export const leadershipCandidatesQueryKey = (idProyecto: number) =>
  ['leadership-candidates', idProyecto] as const;

export const leadershipHistoryPrefix = (idProyecto: number) => ['leadership-history', idProyecto] as const;

export const leadershipHistoryQueryKey = (idProyecto: number, page: number) =>
  ['leadership-history', idProyecto, page] as const;

export const leadershipAppealsPrefix = (idProyecto: number) => ['leadership-appeals', idProyecto] as const;

/** `filtro` es el `estado` de la apelación o `'TODAS'`. */
export const leadershipAppealsQueryKey = (idProyecto: number, filtro: string, page: number) =>
  ['leadership-appeals', idProyecto, filtro, page] as const;
