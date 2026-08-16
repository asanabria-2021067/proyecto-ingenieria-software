/**
 * Query key canónica del módulo de Sprints. Única fuente de verdad de su
 * forma exacta — nunca se repite el array manualmente en mutations ni en
 * otros hooks. Misma filosofía que `projectTasksQueryKey`
 * (apps/frontend/lib/query-keys/tasks.ts).
 */

export const projectSprintsQueryKey = (idProyecto: number) => ['project-sprints', idProyecto] as const;

/**
 * Detalle histórico de un único Sprint (F4) — distinta de la lista
 * (`project-sprints`) porque representa un read-model diferente
 * (`GET /proyectos/:id/sprints/:sprintId`, no `GET /proyectos/:id/sprints`).
 * Incluye ambos ids para que Sprints de dos proyectos nunca colisionen en
 * caché, mismo criterio que `projectMemberDetailQueryKey`
 * (apps/frontend/lib/query-keys/members.ts).
 */
export const sprintDetailQueryKey = (idProyecto: number, idSprint: number) =>
  ['sprint-detail', idProyecto, idSprint] as const;
