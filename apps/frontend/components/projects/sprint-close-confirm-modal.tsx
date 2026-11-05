'use client';

import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { DestinoArrastre } from '@/lib/types/sprints';

export interface SprintClosePendingTask {
  idTarea: number;
  tituloTarea: string;
}

export interface SprintCloseConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tareasPendientes: SprintClosePendingTask[];
  isPending: boolean;
  onConfirm: (destino: DestinoArrastre) => void;
}

export function SprintCloseConfirmModal({
  open,
  onOpenChange,
  tareasPendientes,
  isPending,
  onConfirm,
}: SprintCloseConfirmModalProps) {
  const cantidad = tareasPendientes.length;
  // Dos clics seguidos antes de que pase el estado pendiente enviarían el cierre dos veces.
  const enviado = useRef(false);
  const confirmar = (destino: DestinoArrastre) => {
    if (enviado.current || isPending) return;
    enviado.current = true;
    onConfirm(destino);
  };
  useEffect(() => {
    if (!open) enviado.current = false;
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-[520px] gap-0 border-outline-variant bg-surface-container-lowest p-0">
        <DialogHeader className="border-b border-outline-variant/35 px-6 pb-4 pt-5 text-left">
          <DialogTitle className="type-subtitle font-bold text-on-surface">
            Este Sprint tiene {cantidad} {cantidad === 1 ? 'tarea pendiente' : 'tareas pendientes'}
          </DialogTitle>
          <DialogDescription className="text-sm text-on-surface-variant">
            Pásalas todas al siguiente Sprint o déjalas en el backlog con un clic. Se cierra el Sprint y esta acción no se puede deshacer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          <ul className="max-h-48 space-y-2 overflow-y-auto pr-1">
            {tareasPendientes.map((tarea) => (
              <li key={tarea.idTarea} className="card-base flex items-center gap-2 py-2.5 text-sm text-on-surface">
                <span className="pill pill-accent shrink-0">Pendiente</span>
                <span className="truncate">{tarea.tituloTarea}</span>
              </li>
            ))}
          </ul>

        </div>

        <DialogFooter className="gap-2 border-t border-outline-variant/35 px-6 py-4 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
            className="h-10 rounded-md border-outline-variant text-xs font-bold"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => confirmar('BACKLOG')}
            className="h-10 rounded-md border-outline-variant text-xs font-bold"
          >
            Dejar en el backlog
          </Button>
          <Button
            type="button"
            disabled={isPending}
            onClick={() => confirmar('SIGUIENTE_SPRINT')}
            className="h-10 gap-1.5 rounded-md bg-primary text-xs font-bold text-on-primary hover:bg-primary/90"
          >
            {isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
            {cantidad === 1 ? 'Pasar la tarea al siguiente Sprint' : `Pasar las ${cantidad} tareas al siguiente Sprint`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
