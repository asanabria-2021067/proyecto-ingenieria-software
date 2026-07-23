'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, Send, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import type { TareaDTO } from '@/lib/dto/project.dto';

interface TaskCommentsDialogProps {
  tarea: TareaDTO | null;
  idProyecto: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

export function TaskCommentsDialog({ tarea, idProyecto, open, onOpenChange }: TaskCommentsDialogProps) {
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const [contenido, setContenido] = useState('');

  const idTarea = tarea?.idTarea ?? null;

  const { data: comentarios = [], isLoading } = useQuery<TareaComentario[]>({
    queryKey: ['tarea-comentarios', idTarea],
    queryFn: () => getComentariosTarea(idProyecto, idTarea as number),
    enabled: open && idTarea !== null,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['tarea-comentarios', idTarea] });
    queryClient.invalidateQueries({ queryKey: ['project', idProyecto] });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col bg-surface-container-lowest border-outline-variant">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-on-surface">
            <MessageCircle className="size-4 text-primary" />
            {tarea?.tituloTarea ?? 'Comentarios'}
          </DialogTitle>
          <DialogDescription className="text-tertiary">
            Discute detalles y deja contexto sobre esta tarea sin salir de la plataforma.
          </DialogDescription>
        </DialogHeader>

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
              <p className="text-xs text-red-500">
                {(crearMutation.error as Error).message}
              </p>
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

        <ScrollArea className="flex-1 -mx-6 px-6 border-t border-outline-variant pt-4">
          {isLoading && (
            <p className="text-sm text-tertiary text-center py-6">Cargando comentarios...</p>
          )}

          {!isLoading && comentarios.length === 0 && (
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
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
