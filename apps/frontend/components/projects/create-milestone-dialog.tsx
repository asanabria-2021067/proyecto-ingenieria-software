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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { getApiErrorMessage } from '@/components/projects/api-error';
import type { useProjectMilestones } from '@/hooks/use-project-milestones';

type MilestonesHook = ReturnType<typeof useProjectMilestones>;

export interface CreateMilestoneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  crearHito: MilestonesHook['crearHito'];
}

interface FormState {
  tituloHito: string;
  descripcionHito: string;
  fechaLimite: string;
}

const EMPTY_FORM: FormState = { tituloHito: '', descripcionHito: '', fechaLimite: '' };

export function CreateMilestoneDialog({ open, onOpenChange, crearHito }: CreateMilestoneDialogProps) {
  const [values, setValues] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setValues(EMPTY_FORM);
      setError(null);
    }
    onOpenChange(next);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const tituloHito = values.tituloHito.trim();
    if (tituloHito.length === 0) {
      setError('El título no puede estar vacío.');
      return;
    }
    setError(null);

    try {
      await crearHito.mutateAsync({
        tituloHito,
        descripcionHito: values.descripcionHito.trim() || undefined,
        fechaLimite: values.fechaLimite || undefined,
      });
      handleOpenChange(false);
    } catch (submitError) {
      setError(getApiErrorMessage(submitError));
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[96vw] max-w-[480px] gap-0 border-outline-variant bg-surface-container-lowest p-0">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="border-b border-outline-variant/35 px-6 pb-4 pt-5 text-left">
            <DialogTitle className="text-xl font-bold text-on-surface">Agregar hito</DialogTitle>
            <DialogDescription className="text-sm text-on-surface-variant">
              Define un nuevo hito para organizar las tareas de este proyecto.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-6 py-5">
            <div>
              <label htmlFor="hito-titulo" className="text-xs font-semibold text-on-surface">
                Título
              </label>
              <Input
                id="hito-titulo"
                value={values.tituloHito}
                maxLength={255}
                disabled={crearHito.isPending}
                onChange={(event) => setValues((current) => ({ ...current, tituloHito: event.target.value }))}
                placeholder="Ej. Entrega de MVP"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'hito-error' : undefined}
                className="mt-1 h-10 rounded-md border-outline-variant text-sm"
              />
            </div>

            <div>
              <label htmlFor="hito-descripcion" className="text-xs font-semibold text-on-surface">
                Descripción (opcional)
              </label>
              <Textarea
                id="hito-descripcion"
                value={values.descripcionHito}
                disabled={crearHito.isPending}
                onChange={(event) => setValues((current) => ({ ...current, descripcionHito: event.target.value }))}
                placeholder="Detalles del hito"
                className="mt-1 rounded-md border-outline-variant text-sm"
              />
            </div>

            <div>
              <label htmlFor="hito-fecha" className="text-xs font-semibold text-on-surface">
                Fecha límite (opcional)
              </label>
              <Input
                id="hito-fecha"
                type="date"
                value={values.fechaLimite}
                disabled={crearHito.isPending}
                onChange={(event) => setValues((current) => ({ ...current, fechaLimite: event.target.value }))}
                className="mt-1 h-10 rounded-md border-outline-variant text-sm"
              />
            </div>

            {error && (
              <p id="hito-error" role="alert" className="text-xs text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 border-t border-outline-variant/35 px-6 py-4 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={crearHito.isPending}
              onClick={() => handleOpenChange(false)}
              className="h-10 rounded-md border-outline-variant text-xs font-bold"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={crearHito.isPending}
              className="h-10 gap-1.5 rounded-md bg-primary text-xs font-bold text-on-primary hover:bg-primary/90"
            >
              {crearHito.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
              {crearHito.isPending ? 'Creando...' : 'Crear hito'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
