import { apiFetch } from '@/lib/api/client';

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
}

export interface UpdateEstadoPostulacionPayload {
  nuevoEstado: 'ACEPTADA' | 'RECHAZADA';
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

export async function deletePostulacion(id: number): Promise<{ mensaje: string }> {
  return apiFetch<{ mensaje: string }>(`/postulaciones/${id}`, { method: 'DELETE' });
}
