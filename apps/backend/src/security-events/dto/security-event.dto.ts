import { isIP } from 'node:net';
import { EstadoUsuario } from '@prisma/client';
import { TipoEventoSeguridad, type TipoEventoSeguridadValor } from '../tipos-evento-seguridad';

/** `nombre` es null cuando la cuenta referida ya no existe. */
export interface SecurityEventAccountDto {
  idUsuario: number;
  nombre: string | null;
}

export type SecurityEventDetailValue = string | number | boolean;

export interface SecurityEventDto {
  id: number;
  tipo: TipoEventoSeguridadValor;
  /** Instante del evento, ISO 8601 en UTC. */
  fecha: string;
  /** Quien ejecutó la acción; null si no había sesión (por ejemplo un login fallido). */
  actor: SecurityEventAccountDto | null;
  /** Cuenta afectada; null si el evento no corresponde a una cuenta existente. */
  cuenta: SecurityEventAccountDto | null;
  /**
   * `ipConfiable` solo es true si el writer registró que la IP venía de un
   * proxy confiable; en cualquier otro caso es la dirección del proxy o de la
   * red interna y no debe leerse como la del cliente.
   */
  origen: { ip: string | null; ipConfiable: boolean };
  detalle: Record<string, SecurityEventDetailValue>;
}

export interface SecurityEventsPageDto {
  data: SecurityEventDto[];
  total: number;
  page: number;
  totalPages: number;
  /** Catálogo cerrado de tipos, para poblar el filtro. */
  tipos: TipoEventoSeguridadValor[];
}

/** Columnas de `bitacora_auditoria` que necesita la proyección. */
export interface SecurityEventRow {
  idAuditoria: number;
  accion: string;
  idUsuario: number | null;
  idObjeto: string | null;
  detalleJson: unknown;
  ipOrigen: string | null;
  fechaEvento: Date;
}

type Regla = (valor: unknown) => valor is SecurityEventDetailValue;

const booleano: Regla = (valor): valor is boolean => typeof valor === 'boolean';
const enteroNoNegativo: Regla = (valor): valor is number => Number.isSafeInteger(valor) && (valor as number) >= 0;
const unoDe =
  (valores: readonly string[]): Regla =>
  (valor): valor is string =>
    typeof valor === 'string' && valores.includes(valor);
const coincide =
  (patron: RegExp): Regla =>
  (valor): valor is string =>
    typeof valor === 'string' && patron.test(valor);

/** Referencia seudónima de `accountReference()`: 16 hex, nunca un correo. */
const cuentaRef = coincide(/^[0-9a-f]{16}$/);
const fechaIso = coincide(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/);
const estadoUsuario = unoDe(Object.values(EstadoUsuario));

/**
 * FG01-C04 (T-310): única puerta de salida de `detalleJson`.
 *
 * Por cada tipo, las claves que su productor real escribe y la forma exacta
 * que debe tener el valor. Lo que no esté aquí —una clave nueva, un valor de
 * otro tipo, un objeto o un arreglo— no sale. Añadir un dato al visor exige
 * añadirlo a esta tabla.
 */
const DETALLE_PERMITIDO: Record<TipoEventoSeguridadValor, Record<string, Regla>> = {
  LOGIN_FAILED: {
    motivo: unoDe(['CREDENCIALES', 'BLOQUEO_TEMPORAL', 'CUENTA_NO_ACTIVA']),
    cuentaConocida: booleano,
    cuentaRef,
  },
  LOGIN_SUCCEEDED: {},
  ACCOUNT_LOCKED: { cuentaConocida: booleano, cuentaRef },
  PASSWORD_RESET_ISSUED: { idSolicitud: enteroNoNegativo, expiraEn: fechaIso },
  PASSWORD_RESET_COMPLETED: { idSolicitud: enteroNoNegativo, sesionesRevocadas: enteroNoNegativo },
  USER_STATUS_CHANGED: { estadoAnterior: estadoUsuario, estadoNuevo: estadoUsuario },
};

function esTipo(accion: string): accion is TipoEventoSeguridadValor {
  return (TipoEventoSeguridad.VALORES as readonly string[]).includes(accion);
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function detallePermitido(tipo: TipoEventoSeguridadValor, crudo: unknown): Record<string, SecurityEventDetailValue> {
  const detalle: Record<string, SecurityEventDetailValue> = {};
  if (!esObjeto(crudo)) return detalle;
  for (const [clave, regla] of Object.entries(DETALLE_PERMITIDO[tipo])) {
    // Solo claves propias: nada heredado del prototipo llega al contrato.
    const valor = Object.prototype.hasOwnProperty.call(crudo, clave) ? crudo[clave] : undefined;
    if (regla(valor)) detalle[clave] = valor;
  }
  return detalle;
}

/** `idObjeto` es texto libre en la tabla: solo cuenta como id de usuario si es un entero de 32 bits. */
export function cuentaAfectadaId(idObjeto: string | null): number | null {
  if (idObjeto === null || !/^[1-9]\d{0,9}$/.test(idObjeto)) return null;
  const id = Number(idObjeto);
  return id <= 2147483647 ? id : null;
}

/** null si la fila no es un evento de seguridad del catálogo. */
export function toSecurityEventDto(row: SecurityEventRow, nombres: ReadonlyMap<number, string>): SecurityEventDto | null {
  if (!esTipo(row.accion)) return null;
  const cuenta = (idUsuario: number | null): SecurityEventAccountDto | null =>
    idUsuario === null ? null : { idUsuario, nombre: nombres.get(idUsuario) ?? null };

  return {
    id: row.idAuditoria,
    tipo: row.accion,
    fecha: row.fechaEvento.toISOString(),
    actor: cuenta(row.idUsuario),
    cuenta: cuenta(cuentaAfectadaId(row.idObjeto)),
    origen: {
      ip: row.ipOrigen !== null && isIP(row.ipOrigen) !== 0 ? row.ipOrigen : null,
      ipConfiable: esObjeto(row.detalleJson) && row.detalleJson.ipTrusted === true,
    },
    detalle: detallePermitido(row.accion, row.detalleJson),
  };
}
