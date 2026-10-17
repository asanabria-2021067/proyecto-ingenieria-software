'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CommentThread } from '@/components/comments/comment-thread';
import {
  crearComentarioTarea,
  editarComentarioTarea,
  eliminarComentarioTarea,
  getComentariosTarea,
} from '@/lib/services/task-comments';
import { projectTasksQueryKey, taskCommentsQueryKey } from '@/lib/query-keys/tasks';

interface TaskCommentsPanelProps {
  idProyecto: number;
  idTarea: number | null;
  /** La consulta solo se dispara cuando el contenedor está visible. */
  enabled: boolean;
  /** Envuelve la lista en un ScrollArea con altura fija (diálogo). El Sheet
   *  ya desplaza su propio cuerpo, así que puede desactivarlo. */
  scroll?: boolean;
  /** HU-200 (T-377): comentario al que lleva una notificación. */
  comentarioDestacado?: number | null;
}

/**
 * Comentarios de una tarea: mismo servicio, mismas claves de caché e
 * invalidaciones de siempre (Sección 60), ahora montados sobre el hilo
 * genérico `CommentThread` (HU-200), que comparten tareas, proyecto e hitos y
 * añade las menciones con @ y la edición de comentarios propios.
 */
export function TaskCommentsPanel({
  idProyecto,
  idTarea,
  enabled,
  scroll = true,
  comentarioDestacado = null,
}: TaskCommentsPanelProps) {
  const queryClient = useQueryClient();

  // El proveedor de comentarios exige un `idTarea` numérico incluso mientras
  // no hay tarea seleccionada; la query real solo se dispara con `enabled`,
  // así que este placeholder nunca llega a `apiFetch`.
  const tarea = idTarea ?? 0;

  return (
    <CommentThread
      idProyecto={idProyecto}
      queryKey={taskCommentsQueryKey(idProyecto, tarea)}
      enabled={enabled && idTarea !== null}
      listar={() => getComentariosTarea(idProyecto, tarea)}
      crear={(contenido) => crearComentarioTarea(idProyecto, tarea, contenido)}
      editar={(idComentario, contenido) => editarComentarioTarea(idProyecto, tarea, idComentario, contenido)}
      eliminar={(idComentario) => eliminarComentarioTarea(idProyecto, tarea, idComentario)}
      onMutado={() => queryClient.invalidateQueries({ queryKey: projectTasksQueryKey(idProyecto) })}
      scroll={scroll}
      comentarioDestacado={comentarioDestacado}
      descripcionEliminar="Este comentario se eliminará de la tarea de forma permanente. Esta acción no se puede deshacer."
    />
  );
}
