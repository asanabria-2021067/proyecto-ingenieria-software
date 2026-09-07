/**
 * Contratos del cierre documental de proyecto (Sprint 7, 06 v2 §25-§27).
 * Reflejan `apps/backend/src/project-closure/**`. Las fechas viajan como
 * string ISO (JSON serializado por `apiFetch`).
 */

export type TipoDocumentoCierre = 'INFORME_AUTOMATICO' | 'EVIDENCIA_LIDER' | 'INFORME_OFICIAL_FINAL';

export type EstadoDocumentoCierre = 'RESERVADO' | 'EN_CARGA' | 'DISPONIBLE' | 'PURGA_PENDIENTE' | 'PURGADO';

/** `ClosureDocumentPublic` — nunca expone el `publicId`/URL del proveedor. */
export interface ClosureDocumentPublic {
  idDocumentoCierre: number;
  idProyecto: number;
  idRevisionOrigen: number;
  tipoDocumento: TipoDocumentoCierre;
  estadoDocumento: EstadoDocumentoCierre;
  nombreArchivo: string;
  tamanoBytes: number | null;
  checksumSha256: string | null;
  externalId: string;
  deliveryType: string;
  assetId: string | null;
  versionRemota: string | null;
  disponibleEn: string | null;
}

/**
 * Permiso de LECTURA (`GET …/cierre/documentos/:did/url`). `url` es una ruta
 * del BACKEND (`…/contenido?ticket=`), nunca del proveedor. TTL 300 s. El
 * ticket por sí solo no autoriza: el backend revalida sesión y permisos
 * actuales en cada lectura. Nunca se cachea.
 */
export interface ReadGrant {
  documentId: number;
  url: string;
  expiraEn: string;
}

// ─── Fases, borrador, readiness ──────────────────────────────────────────────

export type ClosurePhase = 'REQUEST' | 'RESUBMIT' | 'APPROVE';

export type EstadoRevisionCierre =
  | 'BORRADOR'
  | 'ENVIADA'
  | 'APROBADA'
  | 'CORRECCION_DOCUMENTAL'
  | 'DEVUELTA_A_EJECUCION';

/** `POST …/cierre/preparacion` — crea o recupera el borrador (idempotente). */
export interface ClosureDraft {
  idRevisionCierre: number;
  numeroRevision: number;
  estadoRevision: EstadoRevisionCierre | string;
}

/** Catálogo cerrado de 16 blockers (`CLOSURE_BLOCKER_CODES`). */
export const CLOSURE_BLOCKER_CODES = [
  'PROYECTO_ESTADO_INVALIDO',
  'SIN_SPRINTS',
  'SPRINTS_NO_CERRADOS',
  'TRAMOS_ABIERTOS',
  'TRAMOS_SIN_PARTICIPACION',
  'LEGACY_SIN_CONCILIAR',
  'HORAS_SIN_CONSOLIDAR',
  'HORAS_INCONSISTENTES',
  'TAREAS_SIN_TERMINAR',
  'TAREAS_SIN_TRAZABILIDAD',
  'SALIDAS_ABIERTAS',
  'APELACION_PENDIENTE',
  'REVISION_INVALIDA',
  'INFORME_INVALIDO',
  'EVIDENCIAS_INVALIDAS',
  'INFORME_DESACTUALIZADO',
] as const;
export type ClosureBlockerCode = (typeof CLOSURE_BLOCKER_CODES)[number];

export const CLOSURE_WARNING_PENDING_APPLICATIONS = 'POSTULACIONES_PENDIENTES';

export interface ClosureBlocker {
  code: ClosureBlockerCode | string;
  /** Copy del backend: se renderiza tal cual, nunca se inventa. */
  message: string;
  ids: number[];
  cantidad: number;
}

export interface ClosureWarning {
  code: typeof CLOSURE_WARNING_PENDING_APPLICATIONS | string;
  message: string;
  ids: number[];
  cantidad: number;
}

/** `GET …/cierre/readiness?phase=` — evaluación COMPLETA; nunca solo el primer bloqueo. */
export interface CloseReadinessSummary {
  projectId: number;
  revisionId: number | null;
  phase: ClosurePhase;
  canSubmit: boolean;
  blockers: ClosureBlocker[];
  warnings: ClosureWarning[];
  /** Huella del informe automático vinculado; es el `expectedFingerprint` del envío. */
  executionFingerprint: string | null;
}

// ─── Documentos y carga ──────────────────────────────────────────────────────

/** Permiso de CARGA (`POST …/cierre/documentos/firma`). `uploadUrl` es una ruta del backend. TTL 600 s. */
export interface UploadGrant {
  documentId: number;
  uploadUrl: string;
  ticket: string;
  expiraEn: string;
  maxBytes: number;
}

export interface GenerateReportInput {
  revisionId: number;
}

/** `POST …/cierre/informe-automatico` */
export interface GeneratedReport {
  documentId: number;
  revisionId: number;
  fingerprintEjecucion: string;
  fingerprintModelo: string;
  documentoSustituido: number | null;
}

export interface ReserveDocumentInput {
  revisionId: number;
  /** Se sanea en el servidor (≤255, sin separadores). */
  nombreArchivo: string;
}

// ─── Envío ───────────────────────────────────────────────────────────────────

/**
 * `RequestCloseDto` y `ResubmitClosureDto` comparten forma
 * (`ClosureDeliveryDto`). `confirmado` es el literal `true`; un valor
 * «truthy» no es confirmación. `expectedFingerprint` es la huella vista en
 * el readiness: si el servidor recalcula otra, responde 409.
 */
export interface ClosureDeliveryInput {
  revisionId: number;
  confirmado: true;
  expectedFingerprint: string;
}

export interface ClosureResult {
  projectId: number;
  estadoProyecto: string;
  revisionId: number | null;
  numeroRevision: number;
  fingerprintEntrega: string | null;
  informeOficialId: number | null;
  cantidades: Record<string, number>;
}

// ─── Revisiones ──────────────────────────────────────────────────────────────

export interface ClosureRevisionDocument {
  idDocumentoCierre: number;
  tipoDocumento: TipoDocumentoCierre;
  nombreArchivo: string;
  tamanoBytes: number | null;
  checksumSha256: string | null;
  orden: number;
}

/** Una entrega de cierre (`GET …/cierre/revisiones[/:numero]`). */
export interface ClosureRevision {
  idRevisionCierre: number;
  idProyecto: number;
  numeroRevision: number;
  estadoRevision: EstadoRevisionCierre | string;
  idSolicitante: number | null;
  enviadaEn: string | null;
  fingerprintEntrega: string | null;
  idRevisor: number | null;
  comentarioRevisor: string | null;
  resueltaEn: string | null;
  idDocumentoOficial: number | null;
  creadaEn: string;
  documentosEnviados: ClosureRevisionDocument[];
  informeOficial: Omit<ClosureRevisionDocument, 'orden'> | null;
  puedeEditar: boolean;
  puedeEnviar: boolean;
  puedeResolver: boolean;
}

export interface ClosureRevisionsPage {
  page: number;
  limit: number;
  total: number;
  items: ClosureRevision[];
}
