'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send, Trash2 } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentUser } from '@/hooks/use-current-user';
import {
  crearComentarioTarea,
  eliminarComentarioTarea,
  getComentariosTarea,
  type TareaComentario,
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
}

function getInitials(nombre: string, apellido: string): string {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'Hace un momento';
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`;
  if (diff < 2592000) return `Hace ${Math.floor(diff / 86400)} d`;
  return new Date(dateStr).toLocaleDateString('es-GT', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Contenido reutilizable de comentarios (composer + lista): mismo servicio,
 * mismas claves de caché e invalidaciones que antes vivían embebidas en
 * TaskCommentsDialog (Sección 60). Ahora lo consumen tanto el diálogo como
 * el TaskDetailsSheet, sin duplicar la lógica ni crear otra API.
 */
export function TaskCommentsPanel({ idProyecto, idTarea, enabled, scroll = true }: TaskCommentsPanelProps) {
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const [contenido, setContenido] = useState('');

  // El proveedor de comentarios exige un `idTarea` numérico incluso mientras
  // no hay tarea seleccionada; la query real solo se dispara con `enabled`,
  // así que este placeholder nunca llega a `apiFetch`.
  const comentariosKey = taskCommentsQueryKey(idProyecto, idTarea ?? 0);

  const { data: comentarios = [], isLoading, isError } = useQuery<TareaComentario[]>({
    queryKey: comentariosKey,
    queryFn: () => getComentariosTarea(idProyecto, idTarea as number),
    enabled: enabled && idTarea !== null,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: comentariosKey });
    queryClient.invalidateQueries({ queryKey: projectTasksQueryKey(idProyecto) });
  };

  const crearMutation = useMutation({
    mutationFn: (texto: string) => crearComentarioTarea(idProyecto, idTarea as number, texto),
    onSuccess: () => {
      setContenido('');
      invalidate();
    },
  });

  const eliminarMutation = useMutation({
    mutationFn: (idComentario: number) =>
      eliminarComentarioTarea(idProyecto, idTarea as number, idComentario),
    onSuccess: invalidate,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const texto = contenido.trim();
    if (!texto || idTarea === null) return;
    crearMutation.mutate(texto);
  };

  const puedeComentar = contenido.trim().length > 0 && !crearMutation.isPending;

  const lista = (
    <>
      {isLoading && <p className="text-sm text-tertiary text-center py-6">Cargando comentarios...</p>}

      {isError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400 text-center py-6">
          No fue posible cargar los comentarios.
        </p>
      )}

      {!isLoading && !isError && comentarios.length === 0 && (
        <p className="text-sm text-tertiary text-center py-6">
          Aún no hay comentarios. Sé el primero en escribir uno.
        </p>
      )}

      <ul className="space-y-4">
        {comentarios.map((c) => {
          const esAutor = currentUser?.idUsuario === c.idAutor;
          return (
            <li key={c.idComentario} className="flex items-start gap-3">
              <Avatar className="size-8 mt-0.5">
                <AvatarFallback className="bg-primary/10 text-primary font-bold text-xs">
                  {getInitials(c.autor.nombre, c.autor.apellido)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-on-surface truncate">
                    {c.autor.nombre} {c.autor.apellido}
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-tertiary">{timeAgo(c.creadoEn)}</span>
                    {esAutor && (
                      <button
                        type="button"
                        onClick={() => eliminarMutation.mutate(c.idComentario)}
                        disabled={eliminarMutation.isPending}
                        aria-label="Eliminar comentario"
                        title="Eliminar comentario"
                        className="text-tertiary hover:text-red-500 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-sm text-on-surface-variant whitespace-pre-wrap break-words mt-0.5">
                  {c.contenido}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <form onSubmit={handleSubmit} className="space-y-2">
        <Textarea
          value={contenido}
          onChange={(e) => setContenido(e.target.value)}
          placeholder="Escribe un comentario..."
          rows={3}
          maxLength={5000}
          disabled={crearMutation.isPending}
        />
        <div className="flex items-center justify-between">
          {crearMutation.isError ? (
            <p className="text-xs text-red-500">{(crearMutation.error as Error).message}</p>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={!puedeComentar}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-on-primary text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="size-3.5" />
            {crearMutation.isPending ? 'Enviando...' : 'Comentar'}
          </button>
        </div>
      </form>

      {scroll ? (
        <ScrollArea className="flex-1 -mx-6 px-6 border-t border-outline-variant pt-4 mt-2">
          {lista}
        </ScrollArea>
      ) : (
        <div className="border-t border-outline-variant pt-4 mt-2">{lista}</div>
      )}
    </div>
  );
}
