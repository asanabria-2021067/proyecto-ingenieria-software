/**
 * T-163: catálogo cerrado de eventos funcionales de la bitácora semántica de
 * Sprint (HU-140). Cada valor se persiste tal cual en
 * `BitacoraAuditoria.accion` — a diferencia de AuditInterceptor (que escribe
 * `"${method} ${url}"`), aquí `accion` es siempre uno de estos literales, lo
 * que permite distinguir el log funcional del técnico con un simple filtro
 * `accion IN (...)`, sin tocar la tabla ni su esquema.
 *
 * Clase con constantes `static readonly` (no `enum` de TypeScript) para que
 * agregar un evento nuevo sea tan simple como agregar una línea aquí — p.
 * ej. los eventos de cambio de atributos de tarea de HU-141 — sin depender
 * de las particularidades de un enum (bundling, `isolatedModules`, etc.).
 * `VALORES` es la lista explícita para iterar/validar en runtime; al
 * agregar una constante nueva, agrégala también en `VALORES`.
 */
export class TipoEventoBitacora {
  static readonly TASK_CREATED = 'TASK_CREATED' as const;
  static readonly TASK_UPDATED = 'TASK_UPDATED' as const;
  static readonly TASK_STATUS_CHANGED = 'TASK_STATUS_CHANGED' as const;
  static readonly TASK_ASSIGNED = 'TASK_ASSIGNED' as const;
  static readonly TASK_REASSIGNED = 'TASK_REASSIGNED' as const;
  static readonly TASK_HOURS_LOGGED = 'TASK_HOURS_LOGGED' as const;
  static readonly SPRINT_STARTED = 'SPRINT_STARTED' as const;

  // ---- Sprint 7 (06 v2 §43): veintiocho eventos nuevos; los siete anteriores conservan su literal. ----
  /** Time.update — registro, antes/después de horas/fecha/nota/justificación. */
  static readonly TIME_RECORD_EDITED = 'TIME_RECORD_EDITED' as const;
  /** Time.revoke — registro/tramo, horas, fecha y autor de la revocación. */
  static readonly TIME_RECORD_REVOKED = 'TIME_RECORD_REVOKED' as const;
  /** Tasks.closeAssignment — asignación, cache/fecha, tarea HECHO, avance. */
  static readonly ASSIGNMENT_CLOSED = 'ASSIGNMENT_CLOSED' as const;
  /** Adjustments.upsert — tramo/ajuste/base/delta/justificación/anterior. */
  static readonly TASK_HOURS_ADJUSTED = 'TASK_HOURS_ADJUSTED' as const;
  /** Adjustments.revert — ajuste anulado/autor/fecha. */
  static readonly TASK_HOURS_ADJUSTMENT_REVERTED = 'TASK_HOURS_ADJUSTMENT_REVERTED' as const;
  /** Sprints.finalize — Sprint, F1–F4 satisfechas/conteos. */
  static readonly SPRINT_FINALIZED = 'SPRINT_FINALIZED' as const;
  /** Sprints.close — Sprint, fecha/actor. */
  static readonly SPRINT_CLOSED = 'SPRINT_CLOSED' as const;
  /** Flow A — Sprint, IDs de tramos/participaciones y totales reportados/propuestos. */
  static readonly SPRINT_HOURS_CONSOLIDATED = 'SPRINT_HOURS_CONSOLIDATED' as const;
  /** Exit.approve — solicitud, usuario/participaciones, Sprint nullable, consumo/totales. */
  static readonly EXIT_REQUEST_APPROVED = 'EXIT_REQUEST_APPROVED' as const;
  /** Exit.reject — solicitud, actor/motivo. */
  static readonly EXIT_REQUEST_REJECTED = 'EXIT_REQUEST_REJECTED' as const;
  /** Leadership.createAppeal — apelación, asunto/candidato. */
  static readonly LEADERSHIP_APPEAL_CREATED = 'LEADERSHIP_APPEAL_CREATED' as const;
  /** Leadership.cancel / transfer directo — apelación, origen de cancelación/actor. */
  static readonly LEADERSHIP_APPEAL_CANCELLED = 'LEADERSHIP_APPEAL_CANCELLED' as const;
  /** Leadership.transfer — apelación, sucesor/historial. */
  static readonly LEADERSHIP_APPEAL_ACCEPTED = 'LEADERSHIP_APPEAL_ACCEPTED' as const;
  /** Leadership.deny — apelación, mensajeResolucion. */
  static readonly LEADERSHIP_APPEAL_DENIED = 'LEADERSHIP_APPEAL_DENIED' as const;
  /** Leadership.transfer — proyecto, líder anterior/nuevo/admin/origen/motivo, historial y participaciones observadas Q1. */
  static readonly LEADERSHIP_CHANGED = 'LEADERSHIP_CHANGED' as const;
  /** Closure.requestClose — proyecto, estado E→S, revisión, fingerprintEntrega. */
  static readonly PROJECT_CLOSE_REQUESTED = 'PROJECT_CLOSE_REQUESTED' as const;
  /** Closure.requestClose — proyecto, IDs/cantidad de postulaciones. */
  static readonly POSTULATIONS_AUTO_REJECTED = 'POSTULATIONS_AUTO_REJECTED' as const;
  /** Closure.prepare / correction — revisión, número/origen. */
  static readonly CLOSURE_DRAFT_CREATED = 'CLOSURE_DRAFT_CREATED' as const;
  /** Report.generate — documento, revisión/hash/versión/reemplaza vínculo. */
  static readonly CLOSURE_AUTOREPORT_GENERATED = 'CLOSURE_AUTOREPORT_GENERATED' as const;
  /** Documents.uploadAndAttach — documento/revisión/orden/bytes/checksum. */
  static readonly CLOSURE_DOCUMENT_ADDED = 'CLOSURE_DOCUMENT_ADDED' as const;
  /** Documents.detach — documento/revisión borrador, vínculo retirado. */
  static readonly CLOSURE_DOCUMENT_REMOVED = 'CLOSURE_DOCUMENT_REMOVED' as const;
  /** Closure.resubmit — revisión, manifest/hash. */
  static readonly PROJECT_CLOSE_DOCUMENTS_SUBMITTED = 'PROJECT_CLOSE_DOCUMENTS_SUBMITTED' as const;
  /** Review.approve — proyecto CERRADO, revisión/documentoOficial/admin/fecha. */
  static readonly PROJECT_CLOSE_REVIEW_APPROVED = 'PROJECT_CLOSE_REVIEW_APPROVED' as const;
  /** Review.approve — proyecto, IDs/importes acreditados y participantes. */
  static readonly PROJECT_HOURS_CREDITED = 'PROJECT_HOURS_CREDITED' as const;
  /** Review.correction — revisión resuelta/nuevo borrador/comentario. */
  static readonly PROJECT_CLOSE_REVIEW_DOC_CORRECTION = 'PROJECT_CLOSE_REVIEW_DOC_CORRECTION' as const;
  /** Review.return — proyecto S→E, revisión o modo legacy diagnosticado/comentario. */
  static readonly PROJECT_CLOSE_RETURNED_TO_EXECUTION = 'PROJECT_CLOSE_RETURNED_TO_EXECUTION' as const;
  /** Cleanup finaliza purga — documento/identidad, estado anterior/final; nunca claves. */
  static readonly CLOSURE_STORAGE_SWEPT = 'CLOSURE_STORAGE_SWEPT' as const;
  /** CLI apply — proyecto, manifestHash, IDs/antes/después y evidencia identificable. */
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

  /**
   * Sprint 7 (06 v2 §43): once tipos de entidad de la bitácora funcional; se
   * persisten tal cual en `BitacoraAuditoria.tipoObjeto`.
   */
  static readonly ENTIDADES = [
    'TAREA',
    'SPRINT',
    'PROYECTO',
    'ASIGNACION',
    'REGISTRO_TIEMPO',
    'AJUSTE_HORA',
    'APELACION_LIDERAZGO',
    'REVISION_CIERRE',
    'DOCUMENTO_CIERRE',
    'POSTULACION',
    'SOLICITUD_SALIDA',
  ] as const;
}

/** Tipo derivado del catálogo — usar este nombre (no `TipoEventoBitacora`) en anotaciones de tipo. */
export type TipoEventoBitacoraValor = (typeof TipoEventoBitacora.VALORES)[number];

/** Refleja `BitacoraAuditoria.tipoObjeto` para los eventos funcionales — nunca el `Controller.handler` que usa AuditInterceptor. */
export type TipoEntidadBitacora = (typeof TipoEventoBitacora.ENTIDADES)[number];
