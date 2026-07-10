import { apiFetch } from '@/lib/api/client';

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
    default:
      return null;
  }
}
