'use client';

import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { LabelForm, type LabelFormValues } from '@/components/projects/label-form';
import { getApiErrorMessage } from '@/components/projects/api-error';
import type { useProjectLabels } from '@/hooks/use-project-labels';
import type { LabelDTO } from '@/lib/services/labels';

type LabelsHook = ReturnType<typeof useProjectLabels>;

export interface ProjectLabelsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: LabelDTO[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  createLabel: LabelsHook['createLabel'];
  updateLabel: LabelsHook['updateLabel'];
  deleteLabel: LabelsHook['deleteLabel'];
}

type FormTarget = 'create' | LabelDTO | null;

export function ProjectLabelsDrawer({
  open,
  onOpenChange,
  labels,
  isLoading,
  isError,
  onRetry,
  createLabel,
  updateLabel,
  deleteLabel,
}: ProjectLabelsDrawerProps) {
  const [formTarget, setFormTarget] = useState<FormTarget>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [labelToDelete, setLabelToDelete] = useState<LabelDTO | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const cerrarFormulario = () => {
    setFormTarget(null);
    setFormError(null);
  };

  const handleSubmitLabel = async (values: LabelFormValues) => {
    setFormError(null);
    try {
      if (formTarget === 'create') {
        await createLabel.mutateAsync(values);
      } else if (formTarget) {
        await updateLabel.mutateAsync({ labelId: formTarget.idEtiqueta, input: values });
      }
      cerrarFormulario();
    } catch (error) {
      setFormError(getApiErrorMessage(error, 'label'));
    }
  };

  const handleConfirmDelete = async () => {
    if (!labelToDelete) return;
    setDeleteError(null);
    try {
      await deleteLabel.mutateAsync({ labelId: labelToDelete.idEtiqueta });
      setLabelToDelete(null);
    } catch (error) {
      setDeleteError(getApiErrorMessage(error, 'label'));
    }
  };

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            cerrarFormulario();
          }
          onOpenChange(next);
        }}
      >
        <SheetContent side="right" className="bg-surface-container-lowest border-outline-variant w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Etiquetas del proyecto</SheetTitle>
            <SheetDescription>
              Crea, edita o elimina las etiquetas disponibles para las tareas de este proyecto.
            </SheetDescription>
          </SheetHeader>

          <div className="px-4 pb-4 flex-1 overflow-y-auto space-y-4">
            {formTarget !== null ? (
              <LabelForm
                mode={formTarget === 'create' ? 'create' : 'edit'}
                label={formTarget === 'create' ? null : formTarget}
                onSubmit={handleSubmitLabel}
                onCancel={cerrarFormulario}
                isPending={createLabel.isPending || updateLabel.isPending}
                error={formError}
              />
            ) : (
              <>
                <Button
                  type="button"
                  onClick={() => setFormTarget('create')}
                  className="w-full rounded-lg bg-primary hover:bg-primary/90 text-on-primary font-bold"
                >
                  Crear etiqueta
                </Button>

                {isLoading && (
                  <p className="text-sm text-tertiary text-center py-6">Cargando etiquetas...</p>
                )}

                {!isLoading && isError && (
                  <div className="text-center py-6 space-y-2">
                    <p className="text-sm text-red-600 dark:text-red-400">
                      No se pudieron cargar las etiquetas.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={onRetry}
                      className="rounded-lg border-primary text-primary hover:bg-primary/10 text-xs font-bold"
                    >
                      Reintentar
                    </Button>
                  </div>
                )}

                {!isLoading && !isError && labels.length === 0 && (
                  <p className="text-sm text-tertiary text-center py-6">
                    Este proyecto todavía no tiene etiquetas.
                  </p>
                )}

                {!isLoading && !isError && labels.length > 0 && (
                  <ul className="space-y-2">
                    {labels.map((etiqueta) => (
                      <li
                        key={etiqueta.idEtiqueta}
                        className="flex items-center gap-2 bg-surface-container-low rounded-lg px-3 py-2"
                      >
                        <span
                          aria-hidden="true"
                          className="size-3 rounded-full shrink-0 border border-outline-variant/40"
                          style={{ backgroundColor: etiqueta.color }}
                        />
                        <span className="flex-1 text-sm text-on-surface truncate">
                          {etiqueta.nombreEtiqueta}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Editar etiqueta "${etiqueta.nombreEtiqueta}"`}
                          onClick={() => setFormTarget(etiqueta)}
                          className="text-tertiary hover:text-on-surface"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Eliminar etiqueta "${etiqueta.nombreEtiqueta}"`}
                          onClick={() => {
                            setDeleteError(null);
                            setLabelToDelete(etiqueta);
                          }}
                          className="text-tertiary hover:text-red-600"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={labelToDelete !== null}
        onOpenChange={(next) => {
          if (!next) {
            setLabelToDelete(null);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar etiqueta</AlertDialogTitle>
            <AlertDialogDescription>
              {labelToDelete
                ? `La etiqueta "${labelToDelete.nombreEtiqueta}" se eliminará y desaparecerá de las tareas asociadas. Las tareas no serán eliminadas.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">
              {deleteError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLabel.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteLabel.isPending}
              onClick={(e) => {
                e.preventDefault();
                handleConfirmDelete();
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleteLabel.isPending ? 'Eliminando...' : 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
