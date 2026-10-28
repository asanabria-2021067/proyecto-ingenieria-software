'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { Pencil, Send, Trash2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ConfirmActionDialog } from '@/components/admin/ConfirmActionDialog';
import { CommentContent } from '@/components/comments/comment-content';
import { MentionTextarea } from '@/components/comments/mention-textarea';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useProjectMentionables } from '@/hooks/use-project-mentionables';
import {
  contenidoAEditable,
  editableAContenido,
  mencionesPresentes,
  type MencionSeleccionada,
} from '@/lib/mentions/mention-tokens';
import type { ComentarioListado, Mencionable } from '@/lib/services/comments';
import uvgSwal from '@/lib/swal';
import { cn } from '@/lib/utils';

const MAX_CONTENIDO = 5000;

export interface CommentThreadProps {
  /** Proyecto del hilo: define a quién se puede mencionar. */
  idProyecto: number;
  queryKey: QueryKey;
  /** La consulta solo se dispara cuando el contenedor está visible. */
  enabled: boolean;
  listar: () => Promise<ComentarioListado[]>;
  crear: (contenido: string) => Promise<unknown>;
  editar: (idComentario: number, contenido: string) => Promise<unknown>;
  eliminar: (idComentario: number) => Promise<unknown>;
  /** Invalidaciones adicionales tras crear, editar o eliminar (contadores, tablero). */
  onMutado?: () => void;
  /** Envuelve la lista en un ScrollArea (contenedores de altura fija). */
  scroll?: boolean;
  /** Sin permiso de escritura se muestra el hilo sin el cuadro para comentar. */
  puedeComentar?: boolean;
  /** Comentario al que llega una notificación: se desplaza hasta él y se ilumina. */
  comentarioDestacado?: number | null;
  descripcionEliminar: string;
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

/** Lo más reciente arriba en los tres canales (el de proyecto/hito llega ascendente). */
function ordenarRecientes(comentarios: ComentarioListado[]): ComentarioListado[] {
  return [...comentarios].sort(
    (a, b) => new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime() || b.idComentario - a.idComentario,
  );
}

/**
 * HU-200: hilo de comentarios reutilizable (composer + lista) para tareas,
 * proyecto e hitos. Concentra lo que antes vivía en TaskCommentsPanel
 * (consulta, invalidaciones, eliminar con confirmación) y suma las menciones
 * con @ (T-376), su resaltado (T-378), la edición de comentarios propios y el
 * desplazamiento al comentario que abrió una notificación (T-377).
 */
export function CommentThread({
  idProyecto,
  queryKey,
  enabled,
  listar,
  crear,
  editar,
  eliminar,
  onMutado,
  scroll = true,
  puedeComentar = true,
  comentarioDestacado = null,
  descripcionEliminar,
}: CommentThreadProps) {
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const currentUserId = currentUser?.idUsuario ?? null;
  const { data: mencionables = [] } = useProjectMentionables(idProyecto, enabled && puedeComentar);

  const [texto, setTexto] = useState('');
  const [menciones, setMenciones] = useState<MencionSeleccionada[]>([]);
  const [comentarioAEliminar, setComentarioAEliminar] = useState<ComentarioListado | null>(null);
  const [editandoId, setEditandoId] = useState<number | null>(null);

  const { data = [], isLoading, isError } = useQuery<ComentarioListado[]>({
    queryKey,
    queryFn: listar,
    enabled,
  });
  const comentarios = useMemo(() => ordenarRecientes(Array.isArray(data) ? data : []), [data]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey });
    onMutado?.();
  };

  const crearMutation = useMutation({
    mutationFn: (contenido: string) => crear(contenido),
    onSuccess: () => {
      setTexto('');
      setMenciones([]);
      invalidate();
    },
  });

  const eliminarMutation = useMutation({
    mutationFn: (idComentario: number) => eliminar(idComentario),
    onSuccess: () => {
      invalidate();
      setComentarioAEliminar(null);
      uvgSwal.fire({ icon: 'success', title: 'Comentario eliminado', timer: 1800, showConfirmButton: false });
    },
    onError: (error: Error) => {
      setComentarioAEliminar(null);
      uvgSwal.fire({ icon: 'error', title: 'No se pudo eliminar el comentario', text: error.message });
    },
  });

  const enviar = () => {
    const contenido = editableAContenido(texto.trim(), mencionesPresentes(texto, menciones));
    if (!contenido || crearMutation.isPending) return;
    crearMutation.mutate(contenido);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    enviar();
  };

  const puedeEnviar = texto.trim().length > 0 && !crearMutation.isPending;

  // T-377: al llegar desde una notificación, llevar el comentario a la vista
  // una sola vez por id; la clase `comment-spotlight` lo ilumina al montarse.
  const itemsRef = useRef(new Map<number, HTMLLIElement>());
  const yaDestacado = useRef<number | null>(null);
  useEffect(() => {
    if (comentarioDestacado === null || yaDestacado.current === comentarioDestacado) return;
    const el = itemsRef.current.get(comentarioDestacado);
    if (!el) return;
    yaDestacado.current = comentarioDestacado;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [comentarioDestacado, comentarios]);

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
          {puedeComentar ? 'Aún no hay comentarios. Sé el primero en escribir uno.' : 'Aún no hay comentarios.'}
        </p>
      )}

      <ul className="space-y-2">
        {comentarios.map((c) => (
          <li
            key={c.idComentario}
            id={`comentario-${c.idComentario}`}
            ref={(el) => {
              if (el) itemsRef.current.set(c.idComentario, el);
              else itemsRef.current.delete(c.idComentario);
            }}
            className={cn(
              '-mx-2 flex items-start gap-3 rounded-xl px-2 py-2',
              comentarioDestacado === c.idComentario && 'comment-spotlight',
            )}
          >
            <Avatar className="size-8 mt-0.5">
              {c.autor.fotoUrl && <AvatarImage src={c.autor.fotoUrl} alt="" />}
              <AvatarFallback className="bg-primary/10 text-primary font-bold text-xs">
                {getInitials(c.autor.nombre, c.autor.apellido)}
              </AvatarFallback>
            </Avatar>
            <ComentarioCuerpo
              comentario={c}
              esAutor={currentUserId === c.idAutor}
              puedeComentar={puedeComentar}
              currentUserId={currentUserId}
              mencionables={mencionables}
              editando={editandoId === c.idComentario}
              onEditar={() => setEditandoId(c.idComentario)}
              onCerrarEdicion={() => setEditandoId(null)}
              onEliminar={() => setComentarioAEliminar(c)}
              eliminando={eliminarMutation.isPending}
              guardar={async (contenido) => {
                await editar(c.idComentario, contenido);
                invalidate();
              }}
            />
          </li>
        ))}
      </ul>
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {puedeComentar && (
        <form onSubmit={handleSubmit} className="space-y-2">
          <MentionTextarea
            value={texto}
            onChange={setTexto}
            menciones={menciones}
            onMencionesChange={setMenciones}
            mencionables={mencionables}
            currentUserId={currentUserId}
            onSubmit={enviar}
            placeholder="Escribe un comentario..."
            aria-label="Escribe un comentario"
            rows={3}
            maxLength={MAX_CONTENIDO}
            disabled={crearMutation.isPending}
          />
          <div className="flex items-center justify-between gap-3">
            {crearMutation.isError ? (
              <p className="text-xs text-red-500">{(crearMutation.error as Error).message}</p>
            ) : (
              <p className="text-[11px] text-tertiary">
                Escribe <span className="font-semibold text-on-surface-variant">@</span> para mencionar a un integrante.
              </p>
            )}
            <Button
              type="submit"
              disabled={!puedeEnviar}
              className="h-auto gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-on-primary hover:bg-primary/90 has-[>svg]:px-4 motion-glow-primary"
            >
              <Send className="size-3.5" />
              {crearMutation.isPending ? 'Enviando...' : 'Comentar'}
            </Button>
          </div>
        </form>
      )}

      {scroll ? (
        <ScrollArea
          className={cn('flex-1 -mx-6 px-6', puedeComentar && 'border-t border-outline-variant pt-4 mt-2')}
        >
          {lista}
        </ScrollArea>
      ) : (
        <div className={cn(puedeComentar && 'border-t border-outline-variant pt-4 mt-2')}>{lista}</div>
      )}

      <ConfirmActionDialog
        open={comentarioAEliminar !== null}
        title="Eliminar comentario"
        description={descripcionEliminar}
        actionLabel="Sí, eliminar comentario"
        variant="destructive"
        isPending={eliminarMutation.isPending}
        onConfirm={() => comentarioAEliminar && eliminarMutation.mutate(comentarioAEliminar.idComentario)}
        onCancel={() => setComentarioAEliminar(null)}
      />
    </div>
  );
}

interface ComentarioCuerpoProps {
  comentario: ComentarioListado;
  esAutor: boolean;
  puedeComentar: boolean;
  currentUserId: number | null;
  mencionables: Mencionable[];
  editando: boolean;
  onEditar: () => void;
  onCerrarEdicion: () => void;
  onEliminar: () => void;
  eliminando: boolean;
  guardar: (contenido: string) => Promise<void>;
}

function ComentarioCuerpo({
  comentario: c,
  esAutor,
  puedeComentar,
  currentUserId,
  mencionables,
  editando,
  onEditar,
  onCerrarEdicion,
  onEliminar,
  eliminando,
  guardar,
}: ComentarioCuerpoProps) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-on-surface truncate">
          {c.autor.nombre} {c.autor.apellido}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-tertiary">
            {timeAgo(c.creadoEn)}
            {c.editadoEn && <span title={new Date(c.editadoEn).toLocaleString('es-GT')}> · editado</span>}
          </span>
          {esAutor && puedeComentar && !editando && (
            <button
              type="button"
              onClick={onEditar}
              aria-label="Editar comentario"
              title="Editar comentario"
              className="text-tertiary hover:text-primary transition-colors"
            >
              <Pencil className="size-3.5" />
            </button>
          )}
          {esAutor && puedeComentar && (
            <button
              type="button"
              onClick={onEliminar}
              disabled={eliminando}
              aria-label="Eliminar comentario"
              title="Eliminar comentario"
              className="text-tertiary hover:text-red-500 transition-colors disabled:opacity-50"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      {editando ? (
        <EdicionComentario
          comentario={c}
          currentUserId={currentUserId}
          mencionables={mencionables}
          onCancelar={onCerrarEdicion}
          guardar={async (contenido) => {
            await guardar(contenido);
            onCerrarEdicion();
          }}
        />
      ) : (
        <CommentContent
          className="mt-0.5"
          contenido={c.contenido}
          menciones={c.menciones}
          currentUserId={currentUserId}
        />
      )}
    </div>
  );
}

function EdicionComentario({
  comentario,
  currentUserId,
  mencionables,
  onCancelar,
  guardar,
}: {
  comentario: ComentarioListado;
  currentUserId: number | null;
  mencionables: Mencionable[];
  onCancelar: () => void;
  guardar: (contenido: string) => Promise<void>;
}) {
  const inicial = useMemo(() => contenidoAEditable(comentario.contenido), [comentario.contenido]);
  const [texto, setTexto] = useState(inicial.texto);
  const [menciones, setMenciones] = useState(inicial.menciones);
  const yaNotificados = useMemo(() => (comentario.menciones ?? []).map((m) => m.usuario.idUsuario), [comentario.menciones]);

  const mutation = useMutation({ mutationFn: guardar });
  const contenido = editableAContenido(texto.trim(), mencionesPresentes(texto, menciones));
  const sinCambios = contenido === comentario.contenido.trim();

  const enviar = () => {
    if (!contenido || sinCambios || mutation.isPending) return;
    mutation.mutate(contenido);
  };

  return (
    <form
      className="mt-1.5 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        enviar();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !e.defaultPrevented) {
          // Cancela la edición sin cerrar el diálogo o panel que contiene el hilo.
          e.stopPropagation();
          onCancelar();
        }
      }}
    >
      <MentionTextarea
        value={texto}
        onChange={setTexto}
        menciones={menciones}
        onMencionesChange={setMenciones}
        mencionables={mencionables}
        currentUserId={currentUserId}
        yaNotificados={yaNotificados}
        onSubmit={enviar}
        aria-label="Editar comentario"
        rows={3}
        maxLength={MAX_CONTENIDO}
        disabled={mutation.isPending}
        autoFocus
      />
      <div className="flex items-center justify-between gap-2">
        {mutation.isError ? (
          <p className="text-xs text-red-500">{(mutation.error as Error).message}</p>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onCancelar}
            disabled={mutation.isPending}
            className="h-auto rounded-xl px-3 py-1.5 text-xs font-semibold text-on-surface-variant hover:bg-surface-container hover:text-on-surface-variant dark:hover:bg-surface-container"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={!contenido || sinCambios || mutation.isPending}
            className="h-auto rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-on-primary hover:bg-primary/90 motion-glow-primary"
          >
            {mutation.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </div>
    </form>
  );
}
