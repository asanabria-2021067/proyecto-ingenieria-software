'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { MessagesSquare } from 'lucide-react';
import { CommentThread } from '@/components/comments/comment-thread';
import {
  crearComentarioProyecto,
  editarComentario,
  eliminarComentario,
  getComentariosProyecto,
} from '@/lib/services/comments';
import { projectCommentsQueryKey } from '@/lib/query-keys/comments';

interface ProjectCommentsCardProps {
  idProyecto: number;
  /** Sin escritura (p. ej. proyecto en solo lectura) se muestra el hilo sin el cuadro para comentar. */
  puedeComentar?: boolean;
}

/**
 * HU-200: conversación general del proyecto (comentarios de proyecto del
 * backend, que hasta ahora no tenían pantalla). Solo se monta para el líder y
 * los integrantes activos, los únicos con lectura en el backend. Con
 * `?section=comments` o `?comment=N` (enlace de una notificación) la tarjeta
 * se lleva a la vista y el comentario indicado se ilumina.
 */
export function ProjectCommentsCard({ idProyecto, puedeComentar = true }: ProjectCommentsCardProps) {
  const searchParams = useSearchParams();
  const comentarioParam = searchParams.get('comment');
  const comentarioDestacado = comentarioParam && /^\d+$/.test(comentarioParam) ? Number(comentarioParam) : null;
  const enfocar = searchParams.get('section') === 'comments' || comentarioDestacado !== null;

  const queryKey = projectCommentsQueryKey(idProyecto);
  const listar = () => getComentariosProyecto(idProyecto);
  // Misma clave y función que el hilo: comparten la caché, solo se lee el total.
  const { data: comentarios } = useQuery({ queryKey, queryFn: listar });

  const seccionRef = useRef<HTMLElement>(null);
  const focoAplicado = useRef(false);
  useEffect(() => {
    if (!enfocar || focoAplicado.current) return;
    focoAplicado.current = true;
    requestAnimationFrame(() => seccionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [enfocar]);

  return (
    <section
      ref={seccionRef}
      id="conversacion"
      aria-labelledby="proyecto-conversacion-titulo"
      className="card-base scroll-mt-24"
    >
      <div className="mb-stack">
        <h2 id="proyecto-conversacion-titulo" className="type-subtitle flex items-center gap-tight">
          <MessagesSquare className="size-4 text-text-secondary" aria-hidden="true" />
          Conversación del proyecto
          {Array.isArray(comentarios) && comentarios.length > 0 && (
            <span className="pill pill-sm pill-neutral">{comentarios.length}</span>
          )}
        </h2>
        <p className="type-meta mt-micro">
          Coordina con el equipo y menciona a un integrante con @ para avisarle directamente.
        </p>
      </div>
      <CommentThread
        idProyecto={idProyecto}
        queryKey={queryKey}
        enabled
        listar={listar}
        crear={(contenido) => crearComentarioProyecto(idProyecto, contenido)}
        editar={editarComentario}
        eliminar={eliminarComentario}
        scroll={false}
        puedeComentar={puedeComentar}
        comentarioDestacado={comentarioDestacado}
        descripcionEliminar="Este comentario se eliminará de la conversación del proyecto de forma permanente. Esta acción no se puede deshacer."
      />
    </section>
  );
}
