import {
  SECURITY_EVENTS_DEFAULT_LIMIT,
  SECURITY_EVENTS_MAX_LIMIT,
  isSecurityEventType,
  type SecurityEventType,
  type SecurityEventsQuery,
} from '@/lib/types/admin-security';

/** Prefijo del visor de eventos de seguridad (T-310): invalida todas sus páginas y filtros. */
export const adminSecurityEventsPrefix = ['admin', 'eventos-seguridad'] as const;

/** Filtros en forma canónica: toda clave presente, `null` cuando el filtro no aplica. */
export interface SecurityEventsFilterKey {
  tipo: SecurityEventType | null;
  desde: string | null;
  hasta: string | null;
  idUsuario: number | null;
}

/**
 * Dos consultas equivalentes producen la misma key aunque difieran en el orden
 * de sus claves, en espacios o en filtros vacíos; un filtro inválido cuenta
 * como ausente, igual que hace el servicio al serializar.
 */
export function normalizeSecurityEventsFilters(query: SecurityEventsQuery = {}): SecurityEventsFilterKey {
  return {
    tipo: isSecurityEventType(query.tipo) ? query.tipo : null,
    desde: query.desde?.trim() || null,
    hasta: query.hasta?.trim() || null,
    idUsuario: Number.isInteger(query.idUsuario) && (query.idUsuario as number) > 0 ? (query.idUsuario as number) : null,
  };
}

export function normalizeSecurityEventsPaging(query: SecurityEventsQuery = {}): { page: number; limit: number } {
  const entero = (valor: unknown) => Number.isInteger(valor) && (valor as number) > 0;
  return {
    page: entero(query.page) ? (query.page as number) : 1,
    limit: entero(query.limit) ? Math.min(query.limit as number, SECURITY_EVENTS_MAX_LIMIT) : SECURITY_EVENTS_DEFAULT_LIMIT,
  };
}

/** Los filtros van antes que la página: cambiar de página conserva el prefijo de sus filtros. */
export const adminSecurityEventsQueryKey = (query: SecurityEventsQuery = {}) => {
  const { page, limit } = normalizeSecurityEventsPaging(query);
  return [...adminSecurityEventsPrefix, normalizeSecurityEventsFilters(query), limit, page] as const;
};
