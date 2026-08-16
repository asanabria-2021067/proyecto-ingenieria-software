/**
 * Contrato canónico del recurso de Sprint. Refleja exactamente
 * `SprintListItemDto` (apps/backend/src/sprints/dto/sprint-history.dto.ts) —
 * `GET /proyectos/:projectId/sprints` — y la fila `Sprint` que devuelven
 * `startSprint`/`finalizeSprint`/`closeSprint` en
 * apps/backend/src/sprints/sprints.service.ts, un superconjunto compatible
 * de los mismos campos base (más `cerradoPor`, opcional aquí porque
 * `listSprints` no lo selecciona).
 *
 * Fechas como `string`: igual que `TareaPublicaDTO` en `@/lib/types/tasks`,
 * son JSON serializado por `apiFetch`, nunca instancias de `Date`.
 */

export type EstadoSprint = 'ACTIVO' | 'EN_FINALIZACION' | 'CERRADO';

export interface SprintDto {
  idSprint: number;
  idProyecto: number;
  numero: number;
  estado: EstadoSprint;
  fechaInicio: string;
  fechaFinalizacionIniciada: string | null;
  fechaCierre: string | null;
  cerradoPor?: number | null;
}
