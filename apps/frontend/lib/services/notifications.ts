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
