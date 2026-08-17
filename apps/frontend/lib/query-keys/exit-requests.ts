/**
 * Query keys canónicas del dominio `exit-requests`. Única fuente de verdad
 * de su forma exacta — nunca se repite el array manualmente en mutations ni
 * en otros hooks. Misma filosofía que `projectSprintsQueryKey`
 * (apps/frontend/lib/query-keys/sprints.ts).
 */

/** B6 — `GET /proyectos/:id/salida/preparacion` (ExitPreparationSummary, acoplado a PREPARACION). */
export const exitPreparationSummaryQueryKey = (idProyecto: number) =>
  ['exit-preparation-summary', idProyecto] as const;

/**
 * F11.1 — `GET /proyectos/:id/salida/estado` (CurrentExitRequest: la
 * solicitud abierta del actor, PREPARACION o PENDIENTE_LIDER, o null).
 * Read-model DISTINTO de `exitPreparationSummaryQueryKey` — nunca comparte
 * su namespace: uno es "¿cuál es el estado actual de mi solicitud?", el
 * otro es "¿qué me bloquea para continuar mi PREPARACION?". Confundirlos
 * invalidaría el caché equivocado.
 */
export const currentExitRequestQueryKey = (idProyecto: number) =>
  ['exit-request-current', idProyecto] as const;

/**
 * F14.1 — `GET /proyectos/:id/miembros/solicitudes-salida-pendientes`
 * (PendingLeaderReview: TODAS las solicitudes `PENDIENTE_LIDER` del
 * proyecto, leader-facing). Distinta de `currentExitRequestQueryKey`: esa
 * es "¿cuál es MI propia solicitud abierta?" (scoped al actor); esta es
 * "¿qué solicitudes de OTROS espera resolver el líder?" — namespaces
 * separados a propósito, igual que B13 mantiene
 * `projectPendingPostulationsQueryKey` aparte de `projectTeamSummaryQueryKey`.
 */
export const projectPendingExitRequestsQueryKey = (idProyecto: number) =>
  ['proyecto-solicitudes-salida-pendientes', idProyecto] as const;
