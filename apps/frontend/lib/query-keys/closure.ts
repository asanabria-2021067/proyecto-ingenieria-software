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

/** Borrador de cierre (`POST …/cierre/preparacion`, idempotente). */
export const closureDraftQueryKey = (idProyecto: number) => ['closure-draft', idProyecto] as const;

/** Prefijo de readiness por proyecto: invalida las tres fases a la vez. */
export const closeReadinessPrefix = (idProyecto: number) => ['close-readiness', idProyecto] as const;

/** Readiness de una fase concreta: REQUEST, RESUBMIT y APPROVE no comparten caché. */
export const closeReadinessQueryKey = (idProyecto: number, phase: string) =>
  ['close-readiness', idProyecto, phase] as const;

export const closureRevisionsPrefix = (idProyecto: number) => ['closure-revisions', idProyecto] as const;

/** Página de revisiones de cierre (`GET …/cierre/revisiones?page=`). */
export const closureRevisionsQueryKey = (idProyecto: number, page: number) =>
  ['closure-revisions', idProyecto, page] as const;

export const closureRevisionPrefix = (idProyecto: number) => ['closure-revision', idProyecto] as const;

/** Una revisión concreta con sus documentos (`GET …/cierre/revisiones/:numero`). */
export const closureRevisionQueryKey = (idProyecto: number, numero: number) =>
  ['closure-revision', idProyecto, numero] as const;
