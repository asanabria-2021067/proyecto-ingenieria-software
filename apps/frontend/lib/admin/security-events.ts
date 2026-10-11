import type { TagTone } from '@/components/ui/tag';
import type { SecurityEvent, SecurityEventAccount, SecurityEventType } from '@/lib/types/admin-security';

/**
 * Presentación de los eventos de seguridad (T-310). Todo texto visible sale de
 * estos mapas: la vista nunca pinta una clave ni un valor del backend tal cual,
 * así que un dato que el contrato añada mañana no aparece hasta registrarlo aquí.
 */

export const SECURITY_EVENT_LABEL: Record<SecurityEventType, string> = {
  LOGIN_FAILED: 'Inicio de sesión fallido',
  LOGIN_SUCCEEDED: 'Inicio de sesión',
  ACCOUNT_LOCKED: 'Bloqueo temporal',
  PASSWORD_RESET_ISSUED: 'Enlace de recuperación emitido',
  PASSWORD_RESET_COMPLETED: 'Contraseña restablecida',
  USER_STATUS_CHANGED: 'Cambio de estado de cuenta',
};

/** Tonos compartidos del sistema de etiquetas (`components/ui/tag`); no define una familia nueva. */
export const SECURITY_EVENT_TONE: Record<SecurityEventType, TagTone> = {
  LOGIN_FAILED: 'amber',
  LOGIN_SUCCEEDED: 'success',
  ACCOUNT_LOCKED: 'red',
  PASSWORD_RESET_ISSUED: 'blue',
  PASSWORD_RESET_COMPLETED: 'turquoise',
  USER_STATUS_CHANGED: 'slate',
};

const MOTIVO_LABEL: Record<string, string> = {
  CREDENCIALES: 'Credenciales incorrectas',
  BLOQUEO_TEMPORAL: 'Cuenta en bloqueo temporal',
  CUENTA_NO_ACTIVA: 'Cuenta no activa',
};

const ESTADO_LABEL: Record<string, string> = {
  ACTIVO: 'Activo',
  INACTIVO: 'Inactivo',
  BLOQUEADO: 'Bloqueado',
};

export const SIN_DATO = 'Sin dato';

const FORMATO_FECHA = new Intl.DateTimeFormat('es-GT', {
  timeZone: 'America/Guatemala',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** Fecha y hora del evento en la hora de Guatemala, sea cual sea la zona del navegador. */
export function formatSecurityEventDate(iso: string): string {
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? 'Fecha desconocida' : FORMATO_FECHA.format(fecha);
}

/** D-FG02-01: nombre e ID de la cuenta; nunca su correo. */
export function accountLabel(account: SecurityEventAccount | null, ausente: string): string {
  if (!account) return ausente;
  return account.nombre ? `${account.nombre} (ID ${account.idUsuario})` : `Cuenta eliminada (ID ${account.idUsuario})`;
}

/**
 * D-FG02-02: una IP que el backend no marca como confiable se presenta como
 * «IP no verificada». No es el origen confirmado del evento: puede ser la
 * dirección de un proxy o de la red interna.
 */
export function originLabel(origen: SecurityEvent['origen']): { etiqueta: string; ip: string | null; verificada: boolean } {
  if (!origen.ip) return { etiqueta: 'Sin IP registrada', ip: null, verificada: false };
  return origen.ipConfiable
    ? { etiqueta: 'IP verificada', ip: origen.ip, verificada: true }
    : { etiqueta: 'IP no verificada', ip: origen.ip, verificada: false };
}

const texto = (valor: unknown, mapa: Record<string, string>): string | null =>
  typeof valor === 'string' && Object.prototype.hasOwnProperty.call(mapa, valor) ? mapa[valor] : null;
const entero = (valor: unknown): number | null => (Number.isInteger(valor) && (valor as number) >= 0 ? (valor as number) : null);

/** Resumen de una línea, compuesto solo con valores reconocidos del detalle. */
export function securityEventSummary(event: SecurityEvent): string {
  const { detalle } = event;
  const solicitud = entero(detalle.idSolicitud);
  switch (event.tipo) {
    case 'LOGIN_FAILED': {
      const partes = [texto(detalle.motivo, MOTIVO_LABEL), detalle.cuentaConocida === false ? 'Cuenta inexistente' : null];
      return partes.filter(Boolean).join(' · ') || SIN_DATO;
    }
    case 'LOGIN_SUCCEEDED':
      return 'Sesión iniciada';
    case 'ACCOUNT_LOCKED':
      return detalle.cuentaConocida === false ? 'Intentos fallidos · Cuenta inexistente' : 'Intentos fallidos repetidos';
    case 'PASSWORD_RESET_ISSUED':
      return solicitud !== null ? `Solicitud n.º ${solicitud}` : SIN_DATO;
    case 'PASSWORD_RESET_COMPLETED': {
      const sesiones = entero(detalle.sesionesRevocadas);
      const partes = [
        solicitud !== null ? `Solicitud n.º ${solicitud}` : null,
        sesiones !== null ? `${sesiones} ${sesiones === 1 ? 'sesión revocada' : 'sesiones revocadas'}` : null,
      ];
      return partes.filter(Boolean).join(' · ') || SIN_DATO;
    }
    case 'USER_STATUS_CHANGED': {
      const anterior = texto(detalle.estadoAnterior, ESTADO_LABEL);
      const nuevo = texto(detalle.estadoNuevo, ESTADO_LABEL);
      return anterior && nuevo ? `${anterior} → ${nuevo}` : SIN_DATO;
    }
    default:
      return SIN_DATO;
  }
}
