/**
 * Puerto de almacenamiento de adjuntos del chat. Mismo criterio que el de
 * cierre: el dominio no conoce el SDK del proveedor. Los archivos son privados
 * (modo autenticado): solo se leen con una URL firmada de vida corta.
 */
export interface ChatStoragePort {
  /** Sube el binario bajo `key` (public_id remoto, con extension). */
  upload(key: string, data: Buffer): Promise<void>;
  /** URL firmada que expira en `ttlSeconds`. */
  signedUrl(key: string, ttlSeconds: number): Promise<string>;
  destroy(key: string): Promise<void>;
}

export const CHAT_STORAGE_PORT = 'CHAT_STORAGE_PORT';
