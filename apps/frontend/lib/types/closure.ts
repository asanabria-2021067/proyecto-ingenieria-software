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
