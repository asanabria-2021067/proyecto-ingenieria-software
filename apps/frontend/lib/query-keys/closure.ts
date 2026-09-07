/**
 * Query keys del cierre documental (Sprint 7). Única fuente de verdad de su
 * forma; nunca se repite el array a mano en una mutation.
 */

/**
 * Ticket de lectura de un documento (VIEW-20). SIEMPRE con `staleTime: 0`,
 * `gcTime: 0` y `enabled` solo con el visor abierto: el ticket caduca a los
 * 300 s y un ticket emitido antes de perder permisos produciría un 403
 * inexplicable. No se cachea jamás.
 */
export const closureDocumentGrantQueryKey = (idProyecto: number, idDocumento: number) =>
  ['closure-doc-grant', idProyecto, idDocumento] as const;
