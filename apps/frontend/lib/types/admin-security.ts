/**
 * Contrato del visor administrativo de eventos de seguridad (T-310).
 * Refleja `apps/backend/src/security-events/dto/security-event.dto.ts` y
 * `list-security-events-query.dto.ts` (`GET /admin/eventos-seguridad`).
 *
 * El backend ya entrega cada evento saneado; aquí solo existen los campos de
 * ese contrato. No hay JSON crudo, correo ni token que tipar.
 */

/** Catálogo cerrado de eventos que el backend registra. */
export const SECURITY_EVENT_TYPES = [
  'LOGIN_FAILED',
  'LOGIN_SUCCEEDED',
  'ACCOUNT_LOCKED',
  'PASSWORD_RESET_ISSUED',
  'PASSWORD_RESET_COMPLETED',
  'USER_STATUS_CHANGED',
] as const;
export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[number];

export const SECURITY_EVENTS_DEFAULT_LIMIT = 20;
export const SECURITY_EVENTS_MAX_LIMIT = 50;

export function isSecurityEventType(value: unknown): value is SecurityEventType {
  return typeof value === 'string' && (SECURITY_EVENT_TYPES as readonly string[]).includes(value);
}

/** `nombre` es null cuando la cuenta ya no existe. */
export interface SecurityEventAccount {
  idUsuario: number;
  nombre: string | null;
}

export type SecurityEventDetailValue = string | number | boolean;

export interface SecurityEvent {
  id: number;
  tipo: SecurityEventType;
  /** Instante del evento, ISO 8601 en UTC. */
  fecha: string;
  /** Quien ejecutó la acción; null si no había sesión. */
  actor: SecurityEventAccount | null;
  /** Cuenta afectada; null si el evento no corresponde a una cuenta existente. */
  cuenta: SecurityEventAccount | null;
  /** `ipConfiable: false` significa que la IP NO es un origen confirmado del cliente. */
  origen: { ip: string | null; ipConfiable: boolean };
  detalle: Record<string, SecurityEventDetailValue>;
}

export interface SecurityEventsPage {
  data: SecurityEvent[];
  total: number;
  page: number;
  totalPages: number;
  tipos: SecurityEventType[];
}

/** `desde` y `hasta` son instantes ISO 8601 CON zona horaria; el backend rechaza los que no la traen. */
export interface SecurityEventsQuery {
  tipo?: SecurityEventType;
  desde?: string;
  hasta?: string;
  idUsuario?: number;
  page?: number;
  limit?: number;
}
