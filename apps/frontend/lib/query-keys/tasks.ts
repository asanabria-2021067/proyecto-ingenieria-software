/**
 * Query keys canónicas del módulo de gestión de tareas. Única fuente de
 * verdad de su forma exacta — nunca se repite el array manualmente en
 * mutations ni en otros hooks.
 */

export const projectTasksQueryKey = (idProyecto: number) => ['project-tasks', idProyecto] as const;

/**
 * Misma forma que la clave ya usada por `useProjectAvance`
 * (apps/frontend/hooks/use-project-avance.ts): `['project-avance', id]`.
 * No existía una factoría exportada allí; esta reutiliza exactamente esa
 * forma para que las invalidaciones de este módulo compartan caché con ese
 * hook sin introducir una clave equivalente distinta.
 */
export const projectAvanceQueryKey = (idProyecto: number) => ['project-avance', idProyecto] as const;

export const taskCommentsQueryKey = (idProyecto: number, idTarea: number) =>
  ['task-comments', idProyecto, idTarea] as const;
