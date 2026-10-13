import type { TagTone } from '@/components/ui/tag';
import type { SecurityEvent, SecurityEventAccount, SecurityEventsQuery, SecurityEventType } from '@/lib/types/admin-security';

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

/** La misma fecha en dos partes (día y hora), para apilarlas donde no caben en una línea. */
export function formatSecurityEventDateParts(iso: string): { dia: string; hora: string | null } {
  const completa = formatSecurityEventDate(iso);
  const corte = completa.lastIndexOf(', ');
  return corte === -1 ? { dia: completa, hora: null } : { dia: completa.slice(0, corte), hora: completa.slice(corte + 2) };
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

/** Filtros tal como los escribe el administrador: fechas `AAAA-MM-DD` del calendario de Guatemala e ID como texto. */
export interface SecurityEventsFilterValue {
  tipo: SecurityEventType | '';
  desde: string;
  hasta: string;
  idUsuario: string;
}

export const SECURITY_EVENTS_NO_FILTERS: SecurityEventsFilterValue = { tipo: '', desde: '', hasta: '', idUsuario: '' };

export type SecurityEventsFilterErrors = Partial<Record<'desde' | 'hasta' | 'idUsuario', string>>;

/** Guatemala no tiene horario de verano: su desplazamiento es siempre UTC−06:00. */
const GUATEMALA_OFFSET = '-06:00';
const MAX_ID_USUARIO = 2147483647;

function esDiaValido(dia: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return false;
  const fecha = new Date(`${dia}T00:00:00.000Z`);
  // `2026-02-30` se desborda a marzo: solo vale si al volver a escribirla es la misma.
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === dia;
}

export function hasSecurityEventsFilters(value: SecurityEventsFilterValue): boolean {
  return Boolean(value.tipo || value.desde || value.hasta || value.idUsuario.trim());
}

/** Vacío = filtros válidos. Con algún error la consulta NO se actualiza: la tabla nunca muestra un filtro a medias. */
export function securityEventsFilterErrors(value: SecurityEventsFilterValue): SecurityEventsFilterErrors {
  const errores: SecurityEventsFilterErrors = {};
  if (value.desde && !esDiaValido(value.desde)) errores.desde = 'La fecha inicial no es válida.';
  if (value.hasta && !esDiaValido(value.hasta)) errores.hasta = 'La fecha final no es válida.';
  if (!errores.desde && !errores.hasta && value.desde && value.hasta && value.desde > value.hasta) {
    errores.hasta = 'La fecha final no puede ser anterior a la inicial.';
  }
  const id = value.idUsuario.trim();
  if (id && !(/^[1-9]\d{0,9}$/.test(id) && Number(id) <= MAX_ID_USUARIO)) {
    errores.idUsuario = 'El ID de usuario debe ser un número entero positivo.';
  }
  return errores;
}

/**
 * Filtros visibles → consulta de la API. Un día de Guatemala va de las
 * 00:00:00.000 a las 23:59:59.999 con desplazamiento −06:00; el backend
 * compara instantes y ambos extremos son inclusivos.
 */
export function securityEventsQueryFromFilters(value: SecurityEventsFilterValue): SecurityEventsQuery {
  const id = value.idUsuario.trim();
  return {
    ...(value.tipo ? { tipo: value.tipo } : {}),
    ...(value.desde ? { desde: `${value.desde}T00:00:00.000${GUATEMALA_OFFSET}` } : {}),
    ...(value.hasta ? { hasta: `${value.hasta}T23:59:59.999${GUATEMALA_OFFSET}` } : {}),
    ...(id ? { idUsuario: Number(id) } : {}),
  };
}

export interface SecurityEventDetailRow {
  etiqueta: string;
  valor: string;
}

/**
 * Filas del detalle de un evento. Cada tipo declara qué claves muestra y cómo
 * se leen; una clave fuera de esta lista o un valor que no se reconoce NO se
 * pinta, aunque llegara en la respuesta.
 */
const DETALLE_VISIBLE: Record<SecurityEventType, Record<string, { etiqueta: string; leer: (valor: unknown) => string | null }>> = (() => {
  const siNo = (valor: unknown) => (typeof valor === 'boolean' ? (valor ? 'Sí' : 'No') : null);
  const numero = (valor: unknown) => (entero(valor) !== null ? String(valor) : null);
  const referencia = (valor: unknown) => (typeof valor === 'string' && /^[0-9a-f]{16}$/.test(valor) ? valor : null);
  const fecha = (valor: unknown) =>
    typeof valor === 'string' && !Number.isNaN(new Date(valor).getTime()) ? formatSecurityEventDate(valor) : null;
  const cuentaConocida = { etiqueta: 'La cuenta existe', leer: siNo };
  const cuentaRef = { etiqueta: 'Referencia seudónima de la cuenta', leer: referencia };
  const idSolicitud = { etiqueta: 'Solicitud de recuperación n.º', leer: numero };
  return {
    LOGIN_FAILED: { motivo: { etiqueta: 'Motivo', leer: (valor) => texto(valor, MOTIVO_LABEL) }, cuentaConocida, cuentaRef },
    LOGIN_SUCCEEDED: {},
    ACCOUNT_LOCKED: { cuentaConocida, cuentaRef },
    PASSWORD_RESET_ISSUED: { idSolicitud, expiraEn: { etiqueta: 'El enlace vence', leer: fecha } },
    PASSWORD_RESET_COMPLETED: { idSolicitud, sesionesRevocadas: { etiqueta: 'Sesiones revocadas', leer: numero } },
    USER_STATUS_CHANGED: {
      estadoAnterior: { etiqueta: 'Estado anterior', leer: (valor) => texto(valor, ESTADO_LABEL) },
      estadoNuevo: { etiqueta: 'Estado nuevo', leer: (valor) => texto(valor, ESTADO_LABEL) },
    },
  };
})();

export function securityEventDetailRows(event: SecurityEvent): SecurityEventDetailRow[] {
  const filas: SecurityEventDetailRow[] = [];
  for (const [clave, { etiqueta, leer }] of Object.entries(DETALLE_VISIBLE[event.tipo] ?? {})) {
    const valor = Object.prototype.hasOwnProperty.call(event.detalle, clave) ? leer(event.detalle[clave]) : null;
    if (valor !== null) filas.push({ etiqueta, valor });
  }
  return filas;
}
