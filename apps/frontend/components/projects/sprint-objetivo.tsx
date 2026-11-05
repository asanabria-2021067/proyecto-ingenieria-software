'use client';

import { useState } from 'react';
import { Loader2, Pencil } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { useUpdateSprintObjetivo } from '@/hooks/use-project-sprints';

const OBJETIVO_MAX = 280;

interface SprintObjetivoProps {
  idProyecto: number;
  idSprint: number;
  objetivo?: string | null;
  puedeEditar: boolean;
}

/** MEJ-117: objetivo opcional del Sprint arriba del tablero; sin objetivo no se dibuja nada salvo el botón «Agregar objetivo» del líder. */
export function SprintObjetivo({ idProyecto, idSprint, objetivo, puedeEditar }: SprintObjetivoProps) {
  const update = useUpdateSprintObjetivo(idProyecto);
  const [open, setOpen] = useState(false);
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!objetivo && !puedeEditar) return null;

  const abrir = () => {
    setTexto(objetivo ?? '');
    setError(null);
    setOpen(true);
  };

  const guardar = async () => {
    setError(null);
    try {
      await update.mutateAsync({ idSprint, objetivo: texto.trim() || null });
      setOpen(false);
    } catch (e) {
      setError(getApiErrorMessage(e, 'task', 'No se pudo guardar el objetivo. Intenta de nuevo.'));
    }
  };

  return (
    <section
      aria-label="Objetivo del Sprint"
      className={objetivo ? 'card-base mb-4 flex items-start gap-3' : 'mb-3 flex justify-end'}
    >
      {objetivo && (
        <div className="min-w-0 flex-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-tertiary">Objetivo del Sprint</h3>
          <p className="mt-1 whitespace-pre-line break-words text-sm text-on-surface">{objetivo}</p>
        </div>
      )}
      {puedeEditar && (
        <Button type="button" variant="outline" size="sm" onClick={abrir} className="shrink-0 gap-1.5 text-xs font-bold">
          <Pencil className="size-3.5" aria-hidden="true" />
          {objetivo ? 'Editar objetivo' : 'Agregar objetivo'}
        </Button>
      )}

      <Dialog open={open} onOpenChange={(next) => (update.isPending ? undefined : setOpen(next))}>
        <DialogContent className="w-[96vw] max-w-[440px] gap-0 border-outline-variant bg-surface-container-lowest p-0">
          <DialogHeader className="border-b border-outline-variant/35 px-6 pb-4 pt-5 text-left">
            <DialogTitle className="text-xl font-bold text-balance text-on-surface">Objetivo del Sprint</DialogTitle>
            <DialogDescription className="text-sm text-on-surface-variant">
              Es opcional. Déjalo vacío para quitarlo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 px-6 py-5">
            <label htmlFor="sprint-objetivo-edit" className="text-xs font-semibold text-on-surface">
              Objetivo
            </label>
            <Textarea
              id="sprint-objetivo-edit"
              rows={4}
              maxLength={OBJETIVO_MAX}
              value={texto}
              onChange={(event) => setTexto(event.target.value)}
              className="rounded-md border-outline-variant"
            />
            <p className="text-xs text-tertiary">
              {texto.length}/{OBJETIVO_MAX}
            </p>
            {error && (
              <p role="alert" className="rounded-md bg-status-error px-3 py-2 text-xs font-medium text-on-status-error">
                {error}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 border-t border-outline-variant/35 px-6 py-4 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={update.isPending}
              onClick={() => setOpen(false)}
              className="h-10 rounded-md border-outline-variant text-xs font-bold"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={update.isPending}
              onClick={guardar}
              className="h-10 gap-1.5 rounded-md bg-primary text-xs font-bold text-on-primary hover:bg-primary/90"
            >
              {update.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
