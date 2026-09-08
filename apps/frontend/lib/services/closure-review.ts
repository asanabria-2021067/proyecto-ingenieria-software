/**
 * Servicios de la REVISIÓN administrativa del cierre (VIEW-14, F016).
 * Reflejan `apps/backend/src/project-closure/project-closure.controller.ts`
 * (`aprobar-cierre`, `rechazar-cierre`, `cierre/correccion-documental`).
 * Solo `ADMIN`. La lectura de revisiones se reutiliza de `closure.ts`.
 */
import { apiFetch } from '@/lib/api/client';
import type { ClosureResult } from '@/lib/types/closure';

export { getClosureRevisions, getClosureRevision } from '@/lib/services/closure';

export const COMENTARIO_VEREDICTO_MAX = 5000;

/**
 * `ReturnExecutionDto`. `legacy: true` existe SOLO para el proyecto legacy
 * sin revisión (P-07) y NUNCA se envía desde la UI: aquí siempre va
 * `revisionId`. El comentario es obligatorio.
 */
export interface ReturnExecutionInput {
  revisionId: number;
  comentario: string;
}

/** `CorrectionDto` — comentario obligatorio; crea un borrador heredando vínculos. */
export interface CorrectionInput {
  revisionId: number;
  comentario: string;
}

/**
 * `ApproveClosureDto`. `expectedFingerprint` es la huella de la ENTREGA
 * sellada (`fingerprintEntrega` de la revisión ENVIADA), no la del informe
 * automático: confundirlas produce un 409 permanente.
 */
export interface ApproveClosureInput {
  revisionId: number;
  expectedFingerprint: string;
  comentario?: string;
}

/** POST `/proyectos/:pid/rechazar-cierre` → el proyecto vuelve a `EN_PROGRESO`. */
export function returnToExecution(idProyecto: number, input: ReturnExecutionInput): Promise<ClosureResult> {
  return apiFetch<ClosureResult>(`/proyectos/${idProyecto}/rechazar-cierre`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** POST `/proyectos/:pid/cierre/correccion-documental` → sigue en `EN_SOLICITUD_CIERRE`. */
export function requestCorrection(idProyecto: number, input: CorrectionInput): Promise<ClosureResult> {
  return apiFetch<ClosureResult>(`/proyectos/${idProyecto}/cierre/correccion-documental`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/**
 * POST `/proyectos/:pid/aprobar-cierre` → cierra, acredita y completa
 * atómicamente. Un 503 significa que el informe oficial no pudo producirse
 * y que el proyecto NO se cerró (C143).
 */
export function approveClosure(idProyecto: number, input: ApproveClosureInput): Promise<ClosureResult> {
  const body: ApproveClosureInput = { revisionId: input.revisionId, expectedFingerprint: input.expectedFingerprint };
  if (input.comentario && input.comentario.trim().length > 0) body.comentario = input.comentario.trim();
  return apiFetch<ClosureResult>(`/proyectos/${idProyecto}/aprobar-cierre`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
