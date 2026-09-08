/**
 * Query keys del histórico de proyecto (Sprint 7, VIEW-02). Otro read-model
 * que `['proyecto', id]` (GET público) y que `['project', id]` (workspace):
 * no se reutilizan, mismo criterio que `lib/query-keys/members.ts`.
 */
export const historicalProjectQueryKey = (idProyecto: number) => ['historical-project', idProyecto] as const;

export const deletedContributionsQueryKey = (idProyecto: number, idSprint: number) =>
  ['deleted-contributions', idProyecto, idSprint] as const;
