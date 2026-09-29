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
import { getApiErrorMessage } from '@/components/projects/api-error';
import { useStartSprint } from '@/hooks/use-project-sprints';

interface StartSprintButtonProps {
  idProyecto: number;
}

/** Mismo día calendario local usado por `task-form.schema.ts#hoyLocalISO`, para ofrecer un `min` útil en el input de fecha. */
function mananaLocalISO(): string {
  const manana = new Date();
  manana.setDate(manana.getDate() + 1);
  const anio = manana.getFullYear();
  const mes = String(manana.getMonth() + 1).padStart(2, '0');
  const dia = String(manana.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/**
 * Botón de acción del líder para abrir el primer Sprint de trabajo del
 * proyecto (F2), ahora con un diálogo (HU-160) que pide la fecha de fin
 * planeada — mismo criterio que el modal "Start Sprint" de Jira. Esa fecha
 * alimenta únicamente la línea ideal del burndown (T-240); el cierre real
 * del Sprint sigue siendo el flujo Finalizar → Cerrar existente, sin
 * relación con este campo. Si se deja vacía, el backend calcula
 * fechaInicio + 14 días.
 */
export function StartSprintButton({ idProyecto }: StartSprintButtonProps) {
  const startSprint = useStartSprint(idProyecto);
  const [open, setOpen] = useState(false);
  const [fechaFinPlaneada, setFechaFinPlaneada] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setFechaFinPlaneada('');
      setError(null);
    }
    setOpen(next);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    try {
      await startSprint.mutateAsync(fechaFinPlaneada || undefined);
      handleOpenChange(false);
    } catch (submitError) {
      setError(getApiErrorMessage(submitError));
    }
  };

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="gap-1.5 rounded-lg bg-primary text-xs font-bold text-on-primary hover:bg-primary/90"
      >
        Iniciar Sprint
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="w-[96vw] max-w-[420px] gap-0 border-outline-variant bg-surface-container-lowest p-0">
          <form onSubmit={handleSubmit}>
            <DialogHeader className="border-b border-outline-variant/35 px-6 pb-4 pt-5 text-left">
              <DialogTitle className="text-xl font-bold text-on-surface">Iniciar Sprint</DialogTitle>
              <DialogDescription className="text-sm text-on-surface-variant">
                Define cuándo debería terminar este Sprint para poder trazar el burndown.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 px-6 py-5">
              <div>
                <label htmlFor="sprint-fecha-fin-planeada" className="text-xs font-semibold text-on-surface">
                  Fin planeado (opcional)
                </label>
                <Input
                  id="sprint-fecha-fin-planeada"
                  type="date"
                  min={mananaLocalISO()}
                  value={fechaFinPlaneada}
                  disabled={startSprint.isPending}
                  onChange={(event) => setFechaFinPlaneada(event.target.value)}
                  className="mt-1 h-10 rounded-md border-outline-variant text-sm"
                />
                <p className="mt-1.5 text-xs text-tertiary">
                  Si lo dejas vacío, se usa un plazo por defecto de 14 días. No afecta cuándo puedes
                  cerrar el Sprint realmente — eso sigue siendo tu decisión con «Finalizar Sprint».
                </p>
              </div>

              {error && (
                <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}
            </div>

            <DialogFooter className="gap-2 border-t border-outline-variant/35 px-6 py-4 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={startSprint.isPending}
                onClick={() => handleOpenChange(false)}
                className="h-10 rounded-md border-outline-variant text-xs font-bold"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={startSprint.isPending}
                className="h-10 gap-1.5 rounded-md bg-primary text-xs font-bold text-on-primary hover:bg-primary/90"
              >
                {startSprint.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
                {startSprint.isPending ? 'Iniciando...' : 'Iniciar Sprint'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
