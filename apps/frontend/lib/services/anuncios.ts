import { apiFetch } from '@/lib/api/client';

export const NIVELES_ANUNCIO = ['INFO', 'ADVERTENCIA', 'URGENTE'] as const;
export type NivelAnuncio = (typeof NIVELES_ANUNCIO)[number];

export const AUDIENCIAS_ANUNCIO = ['TODOS', 'ESTUDIANTES'] as const;
export type AudienciaAnuncio = (typeof AUDIENCIAS_ANUNCIO)[number];

/** Anuncio vigente para el usuario (`GET /anuncios/vigentes`). */
export interface AnuncioVigente {
  idAnuncio: number;
  titulo: string;
  mensaje: string;
  nivel: NivelAnuncio;
  fechaInicio: string;
  fechaFin: string;
}

/** Anuncio completo de administración (`GET /admin/anuncios`). */
export interface AnuncioAdmin extends AnuncioVigente {
  audiencia: AudienciaAnuncio;
  activo: boolean;
  fechaCreacion: string;
}

export interface AnuncioInput {
  titulo: string;
  mensaje: string;
  nivel: NivelAnuncio;
  audiencia: AudienciaAnuncio;
  /** ISO 8601 */
  fechaInicio: string;
  fechaFin: string;
}

export type UpdateAnuncioInput = Partial<AnuncioInput> & { activo?: boolean };

export const getAnunciosVigentes = () => apiFetch<AnuncioVigente[]>('/anuncios/vigentes');

export const cerrarAnuncio = (idAnuncio: number) =>
  apiFetch<{ idAnuncio: number }>(`/anuncios/${idAnuncio}/cierre`, { method: 'POST' });

export const getAnunciosAdmin = () => apiFetch<AnuncioAdmin[]>('/admin/anuncios');

export const createAnuncio = (input: AnuncioInput) =>
  apiFetch<AnuncioAdmin>('/admin/anuncios', { method: 'POST', body: JSON.stringify(input) });

export const updateAnuncio = (idAnuncio: number, input: UpdateAnuncioInput) =>
  apiFetch<AnuncioAdmin>(`/admin/anuncios/${idAnuncio}`, { method: 'PATCH', body: JSON.stringify(input) });

export const despublicarAnuncio = (idAnuncio: number) =>
  apiFetch<AnuncioAdmin>(`/admin/anuncios/${idAnuncio}/despublicar`, { method: 'PATCH' });
