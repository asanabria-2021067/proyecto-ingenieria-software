import { apiFetch } from '@/lib/api/client';
import type {
  AmistadDto,
  FeedSocialDto,
  SolicitudAmistadPendienteDto,
  UsuarioBusquedaDto,
  UsuarioResumenDto,
} from '@/lib/types/social';

export function crearSolicitudAmistad(idReceptor: number): Promise<AmistadDto> {
  return apiFetch<AmistadDto>('/social/amistades', {
    method: 'POST',
    body: JSON.stringify({ idReceptor }),
  });
}

export function aceptarSolicitudAmistad(idAmistad: number): Promise<AmistadDto> {
  return apiFetch<AmistadDto>(`/social/amistades/${idAmistad}/aceptar`, { method: 'PATCH' });
}

export function rechazarSolicitudAmistad(idAmistad: number): Promise<AmistadDto> {
  return apiFetch<AmistadDto>(`/social/amistades/${idAmistad}/rechazar`, { method: 'PATCH' });
}

export function eliminarAmistad(idAmistad: number): Promise<{ eliminado: boolean }> {
  return apiFetch<{ eliminado: boolean }>(`/social/amistades/${idAmistad}`, { method: 'DELETE' });
}

export function getAmigos(): Promise<UsuarioResumenDto[]> {
  return apiFetch<UsuarioResumenDto[]>('/social/amistades');
}

export function getSolicitudesPendientes(): Promise<SolicitudAmistadPendienteDto[]> {
  return apiFetch<SolicitudAmistadPendienteDto[]>('/social/amistades/pendientes');
}

export function seguirUsuario(idSeguido: number): Promise<{ idSeguimiento: number }> {
  return apiFetch<{ idSeguimiento: number }>('/social/seguimientos', {
    method: 'POST',
    body: JSON.stringify({ idSeguido }),
  });
}

export function dejarDeSeguir(idSeguido: number): Promise<{ eliminado: boolean }> {
  return apiFetch<{ eliminado: boolean }>(`/social/seguimientos/${idSeguido}`, { method: 'DELETE' });
}

export function getSiguiendo(): Promise<UsuarioResumenDto[]> {
  return apiFetch<UsuarioResumenDto[]>('/social/seguimientos/siguiendo');
}

export function getSeguidores(): Promise<UsuarioResumenDto[]> {
  return apiFetch<UsuarioResumenDto[]>('/social/seguimientos/seguidores');
}

export function buscarUsuarios(q: string): Promise<UsuarioBusquedaDto[]> {
  return apiFetch<UsuarioBusquedaDto[]>(`/social/usuarios/buscar?q=${encodeURIComponent(q)}`);
}

export function getFeedSocial(): Promise<FeedSocialDto> {
  return apiFetch<FeedSocialDto>('/social/feed');
}
