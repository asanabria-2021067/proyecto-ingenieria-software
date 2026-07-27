'use client';

import { MessageCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TaskCommentsPanel } from '@/components/projects/task-comments-panel';
import type { TareaDTO } from '@/lib/dto/project.dto';

interface TaskCommentsDialogProps {
  tarea: TareaDTO | null;
  idProyecto: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Diálogo de comentarios: un envoltorio delgado sobre TaskCommentsPanel
 * (Sección 60), que concentra el servicio, las claves de caché y las
 * invalidaciones. El mismo panel se reutiliza dentro del TaskDetailsSheet.
 */
export function TaskCommentsDialog({ tarea, idProyecto, open, onOpenChange }: TaskCommentsDialogProps) {
  const idTarea = tarea?.idTarea ?? null;

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

        <TaskCommentsPanel idProyecto={idProyecto} idTarea={idTarea} enabled={open} />
      </DialogContent>
    </Dialog>
  );
}
