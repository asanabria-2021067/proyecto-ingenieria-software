/**
 * Contrato canónico de la bitácora semántica de Sprint (HU-140) — refleja
 * exactamente `EventoBitacoraDto`/`BitacoraPaginadaDto`
 * (apps/backend/src/bitacora/dto/bitacora-evento.dto.ts) y el catálogo
 * `TipoEventoBitacora` (apps/backend/src/bitacora/tipos-evento-bitacora.ts).
 * Fechas como `string`: JSON serializado por `apiFetch`, nunca instancias
 * de `Date` — mismo criterio que `SprintDto`/`TareaPublicaDTO`.
 */

/**
 * Clase con constantes `static readonly` (no un `type` de union de
 * strings), reflejando la misma decisión tomada en el backend — agregar un
 * evento nuevo (p. ej. los de cambio de atributos de tarea de HU-141) es
 * agregar una línea aquí y en `VALORES`.
 */
export class TipoEventoBitacora {
  static readonly TASK_CREATED = 'TASK_CREATED' as const;
  static readonly TASK_UPDATED = 'TASK_UPDATED' as const;
  static readonly TASK_STATUS_CHANGED = 'TASK_STATUS_CHANGED' as const;
  static readonly TASK_ASSIGNED = 'TASK_ASSIGNED' as const;
  static readonly TASK_REASSIGNED = 'TASK_REASSIGNED' as const;
  static readonly TASK_HOURS_LOGGED = 'TASK_HOURS_LOGGED' as const;
  static readonly SPRINT_STARTED = 'SPRINT_STARTED' as const;

  static readonly VALORES = [
    'TASK_CREATED',
    'TASK_UPDATED',
    'TASK_STATUS_CHANGED',
    'TASK_ASSIGNED',
    'TASK_REASSIGNED',
    'TASK_HOURS_LOGGED',
    'SPRINT_STARTED',
  ] as const;
}

/** Tipo derivado del catálogo — usar este nombre (no `TipoEventoBitacora`) en anotaciones de tipo. */
export type TipoEventoBitacoraValor = (typeof TipoEventoBitacora.VALORES)[number];

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
  tipoEvento: TipoEventoBitacoraValor;
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
  tipoEvento?: TipoEventoBitacoraValor;
  page?: number;
  limit?: number;
}
