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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConfirmActionDialog } from '@/components/admin/ConfirmActionDialog';
import { getApiErrorMessage } from '@/components/projects/api-error';
import uvgSwal from '@/lib/swal';
import type { useProjectMilestones } from '@/hooks/use-project-milestones';

type MilestonesHook = ReturnType<typeof useProjectMilestones>;
type AssignmentMode = 'existing' | 'new' | null;

export interface AssignMilestoneTask {
  idTarea: number;
  tituloTarea: string;
}

interface AssignMilestoneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hitos: { idHito: number; tituloHito: string }[];
  tareasSeleccionadas: AssignMilestoneTask[];
  crearHito: MilestonesHook['crearHito'];
  asignarHitoTareas: MilestonesHook['asignarHitoTareas'];
  onAsignado: () => void;
}

interface NewMilestoneForm {
  tituloHito: string;
  descripcionHito: string;
  fechaLimite: string;
}

const EMPTY_FORM: NewMilestoneForm = {
  tituloHito: '',
  descripcionHito: '',
  fechaLimite: '',
};

const MAX_TAREAS_LISTADAS = 5;

export function AssignMilestoneDialog({
  open,
  onOpenChange,
  hitos,
  tareasSeleccionadas,
  crearHito,
  asignarHitoTareas,
  onAsignado,
}: AssignMilestoneDialogProps) {
  const [mode, setMode] = useState<AssignmentMode>(null);
  const [idHito, setIdHito] = useState('');
  const [values, setValues] = useState<NewMilestoneForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isPending = crearHito.isPending || asignarHitoTareas.isPending;
  const cantidad = tareasSeleccionadas.length;

  const selectedHito = hitos.find((hito) => String(hito.idHito) === idHito);
  const nombreDestino =
    mode === 'existing' ? selectedHito?.tituloHito : values.tituloHito.trim();

  const reset = () => {
    setMode(null);
    setIdHito('');
    setValues(EMPTY_FORM);
    setError(null);
    setConfirmOpen(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && !isPending) reset();
    onOpenChange(next);
  };

  const prepareConfirmation = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (mode === null) {
      setError('Elige si deseas usar un hito existente o crear uno nuevo.');
      return;
    }

    if (mode === 'existing' && !selectedHito) {
      setError('Selecciona un hito existente.');
      return;
    }

    if (mode === 'new' && values.tituloHito.trim().length === 0) {
      setError('Escribe el nombre del nuevo hito.');
      return;
    }

    setError(null);
    setConfirmOpen(true);
  };

  const applyAssignment = async () => {
    const idsTareas = tareasSeleccionadas.map((tarea) => tarea.idTarea);

    try {
      if (mode === 'existing' && selectedHito) {
        await asignarHitoTareas.mutateAsync({
          idHito: selectedHito.idHito,
          input: { idsTareas },
        });
      } else {
        await crearHito.mutateAsync({
          tituloHito: values.tituloHito.trim(),
          descripcionHito: values.descripcionHito.trim() || undefined,
          fechaLimite: values.fechaLimite || undefined,
          idsTareas,
        });
      }

      void uvgSwal.fire({
        toast: true,
        backdrop: false,
        icon: 'success',
        title: 'Hito asignado',
        text: `Se asignó ${nombreDestino ?? 'el hito'} a ${cantidad} ${
          cantidad === 1 ? 'tarea' : 'tareas'
        }.`,
        position: 'top-end',
        timer: 2000,
        timerProgressBar: true,
        showConfirmButton: false,
      });

      onAsignado();
      reset();
      onOpenChange(false);
    } catch (submitError) {
      setConfirmOpen(false);
      setError(getApiErrorMessage(submitError, 'task'));
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="w-[96vw] max-w-[520px] gap-0 border-outline-variant bg-surface-container-lowest p-0">
          <form onSubmit={prepareConfirmation}>
            <DialogHeader className="border-b border-outline-variant/35 px-6 pb-4 pt-5 text-left">
              <DialogTitle className="text-xl font-bold text-on-surface">
                Asignar hito
              </DialogTitle>
              <DialogDescription className="text-sm text-on-surface-variant">
                Selecciona un hito existente o crea uno nuevo para las {cantidad}{' '}
                {cantidad === 1 ? 'tarea seleccionada' : 'tareas seleccionadas'}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 px-6 py-5">
              <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2.5 text-xs text-on-surface">
                <p className="font-semibold">
                  {cantidad} {cantidad === 1 ? 'tarea seleccionada' : 'tareas seleccionadas'}
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-on-surface-variant">
                  {tareasSeleccionadas.slice(0, MAX_TAREAS_LISTADAS).map((tarea) => (
                    <li key={tarea.idTarea} className="truncate" title={tarea.tituloTarea}>
                      {tarea.tituloTarea}
                    </li>
                  ))}
                </ul>
                {cantidad > MAX_TAREAS_LISTADAS && (
                  <p className="mt-1 text-on-surface-variant">
                    y {cantidad - MAX_TAREAS_LISTADAS} más…
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={mode === 'existing' ? 'default' : 'outline'}
                  onClick={() => {
                    setMode(null);
                    setError(null);
                  }}
                  disabled={isPending || hitos.length === 0}
                  className={
                    mode === 'existing'
                      ? 'bg-primary text-on-primary hover:bg-primary/90'
                      : 'border-outline-variant'
                  }
                >
                  Hito existente
                </Button>

                <Button
                  type="button"
                  variant={mode === 'new' ? 'default' : 'outline'}
                  onClick={() => {
                    setMode('new');
                    setError(null);
                  }}
                  disabled={isPending}
                  className={
                    mode === 'new'
                      ? 'bg-primary text-on-primary hover:bg-primary/90'
                      : 'border-outline-variant'
                  }
                >
                  Nuevo hito
                </Button>
              </div>

              {mode === null ? (
                <p className="text-sm text-on-surface-variant">
                  Elige una de las opciones para continuar.
                </p>
              ) : mode === 'existing' ? (
                <div>
                  <label
                    htmlFor="hito-existente"
                    className="text-xs font-semibold text-on-surface"
                  >
                    Hito
                  </label>
                  <Select value={idHito} onValueChange={setIdHito} disabled={isPending}>
                    <SelectTrigger
                      id="hito-existente"
                      className="mt-1 h-10 border-outline-variant"
                    >
                      <SelectValue placeholder="Selecciona un hito" />
                    </SelectTrigger>
                    <SelectContent>
                      {hitos.map((hito) => (
                        <SelectItem key={hito.idHito} value={String(hito.idHito)}>
                          {hito.tituloHito}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {hitos.length === 0 && (
                    <p className="mt-2 text-xs text-on-surface-variant">
                      No hay hitos existentes. Crea uno nuevo para continuar.
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <div>
                    <label
                      htmlFor="nuevo-hito-titulo"
                      className="text-xs font-semibold text-on-surface"
                    >
                      Nombre del nuevo hito
                    </label>
                    <Input
                      id="nuevo-hito-titulo"
                      value={values.tituloHito}
                      maxLength={255}
                      disabled={isPending}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          tituloHito: event.target.value,
                        }))
                      }
                      placeholder="Ej. Entrega de MVP"
                      className="mt-1 h-10 rounded-md border-outline-variant text-sm"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="nuevo-hito-descripcion"
                      className="text-xs font-semibold text-on-surface"
                    >
                      Descripción (opcional)
                    </label>
                    <Textarea
                      id="nuevo-hito-descripcion"
                      value={values.descripcionHito}
                      disabled={isPending}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          descripcionHito: event.target.value,
                        }))
                      }
                      placeholder="Detalles del hito"
                      className="mt-1 rounded-md border-outline-variant text-sm"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="nuevo-hito-fecha"
                      className="text-xs font-semibold text-on-surface"
                    >
                      Fecha límite (opcional)
                    </label>
                    <Input
                      id="nuevo-hito-fecha"
                      type="date"
                      value={values.fechaLimite}
                      disabled={isPending}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          fechaLimite: event.target.value,
                        }))
                      }
                      className="mt-1 h-10 rounded-md border-outline-variant text-sm"
                    />
                  </div>
                </>
              )}

              {error && (
                <p id="asignar-hito-error" role="alert" className="text-xs text-error">
                  {error}
                </p>
              )}
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
                type="submit"
                disabled={isPending || cantidad === 0}
                className="h-10 rounded-md bg-primary text-xs font-bold text-on-primary hover:bg-primary/90"
              >
                Continuar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        title="Confirmar asignación de hito"
        description={`Se asignará "${nombreDestino ?? 'el hito seleccionado'}" a ${cantidad} ${
          cantidad === 1 ? 'tarea' : 'tareas'
        }.`}
        actionLabel={`Asignar a ${cantidad} ${cantidad === 1 ? 'tarea' : 'tareas'}`}
        onConfirm={applyAssignment}
        isPending={isPending}
      />
    </>
  );
}
