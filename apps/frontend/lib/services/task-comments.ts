import { apiFetch } from '@/lib/api/client';

export interface TareaComentarioAutor {
  idUsuario: number;
  nombre: string;
  apellido: string;
  fotoUrl: string | null;
}

/** Forma de cada elemento del listado — el backend incluye `autor` solo aquí. */
export interface TareaComentario {
  idComentario: number;
  idAutor: number;
  contenido: string;
  creadoEn: string;
  editadoEn: string | null;
  autor: TareaComentarioAutor;
}

/**
 * Resultado crudo de crear/editar/eliminar un comentario: el backend
 * (`ComentariosService.createForTask/updateForTask/removeForTask`) no
 * incluye la relación `autor` en estas operaciones, a diferencia del
 * listado. Eliminar tampoco responde 204: devuelve el comentario marcado
 * como eliminado (`eliminadoEn` no nulo).
 */
export interface TareaComentarioEscritura {
  idComentario: number;
  idAutor: number;
  idProyecto: number | null;
  idTarea: number | null;
  idHito: number | null;
  contenido: string;
  creadoEn: string;
  editadoEn: string | null;
  eliminadoEn: string | null;
}

export function getComentariosTarea(idProyecto: number, idTarea: number): Promise<TareaComentario[]> {
  return apiFetch<TareaComentario[]>(`/proyectos/${idProyecto}/tareas/${idTarea}/comentarios`);
}

export function crearComentarioTarea(
  idProyecto: number,
  idTarea: number,
  contenido: string,
): Promise<TareaComentarioEscritura> {
  return apiFetch<TareaComentarioEscritura>(`/proyectos/${idProyecto}/tareas/${idTarea}/comentarios`, {
    method: 'POST',
    body: JSON.stringify({ contenido }),
  });
}

export function editarComentarioTarea(
  idProyecto: number,
  idTarea: number,
  idComentario: number,
  contenido: string,
): Promise<TareaComentarioEscritura> {
  return apiFetch<TareaComentarioEscritura>(
    `/proyectos/${idProyecto}/tareas/${idTarea}/comentarios/${idComentario}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ contenido }),
    },
  );
}

export function eliminarComentarioTarea(
  idProyecto: number,
  idTarea: number,
  idComentario: number,
): Promise<TareaComentarioEscritura> {
  return apiFetch<TareaComentarioEscritura>(
    `/proyectos/${idProyecto}/tareas/${idTarea}/comentarios/${idComentario}`,
    {
      method: 'DELETE',
    },
  );
}
