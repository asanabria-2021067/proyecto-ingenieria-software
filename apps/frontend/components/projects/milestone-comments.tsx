'use client';

import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Flag } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { CommentThread } from '@/components/comments/comment-thread';
import {
  crearComentarioHito,
  editarComentario,
  eliminarComentario,
  getComentariosHito,
  getConteoComentariosHitos,
} from '@/lib/services/comments';
import { milestoneCommentCountsQueryKey, milestoneCommentsQueryKey } from '@/lib/query-keys/comments';
import type { HitoDTO } from '@/lib/dto/project.dto';

/**
 * HU-200: comentarios de hito (canal A del backend, sin pantalla hasta ahora).
 * Vive aparte de HitosSection para que sus pruebas puedan sustituirlo sin
 * arrastrar QueryClient ni red, igual que se hace con TaskCommentsDialog.
 */

/** Total de comentarios por hito del proyecto, para el botón de cada tarjeta. */
export function useMilestoneCommentCounts(idProyecto: number): Map<number, number> {
  const { data } = useQuery({
    queryKey: milestoneCommentCountsQueryKey(idProyecto),
    queryFn: () => getConteoComentariosHitos(idProyecto),
    enabled: Number.isInteger(idProyecto) && idProyecto > 0,
  });
  return useMemo(() => new Map((data ?? []).map((c) => [c.idHito, c.cantidad])), [data]);
}

interface MilestoneCommentsSheetProps {
  idProyecto: number;
  hito: Pick<HitoDTO, 'idHito' | 'tituloHito'> | null;
  onOpenChange: (open: boolean) => void;
  /** Comentario al que lleva una notificación (T-377). */
  comentarioDestacado?: number | null;
}

export function MilestoneCommentsSheet({
  idProyecto,
  hito,
  onOpenChange,
  comentarioDestacado = null,
}: MilestoneCommentsSheetProps) {
  const queryClient = useQueryClient();
  const idHito = hito?.idHito ?? 0;

  return (
    <Sheet open={hito !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-l border-outline-variant bg-surface p-0 sm:max-w-[460px] lg:max-w-[520px]"
      >
        <SheetHeader className="shrink-0 border-b border-outline-variant bg-surface-container-lowest px-stack py-stack">
          <p className="type-meta font-semibold uppercase tracking-wide">Comentarios del hito</p>
          <SheetTitle className="type-subtitle flex items-start gap-tight pr-8">
            <Flag className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="line-clamp-2">{hito?.tituloHito}</span>
          </SheetTitle>
          <SheetDescription className="type-meta">
            Comparte avances del hito y menciona con @ a quien necesites avisar.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-stack">
          {hito && (
            <CommentThread
              idProyecto={idProyecto}
              queryKey={milestoneCommentsQueryKey(idProyecto, idHito)}
              enabled
              listar={() => getComentariosHito(idHito)}
              crear={(contenido) => crearComentarioHito(idHito, contenido)}
              editar={editarComentario}
              eliminar={eliminarComentario}
              onMutado={() =>
                queryClient.invalidateQueries({ queryKey: milestoneCommentCountsQueryKey(idProyecto) })
              }
              scroll={false}
              comentarioDestacado={comentarioDestacado}
              descripcionEliminar="Este comentario se eliminará del hito de forma permanente. Esta acción no se puede deshacer."
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
