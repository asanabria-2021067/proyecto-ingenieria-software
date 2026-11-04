import { apiFetch, apiFetchBlob } from '@/lib/api/client';

export interface SesionAbierta {
  idSesion: string;
  navegador: string;
  sistema: string;
  ultimoUso: string;
  actual: boolean;
}

export const sesionesQueryKey = ['cuenta', 'sesiones'] as const;
export const desactivacionQueryKey = ['cuenta', 'desactivacion'] as const;

export const getSesiones = () => apiFetch<SesionAbierta[]>('/cuenta/sesiones');

/** `actual: true` = el backend ya limpió las cookies de esta sesión. */
export const cerrarSesionAbierta = (idSesion: string) =>
  apiFetch<{ cerrada: boolean; actual: boolean }>(`/cuenta/sesiones/${idSesion}`, { method: 'DELETE' });

export const cerrarOtrasSesiones = () =>
  apiFetch<{ cerradas: number }>('/cuenta/sesiones/cerrar-otras', { method: 'POST' });

export const reportarNoFuiYo = (idSesion: string) =>
  apiFetch<{ cerrada: boolean; actual: boolean; cambiarContrasena: boolean }>(
    `/cuenta/sesiones/${idSesion}/no-fui-yo`,
    { method: 'POST' },
  );

/** El backend renueva las cookies de esta sesión y cierra las demás. */
export const cambiarContrasena = (contrasenaActual: string, nuevaContrasena: string) =>
  apiFetch<{ mensaje: string }>('/cuenta/contrasena', {
    method: 'POST',
    body: JSON.stringify({ contrasenaActual, nuevaContrasena }),
  });

export const getMisDatos = () => apiFetchBlob('/cuenta/mis-datos', { headers: { Accept: 'application/json' } });

export type EstadoDesactivacion = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';

export interface SolicitudDesactivacion {
  idSolicitud: number;
  estado: EstadoDesactivacion;
  motivo: string | null;
  creadaEn: string;
  resueltaEn: string | null;
  comentarioResolucion: string | null;
}

export const getDesactivacion = () => apiFetch<{ solicitud: SolicitudDesactivacion | null }>('/cuenta/desactivacion');

export const solicitarDesactivacion = (motivo: string) =>
  apiFetch<SolicitudDesactivacion>('/cuenta/desactivacion', {
    method: 'POST',
    body: JSON.stringify(motivo ? { motivo } : {}),
  });
