/**
 * C113 (06 v2 §41 `UploadGrant`): lo que el cliente recibe para poder subir.
 *
 * Contiene un ticket de APLICACIÓN y una URL del backend. Nunca una firma de
 * Cloudinary, nunca el API secret, nunca material criptográfico: el navegador
 * no habla con el proveedor en el flujo de cierre.
 */
export interface UploadGrant {
  documentId: number;
  /** Ruta del backend que recibe el multipart; el proveedor no aparece. */
  uploadUrl: string;
  ticket: string;
  expiraEn: Date;
  maxBytes: number;
}
