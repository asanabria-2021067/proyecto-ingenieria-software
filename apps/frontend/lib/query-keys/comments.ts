/**
 * HU-200 — query keys de los hilos de comentarios de proyecto e hito y de las
 * menciones. Los comentarios de tarea conservan `taskCommentsQueryKey`
 * (lib/query-keys/tasks.ts).
 */

export const projectCommentsQueryKey = (idProyecto: number) => ['project-comments', idProyecto] as const;

export const milestoneCommentsQueryKey = (idProyecto: number, idHito: number) =>
  ['milestone-comments', idProyecto, idHito] as const;

export const milestoneCommentCountsQueryKey = (idProyecto: number) =>
  ['milestone-comment-counts', idProyecto] as const;

export const projectMentionablesQueryKey = (idProyecto: number) => ['project-mentionables', idProyecto] as const;
