/**
 * C103 (06 v2 §26): puerto CONGELADO de almacenamiento de documentos de
 * cierre. Existe para que el dominio nunca hable con el SDK del proveedor: la
 * lógica de cierre pide subir, verificar, leer o destruir, y quién lo hace es
 * un detalle sustituible detrás de estas cuatro operaciones.
 *
 * Todas las operaciones son I/O EXTERNO y viven fuera de cualquier
 * transacción de PostgreSQL y de cualquier lock de proyecto (§16/§26): una
 * transferencia de red no puede sostener una fila bloqueada.
 */

/** Único proveedor congelado para Sprint 7. */
export const CLOSURE_STORAGE_PROVIDER = 'cloudinary' as const;

/** Los documentos de cierre viajan siempre como binario opaco, nunca como imagen. */
export const CLOSURE_RESOURCE_TYPE = 'raw' as const;

/**
 * Sufijo congelado del objeto remoto. Nombra lo que realmente hay allí:
 * ciphertext. El proveedor acepta este sufijo y lo que se guarda nunca es un
 * PDF legible.
 */
export const CLOSURE_STORAGE_EXTENSION = '.enc' as const;

/**
 * Modalidad de entrega del asset. `authenticated` es la primaria verificada;
 * `private` es el primer fallback y `upload` el segundo, admisible ÚNICAMENTE
 * para ciphertext AES-256-GCM (§26): en ningún modo se sube texto claro.
 */
export const CLOSURE_DELIVERY_TYPES = ['authenticated', 'private', 'upload'] as const;
export type ClosureDeliveryType = (typeof CLOSURE_DELIVERY_TYPES)[number];

/**
 * Identidad remota de un documento. `assetId` y `version` solo se conocen
 * DESPUÉS de que el proveedor confirma la carga, así que son opcionales
 * mientras la identidad describe una reserva todavía no confirmada.
 */
export interface ClosureRemoteIdentity {
  proveedor: typeof CLOSURE_STORAGE_PROVIDER;
  cloudName: string;
  publicId: string;
  resourceType: typeof CLOSURE_RESOURCE_TYPE;
  deliveryType: ClosureDeliveryType;
  assetId?: string | null;
  version?: string | null;
}

/**
 * Metadatos que el proveedor devuelve sobre un asset ya existente, leídos con
 * su API autenticada. Nunca se construyen a partir del cuerpo de una petición
 * del cliente ni de una URL arbitraria (§26).
 */
export interface ClosureAssetDescriptor {
  assetId: string;
  publicId: string;
  resourceType: string;
  deliveryType: string;
  version: string;
  bytes: number;
  /** El proveedor puede omitirlo; nunca se interpreta como SHA-256 del PDF (§27). */
  etag?: string;
}

/**
 * Parámetros firmados por el SERVIDOR para una carga. Nunca se entregan al
 * navegador: el cliente recibe un ticket de aplicación, no una firma del
 * proveedor (§26/§27).
 */
export interface ClosureSignedUploadParams {
  publicId: string;
  timestamp: number;
  type: ClosureDeliveryType;
  /** Congelado en `false`: una carga de cierre nunca reemplaza un asset existente. */
  overwrite: false;
  signature: string;
  apiKey: string;
}

export type ClosureDestroyOutcome = 'deleted' | 'absent';

/** Contrato de las cuatro operaciones remotas. */
export interface ClosureStoragePort {
  /**
   * Sube el ciphertext con `overwrite=false`. Devolver sin excepción NO prueba
   * que los bytes enviados hayan quedado almacenados (§27): quien llame debe
   * verificar la identidad remota antes de dar el documento por disponible.
   */
  uploadImmutable(
    identity: ClosureRemoteIdentity,
    ciphertext: Buffer,
    signedParams: ClosureSignedUploadParams,
  ): Promise<ClosureRemoteIdentity>;

  /** Metadatos del asset según la API autenticada del proveedor. */
  verifyAsset(identity: ClosureRemoteIdentity): Promise<ClosureAssetDescriptor>;

  /** Descarga el objeto remoto exacto; el caller compara longitud y SHA-256. */
  readCiphertext(identity: ClosureRemoteIdentity, timeoutMs: number): Promise<Buffer>;

  /** Destruye el asset. `absent` es un resultado válido, no un error. */
  destroy(identity: ClosureRemoteIdentity): Promise<ClosureDestroyOutcome>;
}

/** Token de inyección del puerto; el dominio nunca inyecta el adaptador concreto. */
export const CLOUDINARY_CLOSURE_PORT = 'CLOUDINARY_CLOSURE_PORT';
