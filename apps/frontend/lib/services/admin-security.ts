import { apiFetch } from '@/lib/api/client';
import {
  SECURITY_EVENTS_DEFAULT_LIMIT,
  SECURITY_EVENTS_MAX_LIMIT,
  isSecurityEventType,
  type SecurityEvent,
  type SecurityEventAccount,
  type SecurityEventDetailValue,
  type SecurityEventsPage,
  type SecurityEventsQuery,
} from '@/lib/types/admin-security';

const esEnteroPositivo = (valor: unknown): valor is number => Number.isInteger(valor) && (valor as number) > 0;
const esObjeto = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor);

/**
 * Parámetros de la consulta: solo viajan los filtros con un valor válido. Un
 * filtro vacío o mal formado se omite en vez de enviarse, porque el backend
 * responde 400 a cualquier valor que no reconozca.
 */
export function securityEventsSearchParams(query: SecurityEventsQuery = {}): URLSearchParams {
  const params = new URLSearchParams();
  if (isSecurityEventType(query.tipo)) params.set('tipo', query.tipo);
  if (query.desde?.trim()) params.set('desde', query.desde.trim());
  if (query.hasta?.trim()) params.set('hasta', query.hasta.trim());
  if (esEnteroPositivo(query.idUsuario)) params.set('idUsuario', String(query.idUsuario));
  params.set('page', String(esEnteroPositivo(query.page) ? query.page : 1));
  params.set(
    'limit',
    String(esEnteroPositivo(query.limit) ? Math.min(query.limit, SECURITY_EVENTS_MAX_LIMIT) : SECURITY_EVENTS_DEFAULT_LIMIT),
  );
  return params;
}

function cuenta(valor: unknown): SecurityEventAccount | null {
  if (!esObjeto(valor) || !esEnteroPositivo(valor.idUsuario)) return null;
  return { idUsuario: valor.idUsuario, nombre: typeof valor.nombre === 'string' && valor.nombre.trim() ? valor.nombre : null };
}

function evento(valor: unknown): SecurityEvent | null {
  if (!esObjeto(valor) || !esEnteroPositivo(valor.id) || !isSecurityEventType(valor.tipo) || typeof valor.fecha !== 'string') {
    return null;
  }
  const origen = esObjeto(valor.origen) ? valor.origen : {};
  const detalle: Record<string, SecurityEventDetailValue> = {};
  for (const [clave, dato] of Object.entries(esObjeto(valor.detalle) ? valor.detalle : {})) {
    if (typeof dato === 'string' || typeof dato === 'number' || typeof dato === 'boolean') detalle[clave] = dato;
  }
  return {
    id: valor.id,
    tipo: valor.tipo,
    fecha: valor.fecha,
    actor: cuenta(valor.actor),
    cuenta: cuenta(valor.cuenta),
    origen: { ip: typeof origen.ip === 'string' && origen.ip ? origen.ip : null, ipConfiable: origen.ipConfiable === true },
    detalle,
  };
}

/**
 * Lee la respuesta campo por campo: lo que no sea del contrato no entra al
 * estado del cliente, aunque el servidor lo enviara. Una IP solo queda como
 * confiable si el backend lo afirma con un `true` literal.
 */
export function parseSecurityEventsPage(raw: unknown): SecurityEventsPage {
  const body = esObjeto(raw) ? raw : {};
  const numero = (valor: unknown, porDefecto: number) =>
    Number.isInteger(valor) && (valor as number) >= 0 ? (valor as number) : porDefecto;
  const data = (Array.isArray(body.data) ? body.data : []).map(evento).filter((e): e is SecurityEvent => e !== null);
  return {
    data,
    total: numero(body.total, data.length),
    page: Math.max(1, numero(body.page, 1)),
    totalPages: numero(body.totalPages, data.length > 0 ? 1 : 0),
    tipos: (Array.isArray(body.tipos) ? body.tipos : []).filter(isSecurityEventType),
  };
}

/** T-310 — eventos de seguridad, paginados y filtrados (`limit ≤ 50`). Solo administradores. */
export async function getSecurityEvents(query: SecurityEventsQuery = {}, signal?: AbortSignal): Promise<SecurityEventsPage> {
  const raw = await apiFetch<unknown>(`/admin/eventos-seguridad?${securityEventsSearchParams(query).toString()}`, { signal });
  return parseSecurityEventsPage(raw);
}
