import { apiFetch } from '@/lib/api/client';
import type { NotificationPreference } from '@/lib/notifications/preference-groups';

export interface Notificacion {
  idNotificacion: number;
  idUsuario: number;
  tipoNotificacion: string;
  tituloNotificacion: string;
  mensajeNotificacion: string | null;
  datosJson: Record<string, unknown> | null;
  creadaEn: string;
  leidaEn: string | null;
}

export function getNotificaciones(): Promise<Notificacion[]> {
  return apiFetch<Notificacion[]>('/notificaciones');
}

/** T-292: página de GET /notificaciones?page=N (misma forma que el listado paginado de proyectos). */
export interface NotificacionesPagina {
  data: Notificacion[];
  total: number;
  page: number;
  totalPages: number;
}

export const NOTIFICACIONES_POR_PAGINA = 20;

export function getNotificacionesPagina(page: number): Promise<NotificacionesPagina> {
  return apiFetch<NotificacionesPagina>(
    `/notificaciones?page=${page}&limit=${NOTIFICACIONES_POR_PAGINA}`,
  );
}

export function getConteoNoLeidas(): Promise<{ total: number }> {
  return apiFetch<{ total: number }>('/notificaciones/mias/conteo-no-leidas');
}

export function marcarLeida(id: number): Promise<Notificacion> {
  return apiFetch<Notificacion>(`/notificaciones/${id}/leer`, { method: 'PATCH' });
}

export function marcarTodasLeidas(): Promise<{ actualizadas: number }> {
  return apiFetch<{ actualizadas: number }>('/notificaciones/leer-todas', {
    method: 'PATCH',
  });
}

/**
 * T-328 — lee la lista que devuelven GET y PUT de preferencias. Solo entran
 * pares `{ tipo, activa }` bien formados; el número de tipos lo decide el
 * backend, aquí no se asume ninguno.
 */
export function parseNotificationPreferences(raw: unknown): NotificationPreference[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is NotificationPreference =>
        typeof item === 'object' && item !== null && typeof item.tipo === 'string' && item.tipo !== '' && typeof item.activa === 'boolean',
    )
    .map(({ tipo, activa }) => ({ tipo, activa }));
}

/** HU-185 — preferencias del usuario EN SESIÓN, una por tipo (sin fila guardada = activa). */
export async function getNotificationPreferences(): Promise<NotificationPreference[]> {
  return parseNotificationPreferences(await apiFetch<unknown>('/notificaciones/preferencias'));
}

/**
 * HU-185 — activa o desactiva UN tipo para el usuario en sesión. El backend
 * responde con la lista completa ya actualizada, que es la que se devuelve:
 * la interfaz muestra lo que quedó guardado, no lo que pidió.
 */
export async function updateNotificationPreference(tipo: string, activa: boolean): Promise<NotificationPreference[]> {
  const raw = await apiFetch<unknown>('/notificaciones/preferencias', {
    method: 'PUT',
    body: JSON.stringify({ tipo, activa }),
  });
  return parseNotificationPreferences(raw);
}

/**
 * G03 (UI-40): id de usuario válido para un parámetro de URL: entero positivo
 * (número o texto de dígitos). Cualquier otra cosa se descarta: la URL no
 * puede llevar texto arbitrario ni servir para consultar agendas ajenas.
 */
export function idUsuarioSeguro(valor: unknown): number | null {
  const n = typeof valor === 'number' ? valor : typeof valor === 'string' && /^\d{1,12}$/.test(valor) ? Number(valor) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Ruta del calendario con el calendario compartido de `ownerId` para activar; sin id válido, el calendario a secas. */
export function linkCalendarioCompartido(ownerId: unknown): string {
  const id = idUsuarioSeguro(ownerId);
  return id === null ? '/dashboard/calendario' : `/dashboard/calendario?compartido=${id}`;
}

/**
 * Resuelve a qué vista debe navegar el usuario al hacer clic en una notificación,
 * según su tipo. Devuelve null si el tipo no tiene una vista de destino definida.
 */
export function getNotificationLink(n: {
  tipoNotificacion: string;
  datosJson?: Record<string, unknown> | null;
}): string | null {
  const datos = n.datosJson as Record<string, unknown> | null;
  if (!datos) return null;

  switch (n.tipoNotificacion) {
    case 'NUEVA_POSTULACION':
      return typeof datos.projectId !== 'undefined'
        ? `/dashboard/proyectos/${datos.projectId}/postulaciones`
        : null;
    case 'POSTULACION_RESUELTA':
      return '/dashboard/mis-postulaciones';
    case 'SOLICITUD_RECUPERACION_CONTRASENA':
      return '/dashboard/admin/solicitudes-recuperacion';
    // G05 (OWASP25-C038): alerta de ráfaga de accesos fallidos/bloqueos; el
    // admin revisa el estado de las cuentas. El texto viene del backend (solo
    // conteos) y se muestra como texto; datosJson nunca se renderiza.
    case 'ALERTA_SEGURIDAD':
      return '/dashboard/admin/usuarios';
    case 'CUENTA_PENDIENTE_VERIFICACION':
      return '/dashboard/admin/cuentas-pendientes';
    // HU-184: alguien compartió su calendario. G03 (UI-40): el enlace lleva el
    // `ownerId` validado y la página lo activa solo si la API lo lista entre
    // los calendarios recibidos; notificaciones antiguas sin id abren el calendario.
    case 'CALENDARIO_COMPARTIDO':
      return linkCalendarioCompartido(datos.ownerId);
    default:
      return null;
  }
}
