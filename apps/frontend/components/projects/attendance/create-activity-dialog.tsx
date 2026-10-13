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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { toast } from 'sonner';
import type { useProjectAttendanceMutations } from '@/hooks/use-project-attendance';
import type { TipoActividad } from '@/lib/types/attendance';
import { TIPOS_ACTIVIDAD_OPCIONES } from './activity-type.utils';

type AttendanceMutations = ReturnType<typeof useProjectAttendanceMutations>;

export interface CreateActivityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  crearActividad: AttendanceMutations['crearActividad'];
}

interface FormState {
  tituloActividad: string;
  tipoActividad: TipoActividad;
  fechaActividad: string;
  horasValor: string;
}

const EMPTY_FORM: FormState = { tituloActividad: '', tipoActividad: 'REUNION', fechaActividad: '', horasValor: '' };

export function CreateActivityDialog({ open, onOpenChange, crearActividad }: CreateActivityDialogProps) {
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
    const tituloActividad = values.tituloActividad.trim();
    if (tituloActividad.length === 0) {
      setError('El título no puede estar vacío.');
      return;
    }
    if (!values.fechaActividad) {
      setError('La fecha es obligatoria.');
      return;
    }
    const horasValor = Number(values.horasValor);
    if (!Number.isFinite(horasValor) || horasValor <= 0) {
      setError('Las horas deben ser un número mayor a 0.');
      return;
    }
    setError(null);

    try {
      await crearActividad.mutateAsync({
        tituloActividad,
        tipoActividad: values.tipoActividad,
        fechaActividad: values.fechaActividad,
        horasValor,
      });
      toast.success('Actividad creada', { description: `"${tituloActividad}" se agregó al proyecto.` });
      handleOpenChange(false);
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, 'task'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[96vw] max-w-[480px] gap-0 border-outline-variant bg-surface-container-lowest p-0">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="border-b border-outline-variant/35 px-6 pb-4 pt-5 text-left">
            <DialogTitle className="text-xl font-bold text-on-surface">Nueva actividad</DialogTitle>
            <DialogDescription className="text-sm text-on-surface-variant">
              Registra una actividad del proyecto y su valor en horas de extensión.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-6 py-5">
            <div>
              <label htmlFor="actividad-titulo" className="text-xs font-semibold text-on-surface">
                Título
              </label>
              <Input
                id="actividad-titulo"
                value={values.tituloActividad}
                maxLength={200}
                disabled={crearActividad.isPending}
                onChange={(event) => setValues((current) => ({ ...current, tituloActividad: event.target.value }))}
                placeholder="Ej. Reunión de seguimiento semanal"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'actividad-error' : undefined}
                className="mt-1 h-10 rounded-md border-outline-variant text-sm"
              />
            </div>

            <div>
              <label htmlFor="actividad-tipo" className="text-xs font-semibold text-on-surface">
                Tipo
              </label>
              <Select
                value={values.tipoActividad}
                onValueChange={(value) =>
                  setValues((current) => ({ ...current, tipoActividad: value as TipoActividad }))
                }
                disabled={crearActividad.isPending}
              >
                <SelectTrigger id="actividad-tipo" className="mt-1 h-10 w-full rounded-md border-outline-variant text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_ACTIVIDAD_OPCIONES.map((tipo) => (
                    <SelectItem key={tipo.value} value={tipo.value}>
                      {tipo.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label htmlFor="actividad-fecha" className="text-xs font-semibold text-on-surface">
                Fecha
              </label>
              <Input
                id="actividad-fecha"
                type="date"
                value={values.fechaActividad}
                disabled={crearActividad.isPending}
                onChange={(event) => setValues((current) => ({ ...current, fechaActividad: event.target.value }))}
                className="mt-1 h-10 rounded-md border-outline-variant text-sm"
              />
            </div>

            <div>
              <label htmlFor="actividad-horas" className="text-xs font-semibold text-on-surface">
                Horas que vale
              </label>
              <Input
                id="actividad-horas"
                type="number"
                step="0.01"
                value={values.horasValor}
                disabled={crearActividad.isPending}
                onChange={(event) => setValues((current) => ({ ...current, horasValor: event.target.value }))}
                placeholder="Ej. 1.5"
                className="mt-1 h-10 rounded-md border-outline-variant text-sm"
              />
            </div>

            {error && (
              <p id="actividad-error" role="alert" className="text-xs text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 border-t border-outline-variant/35 px-6 py-4 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={crearActividad.isPending}
              onClick={() => handleOpenChange(false)}
              className="h-10 rounded-md border-outline-variant text-xs font-bold"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={crearActividad.isPending}
              className="h-10 gap-1.5 rounded-md bg-primary text-xs font-bold text-on-primary hover:bg-primary/90"
            >
              {crearActividad.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
              {crearActividad.isPending ? 'Creando...' : 'Crear actividad'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
