import { apiFetch } from '@/lib/api/client';

export interface TareaComentarioAutor {
  idUsuario: number;
  nombre: string;
  apellido: string;
  fotoUrl: string | null;
}

export interface TareaComentario {
  idComentario: number;
  idAutor: number;
  contenido: string;
  creadoEn: string;
  editadoEn: string | null;
  autor: TareaComentarioAutor;
}

export function getComentariosTarea(idTarea: number): Promise<TareaComentario[]> {
  return apiFetch<TareaComentario[]>(`/tareas/${idTarea}/comentarios`);
}

export function crearComentarioTarea(idTarea: number, contenido: string): Promise<TareaComentario> {
  return apiFetch<TareaComentario>(`/tareas/${idTarea}/comentarios`, {
    method: 'POST',
    body: JSON.stringify({ contenido }),
  });
}

export function eliminarComentarioTarea(
  idTarea: number,
  idComentario: number,
): Promise<{ idComentario: number }> {
  return apiFetch<{ idComentario: number }>(`/tareas/${idTarea}/comentarios/${idComentario}`, {
    method: 'DELETE',
  });
}
