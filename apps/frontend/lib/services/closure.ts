import { apiFetch, apiFetchBlob } from '@/lib/api/client';
import type { ReadGrant } from '@/lib/types/closure';

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
