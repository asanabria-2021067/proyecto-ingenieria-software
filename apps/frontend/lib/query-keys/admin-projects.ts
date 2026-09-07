/**
 * Query keys administrativas (Sprint 7). El prefijo `['admin','proyectos']`
 * permite invalidar los cuatro grupos a la vez (veredictos de cierre,
 * `PROJECT_STATE_CHANGED`, `CLOSURE_REVIEW_UPDATED`).
 */
export const adminProjectsPrefix = ['admin', 'proyectos'] as const;

export const adminProjectsQueryKey = (grupo: string, page: number, limit: number) =>
  ['admin', 'proyectos', grupo, page, limit] as const;

export const adminProjectDetailQueryKey = (idProyecto: number) => ['admin', 'proyecto', idProyecto] as const;

export const adminAppealsPrefix = ['admin', 'apelaciones'] as const;

/** `estado` es el filtro de la apelación o `'TODAS'`. */
export const adminAppealsQueryKey = (estado: string, page: number) =>
  ['admin', 'apelaciones', estado, page] as const;
