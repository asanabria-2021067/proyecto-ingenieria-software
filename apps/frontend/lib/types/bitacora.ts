/**
 * Contrato canónico de la bitácora semántica de Sprint (HU-140) — refleja
 * exactamente `EventoBitacoraDto`/`BitacoraPaginadaDto`
 * (apps/backend/src/bitacora/dto/bitacora-evento.dto.ts) y el catálogo
 * `TipoEventoBitacora` (apps/backend/src/bitacora/tipos-evento-bitacora.ts).
 * Fechas como `string`: JSON serializado por `apiFetch`, nunca instancias
 * de `Date` — mismo criterio que `SprintDto`/`TareaPublicaDTO`.
 */

export type TipoEventoBitacora =
  | 'TASK_CREATED'
  | 'TASK_UPDATED'
  | 'TASK_STATUS_CHANGED'
  | 'TASK_ASSIGNED'
  | 'TASK_REASSIGNED'
  | 'TASK_HOURS_LOGGED'
  | 'SPRINT_STARTED';

export type TipoEntidadBitacora = 'TAREA' | 'SPRINT';

/** Mismo subconjunto público de Usuario que `SprintHistoryUsuarioDto` — nunca el objeto completo. */
export interface BitacoraActorDto {
  idUsuario: number;
  nombre: string;
  apellido: string;
  fotoUrl: string | null;
}

export interface EventoBitacoraDto {
  idAuditoria: number;
  tipoEvento: TipoEventoBitacora;
  tipoEntidad: TipoEntidadBitacora;
  idEntidad: number;
  idProyecto: number;
  idSprint: number | null;
  valorAnterior: unknown;
  valorNuevo: unknown;
  fechaEvento: string;
  actor: BitacoraActorDto | null;
}

/** Mismo shape de paginación que `findAllPaginated` de ProjectsService (`data`/`total`/`page`/`totalPages`). */
export interface BitacoraPaginadaDto {
  data: EventoBitacoraDto[];
  total: number;
  page: number;
  totalPages: number;
}

/** Filtros de `GET /proyectos/:id/bitacora` — todos opcionales. */
export interface FiltrosBitacora {
  idSprint?: number;
  idActor?: number;
  tipoEvento?: TipoEventoBitacora;
  page?: number;
  limit?: number;
}
