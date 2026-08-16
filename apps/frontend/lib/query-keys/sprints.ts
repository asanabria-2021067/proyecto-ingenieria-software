/**
 * Query key canónica del módulo de Sprints. Única fuente de verdad de su
 * forma exacta — nunca se repite el array manualmente en mutations ni en
 * otros hooks. Misma filosofía que `projectTasksQueryKey`
 * (apps/frontend/lib/query-keys/tasks.ts).
 */

export const projectSprintsQueryKey = (idProyecto: number) => ['project-sprints', idProyecto] as const;
