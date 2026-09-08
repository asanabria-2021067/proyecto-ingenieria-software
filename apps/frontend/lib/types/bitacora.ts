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

  // ---- Sprint 7 (06 v2 §43): los siete anteriores conservan su literal. ----
  static readonly TIME_RECORD_EDITED = 'TIME_RECORD_EDITED' as const;
  static readonly TIME_RECORD_REVOKED = 'TIME_RECORD_REVOKED' as const;
  static readonly ASSIGNMENT_CLOSED = 'ASSIGNMENT_CLOSED' as const;
  static readonly TASK_HOURS_ADJUSTED = 'TASK_HOURS_ADJUSTED' as const;
  static readonly TASK_HOURS_ADJUSTMENT_REVERTED = 'TASK_HOURS_ADJUSTMENT_REVERTED' as const;
  static readonly SPRINT_FINALIZED = 'SPRINT_FINALIZED' as const;
  static readonly SPRINT_CLOSED = 'SPRINT_CLOSED' as const;
  static readonly SPRINT_HOURS_CONSOLIDATED = 'SPRINT_HOURS_CONSOLIDATED' as const;
  static readonly EXIT_REQUEST_APPROVED = 'EXIT_REQUEST_APPROVED' as const;
  static readonly EXIT_REQUEST_REJECTED = 'EXIT_REQUEST_REJECTED' as const;
  static readonly LEADERSHIP_APPEAL_CREATED = 'LEADERSHIP_APPEAL_CREATED' as const;
  static readonly LEADERSHIP_APPEAL_CANCELLED = 'LEADERSHIP_APPEAL_CANCELLED' as const;
  static readonly LEADERSHIP_APPEAL_ACCEPTED = 'LEADERSHIP_APPEAL_ACCEPTED' as const;
  static readonly LEADERSHIP_APPEAL_DENIED = 'LEADERSHIP_APPEAL_DENIED' as const;
  static readonly LEADERSHIP_CHANGED = 'LEADERSHIP_CHANGED' as const;
  static readonly PROJECT_CLOSE_REQUESTED = 'PROJECT_CLOSE_REQUESTED' as const;
  static readonly POSTULATIONS_AUTO_REJECTED = 'POSTULATIONS_AUTO_REJECTED' as const;
  static readonly CLOSURE_DRAFT_CREATED = 'CLOSURE_DRAFT_CREATED' as const;
  static readonly CLOSURE_AUTOREPORT_GENERATED = 'CLOSURE_AUTOREPORT_GENERATED' as const;
  static readonly CLOSURE_DOCUMENT_ADDED = 'CLOSURE_DOCUMENT_ADDED' as const;
  static readonly CLOSURE_DOCUMENT_REMOVED = 'CLOSURE_DOCUMENT_REMOVED' as const;
  static readonly PROJECT_CLOSE_DOCUMENTS_SUBMITTED = 'PROJECT_CLOSE_DOCUMENTS_SUBMITTED' as const;
  static readonly PROJECT_CLOSE_REVIEW_APPROVED = 'PROJECT_CLOSE_REVIEW_APPROVED' as const;
  static readonly PROJECT_HOURS_CREDITED = 'PROJECT_HOURS_CREDITED' as const;
  static readonly PROJECT_CLOSE_REVIEW_DOC_CORRECTION = 'PROJECT_CLOSE_REVIEW_DOC_CORRECTION' as const;
  static readonly PROJECT_CLOSE_RETURNED_TO_EXECUTION = 'PROJECT_CLOSE_RETURNED_TO_EXECUTION' as const;
  static readonly CLOSURE_STORAGE_SWEPT = 'CLOSURE_STORAGE_SWEPT' as const;
  static readonly LEGACY_HOURS_RECONCILED = 'LEGACY_HOURS_RECONCILED' as const;

  static readonly VALORES = [
    'TASK_CREATED',
    'TASK_UPDATED',
    'TASK_STATUS_CHANGED',
    'TASK_ASSIGNED',
    'TASK_REASSIGNED',
    'TASK_HOURS_LOGGED',
    'SPRINT_STARTED',
    'TIME_RECORD_EDITED',
    'TIME_RECORD_REVOKED',
    'ASSIGNMENT_CLOSED',
    'TASK_HOURS_ADJUSTED',
    'TASK_HOURS_ADJUSTMENT_REVERTED',
    'SPRINT_FINALIZED',
    'SPRINT_CLOSED',
    'SPRINT_HOURS_CONSOLIDATED',
    'EXIT_REQUEST_APPROVED',
    'EXIT_REQUEST_REJECTED',
    'LEADERSHIP_APPEAL_CREATED',
    'LEADERSHIP_APPEAL_CANCELLED',
    'LEADERSHIP_APPEAL_ACCEPTED',
    'LEADERSHIP_APPEAL_DENIED',
    'LEADERSHIP_CHANGED',
    'PROJECT_CLOSE_REQUESTED',
    'POSTULATIONS_AUTO_REJECTED',
    'CLOSURE_DRAFT_CREATED',
    'CLOSURE_AUTOREPORT_GENERATED',
    'CLOSURE_DOCUMENT_ADDED',
    'CLOSURE_DOCUMENT_REMOVED',
    'PROJECT_CLOSE_DOCUMENTS_SUBMITTED',
    'PROJECT_CLOSE_REVIEW_APPROVED',
    'PROJECT_HOURS_CREDITED',
    'PROJECT_CLOSE_REVIEW_DOC_CORRECTION',
    'PROJECT_CLOSE_RETURNED_TO_EXECUTION',
    'CLOSURE_STORAGE_SWEPT',
    'LEGACY_HOURS_RECONCILED',
  ] as const;
}

/** Tipo derivado del catálogo — usar este nombre (no `TipoEventoBitacora`) en anotaciones de tipo. */
export type TipoEventoBitacoraValor = (typeof TipoEventoBitacora.VALORES)[number];

/**
 * Entidad a la que apunta el evento. S7 amplió el catálogo más allá de
 * tarea/Sprint; `string` deja pasar cualquier entidad futura sin mentir sobre
 * lo que el backend puede devolver.
 */
export type TipoEntidadBitacora =
  | 'TAREA'
  | 'SPRINT'
  | 'PROYECTO'
  | 'DOCUMENTO_CIERRE'
  | 'REVISION_CIERRE'
  | 'APELACION_LIDERAZGO'
  | (string & {});

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
