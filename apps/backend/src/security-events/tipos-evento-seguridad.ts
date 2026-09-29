/**
 * G05 (OWASP25-C037): catálogo cerrado de eventos de SEGURIDAD. Se persisten
 * en `bitacora_auditoria` (sin migración) con `accion` = uno de estos
 * literales y `tipoObjeto` = TIPO_OBJETO_SEGURIDAD, sin `idProyecto` en el
 * detalle. Son distintos de la bitácora funcional de proyecto
 * (TipoEventoBitacora): no colisionan con ella y nunca aparecen en sus
 * consultas (que filtran por `accion IN TipoEventoBitacora.VALORES` y por
 * `detalleJson.idProyecto`).
 *
 * Las exportaciones ya tienen sus eventos funcionales
 * (PROJECT_EXPORT_CSV_GENERATED / PROJECT_EXPORT_PDF_GENERATED): este catálogo
 * no define ningún evento paralelo de exportación.
 */
export class TipoEventoSeguridad {
  /** Login rechazado (credenciales, cuenta no activa o bloqueo temporal). */
  static readonly LOGIN_FAILED = 'LOGIN_FAILED' as const;
  /** Login aceptado y tokens emitidos. */
  static readonly LOGIN_SUCCEEDED = 'LOGIN_SUCCEEDED' as const;
  /** Una cuenta cruza al bloqueo temporal (una vez por transición). */
  static readonly ACCOUNT_LOCKED = 'ACCOUNT_LOCKED' as const;
  /** Un administrador emite un enlace de recuperación. */
  static readonly PASSWORD_RESET_ISSUED = 'PASSWORD_RESET_ISSUED' as const;
  /** El usuario completa el cambio de contraseña con un enlace válido. */
  static readonly PASSWORD_RESET_COMPLETED = 'PASSWORD_RESET_COMPLETED' as const;
  /** Un administrador cambia el estado de una cuenta (ACTIVO/INACTIVO/BLOQUEADO). */
  static readonly USER_STATUS_CHANGED = 'USER_STATUS_CHANGED' as const;

  static readonly VALORES = [
    'LOGIN_FAILED',
    'LOGIN_SUCCEEDED',
    'ACCOUNT_LOCKED',
    'PASSWORD_RESET_ISSUED',
    'PASSWORD_RESET_COMPLETED',
    'USER_STATUS_CHANGED',
  ] as const;
}

export type TipoEventoSeguridadValor = (typeof TipoEventoSeguridad.VALORES)[number];

/** `BitacoraAuditoria.tipoObjeto` de todas las filas de seguridad. */
export const TIPO_OBJETO_SEGURIDAD = 'SEGURIDAD_CUENTA' as const;
