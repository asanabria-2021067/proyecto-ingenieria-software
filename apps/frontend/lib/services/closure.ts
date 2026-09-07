import { apiFetch, apiFetchBlob } from '@/lib/api/client';
import type {
  CloseReadinessSummary,
  ClosureDeliveryInput,
  ClosureDocumentPublic,
  ClosureDraft,
  ClosurePhase,
  ClosureResult,
  ClosureRevision,
  ClosureRevisionsPage,
  GeneratedReport,
  GenerateReportInput,
  ReadGrant,
  ReserveDocumentInput,
  UploadGrant,
} from '@/lib/types/closure';

/** E109 — `GET /proyectos/:pid/cierre/documentos/:did/url` → `ReadGrant` (TTL 300 s, nunca cacheado). */
export function getClosureDocumentReadGrant(idProyecto: number, idDocumento: number): Promise<ReadGrant> {
  return apiFetch<ReadGrant>(`/proyectos/${idProyecto}/cierre/documentos/${idDocumento}/url`);
}

/**
 * E110 — bytes del PDF servidos INLINE por el backend en `grant.url`
 * (`…/contenido?ticket=`). El navegador solo habla con el backend; nunca
 * con el proveedor. Devuelve un `Blob` que el visor convierte en objectURL.
 */
export function fetchClosureDocumentBytes(url: string): Promise<Blob> {
  return apiFetchBlob(url);
}

// ─── VIEW-13 (F005): preparación y envío del cierre ──────────────────────────

/** E103 — crea el borrador de cierre o devuelve el existente (idempotente). */
export function prepareClosure(idProyecto: number): Promise<ClosureDraft> {
  return apiFetch<ClosureDraft>(`/proyectos/${idProyecto}/cierre/preparacion`, { method: 'POST' });
}

/** E104 — qué falta para cerrar; consultar no cambia nada. */
export function getCloseReadiness(idProyecto: number, phase: ClosurePhase): Promise<CloseReadinessSummary> {
  return apiFetch<CloseReadinessSummary>(
    `/proyectos/${idProyecto}/cierre/readiness?phase=${encodeURIComponent(phase)}`,
  );
}

/** E105 — genera el informe automático del borrador. El payload SOLO lleva `revisionId`. */
export function generateAutoReport(idProyecto: number, input: GenerateReportInput): Promise<GeneratedReport> {
  return apiFetch<GeneratedReport>(`/proyectos/${idProyecto}/cierre/informe-automatico`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** E106 — reserva el permiso de carga; el cliente nunca recibe firma del proveedor. */
export function reserveClosureDocument(idProyecto: number, input: ReserveDocumentInput): Promise<UploadGrant> {
  return apiFetch<UploadGrant>(`/proyectos/${idProyecto}/cierre/documentos/firma`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/**
 * E107 — sube el PDF al backend con EXACTAMENTE dos partes: `ticket` y
 * `file`. `apiFetch` no fija `Content-Type` cuando el body es `FormData`, así
 * que el navegador genera el `boundary`. `grant.uploadUrl` es una ruta del
 * backend; el navegador nunca habla con el proveedor.
 */
export function uploadClosureDocument(grant: UploadGrant, file: File): Promise<ClosureDocumentPublic> {
  const form = new FormData();
  form.append('ticket', grant.ticket);
  form.append('file', file, file.name);
  return apiFetch<ClosureDocumentPublic>(grant.uploadUrl, { method: 'POST', body: form });
}

/** E108 — quita una evidencia del borrador. */
export function detachClosureDocument(idProyecto: number, idDocumento: number, revisionId: number): Promise<void> {
  return apiFetch<void>(
    `/proyectos/${idProyecto}/cierre/documentos/${idDocumento}?revisionId=${encodeURIComponent(String(revisionId))}`,
    { method: 'DELETE' },
  );
}

/** E013 — envía la solicitud de cierre (fase REQUEST). */
export function requestClose(idProyecto: number, input: ClosureDeliveryInput): Promise<ClosureResult> {
  return apiFetch<ClosureResult>(`/proyectos/${idProyecto}/solicitar-cierre`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** E113 — reenvía tras una corrección documental (fase RESUBMIT). Mismo shape que `requestClose`. */
export function resubmitClosure(idProyecto: number, input: ClosureDeliveryInput): Promise<ClosureResult> {
  return apiFetch<ClosureResult>(`/proyectos/${idProyecto}/cierre/reenviar`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** E111 — historial de entregas, paginado. */
export function getClosureRevisions(idProyecto: number, page = 1, limit = 20): Promise<ClosureRevisionsPage> {
  return apiFetch<ClosureRevisionsPage>(
    `/proyectos/${idProyecto}/cierre/revisiones?page=${page}&limit=${limit}`,
  );
}

/** E112 — una entrega concreta con sus documentos. */
export function getClosureRevision(idProyecto: number, numero: number): Promise<ClosureRevision> {
  return apiFetch<ClosureRevision>(`/proyectos/${idProyecto}/cierre/revisiones/${numero}`);
}
