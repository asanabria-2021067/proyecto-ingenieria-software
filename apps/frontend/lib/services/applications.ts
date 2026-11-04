import { apiFetch } from '@/lib/api/client';
import type { MotivoRechazo } from '@/types';

export interface Postulacion {
  idPostulacion: number;
  idUsuarioPostulante: number;
  idRolProyecto: number;
  justificacion: string;
  estadoPostulacion: string;
  fechaPostulacion: string;
  fechaResolucion: string | null;
  resueltaPor: number | null;
  comentarioResolucion: string | null;
  postulante: {
    idUsuario: number;
    nombre: string;
    apellido: string;
    correo: string;
  };
  rolProyecto: {
    idRolProyecto: number;
    nombreRol: string;
    proyecto?: {
      tituloProyecto: string;
      tipoProyecto: string;
    };
  };
}

export interface CreatePostulacionPayload {
  idRolProyecto: number;
  justificacion: string;
  respuestas?: { idPregunta: number; respuesta: string }[];
}

export interface UpdateEstadoPostulacionPayload {
  estadoPostulacion: 'ACEPTADA' | 'RECHAZADA';
  /** Obligatorio al rechazar; con `OTRO` el comentario también lo es. */
  motivoRechazo?: MotivoRechazo;
  comentarioResolucion?: string;
}

export async function createPostulacion(payload: CreatePostulacionPayload): Promise<Postulacion> {
  return apiFetch<Postulacion>('/postulaciones', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getMyPostulaciones(): Promise<Postulacion[]> {
  return apiFetch<Postulacion[]>('/postulaciones/mis-postulaciones');
}

export async function getPostulacion(id: number): Promise<Postulacion> {
  return apiFetch<Postulacion>(`/postulaciones/${id}`);
}

export async function updateEstadoPostulacion(
  id: number,
  payload: UpdateEstadoPostulacionPayload,
): Promise<Postulacion> {
  return apiFetch<Postulacion>(`/postulaciones/${id}/estado`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/** MEJ-96: no borra; deja la postulación pendiente como RETIRADA. */
export async function deletePostulacion(id: number): Promise<{ mensaje: string; estadoPostulacion: 'RETIRADA' }> {
  return apiFetch<{ mensaje: string; estadoPostulacion: 'RETIRADA' }>(`/postulaciones/${id}`, { method: 'DELETE' });
}
