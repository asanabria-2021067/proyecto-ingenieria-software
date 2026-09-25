'use client';

import { useState } from 'react';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
  const [destino, setDestino] = useState<DestinoArrastre | ''>('');

  const handleOpenChange = (next: boolean) => {
    if (!next) setDestino('');
    onOpenChange(next);
  };

  const handleConfirm = () => {
    if (!destino) return;
    onConfirm(destino);
  };

  const cantidad = tareasPendientes.length;
  const etiquetaDestino =
    destino === 'SIGUIENTE_SPRINT' ? 'al siguiente Sprint' : destino === 'BACKLOG' ? 'al backlog' : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[96vw] max-w-[520px] gap-0 border-outline-variant bg-surface-container-lowest p-0">
        <DialogHeader className="border-b border-outline-variant/35 px-6 pb-4 pt-5 text-left">
          <DialogTitle className="type-subtitle font-bold text-on-surface">
            Este Sprint tiene {cantidad} {cantidad === 1 ? 'tarea pendiente' : 'tareas pendientes'}
          </DialogTitle>
          <DialogDescription className="text-sm text-on-surface-variant">
            Elige a donde se mueven antes de cerrar. Esta accion no se puede deshacer.
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

          <RadioGroup
            value={destino}
            onValueChange={(value) => setDestino(value as DestinoArrastre)}
            disabled={isPending}
          >
            <label
              htmlFor="destino-siguiente-sprint"
              className="card-base flex cursor-pointer items-center gap-3 py-3 text-sm font-medium text-on-surface"
            >
              <RadioGroupItem value="SIGUIENTE_SPRINT" id="destino-siguiente-sprint" />
              Mover al siguiente Sprint
            </label>
            <label
              htmlFor="destino-backlog"
              className="card-base flex cursor-pointer items-center gap-3 py-3 text-sm font-medium text-on-surface"
            >
              <RadioGroupItem value="BACKLOG" id="destino-backlog" />
              Mover al backlog
            </label>
          </RadioGroup>
        </div>

        <DialogFooter className="gap-2 border-t border-outline-variant/35 px-6 py-4 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => handleOpenChange(false)}
            className="h-10 rounded-md border-outline-variant text-xs font-bold"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!destino || isPending}
            onClick={handleConfirm}
            className="h-10 gap-1.5 rounded-md bg-primary text-xs font-bold text-on-primary hover:bg-primary/90"
          >
            {isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
            {etiquetaDestino
              ? ("Cerrar y mover " + cantidad + " " + (cantidad === 1 ? 'tarea' : 'tareas') + " " + etiquetaDestino)
              : 'Elige un destino para continuar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
