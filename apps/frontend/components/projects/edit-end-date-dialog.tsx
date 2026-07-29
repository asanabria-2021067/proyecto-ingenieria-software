'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { updateProject } from '@/lib/services/projects';
import { getApiErrorMessage } from '@/components/projects/api-error';

interface EditEndDateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  idProyecto: number;
  fechaActual: string | null;
}

/** YYYY-MM-DD del valor almacenado (ISO o date), para el input type=date. */
function aValorInput(fecha: string | null): string {
  if (!fecha) return '';
  return fecha.split('T')[0];
}

/**
 * Editar solo la fecha final estimada (Sección 15). Reutiliza el endpoint real
 * `updateProject` (PUT /proyectos/:id) — no un formulario paralelo. No permite
 * tocar la fecha de inicio. Invalida el detalle del proyecto tras el éxito e
 * impide el doble envío.
 */
export function EditEndDateDialog({ open, onOpenChange, idProyecto, fechaActual }: EditEndDateDialogProps) {
  const queryClient = useQueryClient();
  const [valor, setValor] = useState(aValorInput(fechaActual));
  const [error, setError] = useState<string | null>(null);

  // Al abrir, precarga la fecha actual real. El setState se difiere fuera del
  // cuerpo síncrono del efecto (regla react-hooks/set-state-in-effect), igual
  // que en TaskBoard.
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      setValor(aValorInput(fechaActual));
      setError(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [open, fechaActual]);

  const mutation = useMutation({
    mutationFn: (fechaFinEstimada: string) => updateProject(idProyecto, { fechaFinEstimada }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', idProyecto] });
      onOpenChange(false);
    },
    onError: (e) => setError(getApiErrorMessage(e, 'role')),
  });

  const handleGuardar = () => {
    if (!valor) {
      setError('Selecciona una fecha válida.');
      return;
    }
    setError(null);
    mutation.mutate(valor);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar fecha final estimada</DialogTitle>
          <DialogDescription>
            Actualiza la fecha estimada de finalización del proyecto. No modifica la fecha de inicio.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="fecha-fin-estimada">Fecha final estimada</Label>
          <Input
            id="fecha-fin-estimada"
            type="date"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
        </div>

        {error && (
          <p role="alert" className="text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleGuardar}
            disabled={mutation.isPending}
            className="gap-1.5 bg-primary text-on-primary hover:bg-primary/90"
          >
            {mutation.isPending && <Spinner className="size-3.5" />}
            Guardar fecha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
