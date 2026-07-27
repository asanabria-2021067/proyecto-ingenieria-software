'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown, Info, Loader2, Pencil, Trash2, X } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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
import { Skeleton } from '@/components/ui/skeleton';
import { getApiErrorMessage } from '@/components/projects/api-error';
import type { useProjectLabels } from '@/hooks/use-project-labels';
import type { LabelDTO } from '@/lib/services/labels';
import { cn } from '@/lib/utils';

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

interface LabelFormState {
  nombreEtiqueta: string;
  color: string;
}

const DEFAULT_LABEL_COLOR = '#006735';
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

const LABEL_COLOR_OPTIONS = [
  { name: 'Verde UVG', value: '#006735' },
  { name: 'Azul', value: '#2680C2' },
  { name: 'Rojo', value: '#E5484D' },
  { name: 'Naranja', value: '#F97316' },
  { name: 'Amarillo', value: '#D9A400' },
  { name: 'Violeta', value: '#8B7CE8' },
  { name: 'Turquesa', value: '#0F9F9A' },
  { name: 'Gris', value: '#64748B' },
  { name: 'Lima', value: '#8BC34A' },
  { name: 'Rosa', value: '#D946A6' },
] as const;

function normalizeHex(value: string): string {
  const raw = value.trim();
  const withHash = raw.startsWith('#') ? raw : `#${raw}`;
  return withHash.toUpperCase();
}

function validateLabel(values: LabelFormState): string | null {
  if (values.nombreEtiqueta.trim().length === 0) return 'El nombre no puede estar vacío.';
  if (values.nombreEtiqueta.trim().length > 255) return 'El nombre no puede exceder 255 caracteres.';
  if (!HEX_COLOR.test(values.color)) return 'El color debe tener el formato #RRGGBB.';
  return null;
}

function ColorDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block size-3 shrink-0 rounded-full border border-outline-variant/50', className)}
      style={{ backgroundColor: HEX_COLOR.test(color) ? color : DEFAULT_LABEL_COLOR }}
    />
  );
}

function LabelColorPicker({
  value,
  onChange,
  disabled = false,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  const selected = HEX_COLOR.test(value) ? value.toUpperCase() : DEFAULT_LABEL_COLOR;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel}
          className="h-10 min-w-[86px] justify-between rounded-md border-outline-variant bg-surface-container-lowest px-2.5 text-xs"
        >
          <span className="inline-flex items-center gap-2">
            <ColorDot color={selected} className="size-4" />
            <span className="sr-only">Color seleccionado</span>
          </span>
          <ChevronDown className="size-3.5 text-tertiary" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 rounded-lg border-outline-variant bg-surface-container-lowest p-3">
        <div className="grid grid-cols-5 gap-2" aria-label="Paleta de colores de etiqueta">
          {LABEL_COLOR_OPTIONS.map((option) => {
            const isSelected = selected === option.value.toUpperCase();
            return (
              <button
                key={option.value}
                type="button"
                disabled={disabled}
                aria-label={`Seleccionar color ${option.name}`}
                onClick={() => onChange(option.value)}
                className={cn(
                  'inline-flex size-10 items-center justify-center rounded-md border border-outline-variant/50 transition-colors hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35',
                  isSelected && 'border-primary bg-primary/10',
                )}
              >
                <span
                  className="inline-flex size-6 items-center justify-center rounded-full border border-black/10"
                  style={{ backgroundColor: option.value }}
                >
                  {isSelected && <Check className="size-3.5 text-white drop-shadow" aria-hidden="true" />}
                </span>
              </button>
            );
          })}
        </div>
        <label className="mt-3 block text-xs font-semibold text-on-surface" htmlFor="label-color-hex">
          Color personalizado
        </label>
        <div className="mt-1.5 flex items-center gap-2">
          <ColorDot color={selected} className="size-5" />
          <Input
            id="label-color-hex"
            value={value}
            disabled={disabled}
            onChange={(event) => onChange(normalizeHex(event.target.value))}
            maxLength={7}
            aria-label="Valor hexadecimal del color"
            placeholder="#RRGGBB"
            className="h-9 font-mono text-xs"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CreateLabelForm({
  disabled,
  isPending,
  error,
  onSubmit,
}: {
  disabled: boolean;
  isPending: boolean;
  error: string | null;
  onSubmit: (values: LabelFormState) => Promise<boolean>;
}) {
  const [values, setValues] = useState<LabelFormState>({
    nombreEtiqueta: '',
    color: DEFAULT_LABEL_COLOR,
  });
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextValues = {
      nombreEtiqueta: values.nombreEtiqueta.trim(),
      color: normalizeHex(values.color),
    };
    const validationError = validateLabel(nextValues);
    setLocalError(validationError);
    if (validationError) return;
    const created = await onSubmit(nextValues);
    if (created) {
      setValues({ nombreEtiqueta: '', color: DEFAULT_LABEL_COLOR });
      setLocalError(null);
    }
  };

  const errorMessage = localError ?? error;

  return (
    <section className="rounded-[10px] border border-outline-variant/45 bg-surface-container-lowest p-4 shadow-sm">
      <h3 className="text-sm font-bold text-on-surface">Nueva etiqueta</h3>
      <form onSubmit={handleSubmit} className="mt-3 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_92px]">
          <div>
            <label htmlFor="new-label-name" className="text-xs font-semibold text-on-surface">
              Nombre de la etiqueta
            </label>
            <Input
              id="new-label-name"
              value={values.nombreEtiqueta}
              disabled={disabled || isPending}
              maxLength={255}
              onChange={(event) => setValues((current) => ({ ...current, nombreEtiqueta: event.target.value }))}
              placeholder="Ej. Frontend"
              aria-invalid={errorMessage ? true : undefined}
              aria-describedby={errorMessage ? 'new-label-error' : undefined}
              className="mt-1 h-10 rounded-md border-outline-variant text-sm"
            />
          </div>
          <div>
            <span className="block text-xs font-semibold text-on-surface">Color</span>
            <div className="mt-1">
              <LabelColorPicker
                value={values.color}
                disabled={disabled || isPending}
                onChange={(color) => setValues((current) => ({ ...current, color }))}
                ariaLabel="Seleccionar color para nueva etiqueta"
              />
            </div>
          </div>
        </div>

        {errorMessage && (
          <p id="new-label-error" role="alert" className="text-xs text-red-600 dark:text-red-400">
            {errorMessage}
          </p>
        )}

        <Button
          type="submit"
          disabled={disabled || isPending}
          className="h-9 rounded-md bg-primary px-3 text-xs font-bold text-on-primary hover:bg-primary/90 max-sm:w-full"
        >
          {isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
          {isPending ? 'Agregando...' : 'Agregar etiqueta'}
        </Button>
      </form>
    </section>
  );
}

function EditLabelRow({
  label,
  isPending,
  error,
  onSave,
  onCancel,
}: {
  label: LabelDTO;
  isPending: boolean;
  error: string | null;
  onSave: (label: LabelDTO, values: LabelFormState) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<LabelFormState>({
    nombreEtiqueta: label.nombreEtiqueta,
    color: label.color,
  });
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextValues = {
      nombreEtiqueta: values.nombreEtiqueta.trim(),
      color: normalizeHex(values.color),
    };
    const validationError = validateLabel(nextValues);
    setLocalError(validationError);
    if (validationError) return;
    onSave(label, nextValues);
  };

  const errorMessage = localError ?? error;

  return (
    <li className="border-b border-outline-variant/35 last:border-b-0 bg-surface-container-low/60 px-3 py-3">
      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] items-center gap-2 max-sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
          <ColorDot color={values.color} />
          <Input
            value={values.nombreEtiqueta}
            disabled={isPending}
            maxLength={255}
            onChange={(event) => setValues((current) => ({ ...current, nombreEtiqueta: event.target.value }))}
            aria-label={`Nombre de la etiqueta ${label.nombreEtiqueta}`}
            aria-invalid={errorMessage ? true : undefined}
            className="h-10 rounded-md border-outline-variant bg-surface-container-lowest text-sm"
          />
          <div className="max-sm:col-start-2">
            <LabelColorPicker
              value={values.color}
              disabled={isPending}
              onChange={(color) => setValues((current) => ({ ...current, color }))}
              ariaLabel={`Seleccionar color para la etiqueta ${label.nombreEtiqueta}`}
            />
          </div>
          <Button
            type="submit"
            size="icon-lg"
            disabled={isPending}
            aria-label={`Guardar cambios de la etiqueta ${label.nombreEtiqueta}`}
            className="rounded-md bg-primary text-on-primary hover:bg-primary/90"
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          </Button>
          <Button
            type="button"
            size="icon-lg"
            variant="ghost"
            disabled={isPending}
            aria-label={`Cancelar edición de la etiqueta ${label.nombreEtiqueta}`}
            onClick={onCancel}
            className="rounded-md text-tertiary hover:bg-surface-container-high hover:text-on-surface"
          >
            <X className="size-4" />
          </Button>
        </div>
        {errorMessage && (
          <p role="alert" className="pl-5 text-xs text-red-600 dark:text-red-400">
            {errorMessage}
          </p>
        )}
      </form>
    </li>
  );
}

function ProjectLabelRow({
  label,
  onEdit,
  onDelete,
  disabled,
}: {
  label: LabelDTO;
  onEdit: (label: LabelDTO) => void;
  onDelete: (label: LabelDTO) => void;
  disabled: boolean;
}) {
  return (
    <li className="flex min-h-14 items-center gap-3 border-b border-outline-variant/35 px-3 py-2 transition-colors last:border-b-0 hover:bg-surface-container-low">
      <ColorDot color={label.color} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-on-surface" title={label.nombreEtiqueta}>
        {label.nombreEtiqueta}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-lg"
        disabled={disabled}
        aria-label={`Editar etiqueta ${label.nombreEtiqueta}`}
        onClick={() => onEdit(label)}
        className="rounded-md text-tertiary hover:bg-primary/10 hover:text-primary"
      >
        <Pencil className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-lg"
        disabled={disabled}
        aria-label={`Eliminar etiqueta ${label.nombreEtiqueta}`}
        onClick={() => onDelete(label)}
        className="rounded-md text-tertiary hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
      >
        <Trash2 className="size-4" />
      </Button>
    </li>
  );
}

function LabelsListSkeleton() {
  return (
    <div className="divide-y divide-outline-variant/30">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="flex min-h-14 items-center gap-3 px-3 py-2">
          <Skeleton data-testid="label-row-skeleton" className="size-3 rounded-full" />
          <Skeleton data-testid="label-row-skeleton" className="h-4 flex-1 rounded-md" />
          <Skeleton data-testid="label-row-skeleton" className="size-9 rounded-md" />
          <Skeleton data-testid="label-row-skeleton" className="size-9 rounded-md" />
        </div>
      ))}
    </div>
  );
}

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
  const [createError, setCreateError] = useState<string | null>(null);
  const [editingLabelId, setEditingLabelId] = useState<number | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [labelToDelete, setLabelToDelete] = useState<LabelDTO | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const editingLabel = useMemo(
    () => labels.find((label) => label.idEtiqueta === editingLabelId) ?? null,
    [editingLabelId, labels],
  );

  const resetTransientState = () => {
    setCreateError(null);
    setEditError(null);
    setEditingLabelId(null);
    setLabelToDelete(null);
    setDeleteError(null);
  };

  const handleCreateLabel = async (values: LabelFormState) => {
    setCreateError(null);
    try {
      await createLabel.mutateAsync(values);
      return true;
    } catch (error) {
      setCreateError(getApiErrorMessage(error, 'label'));
      return false;
    }
  };

  const handleSaveEdit = async (label: LabelDTO, values: LabelFormState) => {
    setEditError(null);
    try {
      await updateLabel.mutateAsync({ labelId: label.idEtiqueta, input: values });
      setEditingLabelId(null);
    } catch (error) {
      setEditError(getApiErrorMessage(error, 'label'));
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
          if (!next) resetTransientState();
          onOpenChange(next);
        }}
      >
        <SheetContent
          side="right"
          className="w-[96vw] max-w-[480px] gap-0 border-outline-variant bg-surface-container-lowest p-0 shadow-lg sm:w-[75vw] sm:max-w-[480px] md:w-[62vw] lg:w-[480px]"
        >
          <SheetHeader className="sticky top-0 z-10 border-b border-outline-variant/35 bg-surface-container-lowest px-5 pb-4 pt-5 sm:px-6">
            <SheetTitle className="pr-10 text-xl font-bold text-on-surface">
              Etiquetas del proyecto
            </SheetTitle>
            <SheetDescription className="max-w-[360px] text-sm leading-5 text-on-surface-variant">
              Organiza y clasifica las tareas del proyecto mediante etiquetas.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
            <CreateLabelForm
              disabled={isLoading || isError}
              isPending={createLabel.isPending}
              error={createError}
              onSubmit={handleCreateLabel}
            />

            <section className="overflow-hidden rounded-[10px] border border-outline-variant/45 bg-surface-container-lowest shadow-sm">
              <div className="border-b border-outline-variant/35 px-4 py-3">
                <h3 className="text-sm font-bold text-on-surface">Etiquetas existentes</h3>
              </div>

              {isLoading && <LabelsListSkeleton />}

              {!isLoading && isError && (
                <div className="px-4 py-7 text-center">
                  <p className="text-sm font-medium text-red-600 dark:text-red-400">
                    No fue posible cargar las etiquetas del proyecto.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onRetry}
                    className="mt-3 rounded-md border-primary text-xs font-bold text-primary hover:bg-primary/10"
                  >
                    Reintentar
                  </Button>
                </div>
              )}

              {!isLoading && !isError && labels.length === 0 && (
                <div className="px-4 py-7 text-center">
                  <h4 className="text-sm font-bold text-on-surface">Aún no hay etiquetas</h4>
                  <p className="mx-auto mt-1 max-w-[320px] text-xs leading-5 text-on-surface-variant">
                    Crea la primera etiqueta para comenzar a clasificar las tareas del proyecto.
                  </p>
                </div>
              )}

              {!isLoading && !isError && labels.length > 0 && (
                <ul>
                  {labels.map((label) => (
                    editingLabel?.idEtiqueta === label.idEtiqueta ? (
                      <EditLabelRow
                        key={label.idEtiqueta}
                        label={label}
                        isPending={updateLabel.isPending}
                        error={editError}
                        onSave={handleSaveEdit}
                        onCancel={() => {
                          setEditingLabelId(null);
                          setEditError(null);
                        }}
                      />
                    ) : (
                      <ProjectLabelRow
                        key={label.idEtiqueta}
                        label={label}
                        disabled={updateLabel.isPending || deleteLabel.isPending}
                        onEdit={(nextLabel) => {
                          setEditingLabelId(nextLabel.idEtiqueta);
                          setEditError(null);
                        }}
                        onDelete={(nextLabel) => {
                          setDeleteError(null);
                          setLabelToDelete(nextLabel);
                        }}
                      />
                    )
                  ))}
                </ul>
              )}
            </section>

            <div className="flex gap-2 rounded-lg border border-outline-variant/50 bg-surface-container-low px-3 py-3 text-xs leading-5 text-on-surface-variant">
              <Info className="mt-0.5 size-4 shrink-0 text-tertiary" aria-hidden="true" />
              <p>
                Puedes crear, editar o eliminar las etiquetas del proyecto. Los cambios se reflejarán en las tareas asociadas.
              </p>
            </div>
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
            <AlertDialogTitle>
              {labelToDelete ? `¿Eliminar la etiqueta "${labelToDelete.nombreEtiqueta}"?` : 'Eliminar etiqueta'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              La etiqueta dejará de estar disponible en el proyecto y desaparecerá de las tareas asociadas. Las tareas no serán eliminadas.
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
              onClick={(event) => {
                event.preventDefault();
                handleConfirmDelete();
              }}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {deleteLabel.isPending && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />}
              {deleteLabel.isPending ? 'Eliminando...' : 'Eliminar etiqueta'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
