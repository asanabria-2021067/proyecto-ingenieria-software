/**
 * Query key canónica del dominio `exit-requests` (B5-B9). Única fuente de
 * verdad de su forma exacta — nunca se repite el array manualmente en
 * mutations ni en otros hooks. Misma filosofía que `projectSprintsQueryKey`
 * (apps/frontend/lib/query-keys/sprints.ts).
 *
 * El controller actual (exit-requests.controller.ts) solo expone un
 * read-model propio del dominio: `GET /proyectos/:id/salida/preparacion`
 * (B6, ExitPreparationSummary). No existe un endpoint de lista/detalle para
 * `SolicitudSalidaProyecto` en general, así que no se crea una factory para
 * eso — evita una key sin consumidor real (ver Tarea 24 del prompt de F7).
 */

export const exitPreparationSummaryQueryKey = (idProyecto: number) =>
  ['exit-preparation-summary', idProyecto] as const;
