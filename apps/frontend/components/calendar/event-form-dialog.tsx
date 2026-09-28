'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Trash2 } from 'lucide-react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getApiErrorMessage } from '@/components/projects/api-error';
import uvgSwal from '@/lib/swal';
import {
  createEvent,
  deleteEvent,
  updateEvent,
  type EventoProyectoDTO,
} from '@/lib/services/events';

export interface LedProjectOption {
  idProyecto: number;
  tituloProyecto: string;
}

interface FormState {
  idProyecto: string;
  tituloEvento: string;
  descripcionEvento: string;
  fechaInicio: string; // valor nativo de <input type="datetime-local">
  fechaFin: string;
  antelacionMinutos: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Fecha -> valor de <input type="datetime-local"> en hora LOCAL (no UTC). */
function toDatetimeLocalValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function emptyForm(defaultProjectId?: number, initialDate?: Date): FormState {
  const base = initialDate ? new Date(initialDate) : new Date();
  base.setMinutes(0, 0, 0);
  base.setHours(base.getHours() + 1);
  const fin = new Date(base);
  fin.setHours(fin.getHours() + 1);
  return {
    idProyecto: defaultProjectId ? String(defaultProjectId) : '',
    tituloEvento: '',
    descripcionEvento: '',
    fechaInicio: toDatetimeLocalValue(base),
    fechaFin: toDatetimeLocalValue(fin),
    antelacionMinutos: '60',
  };
}

function formFromEvent(evento: EventoProyectoDTO): FormState {
  return {
    idProyecto: String(evento.idProyecto),
    tituloEvento: evento.tituloEvento,
    descripcionEvento: evento.descripcionEvento ?? '',
    fechaInicio: toDatetimeLocalValue(new Date(evento.fechaInicio)),
    fechaFin: toDatetimeLocalValue(new Date(evento.fechaFin)),
    antelacionMinutos: String(evento.antelacionMinutos),
  };
}

/**
 * HU-169 (T-263/T-264): crear o editar un evento de calendario. Solo
 * accesible al líder de un proyecto (la lista `ledProjects` ya viene
 * filtrada por el caller a GET /proyectos/mine). Fecha/hora usa el input
 * nativo `datetime-local` (sin librería de date-picker).
 */
export function EventFormDialog({
  open,
  onOpenChange,
  ledProjects,
  editingEvent,
  defaultProjectId,
  initialDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ledProjects: LedProjectOption[];
  /** Presente = modo edición sobre este evento; ausente = modo creación. */
  editingEvent?: EventoProyectoDTO | null;
  defaultProjectId?: number;
  initialDate?: Date;
}) {
  const isEditing = Boolean(editingEvent);
  const [values, setValues] = useState<FormState>(() => emptyForm(defaultProjectId, initialDate));
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!open) return;
    setError(null);
    setValues(editingEvent ? formFromEvent(editingEvent) : emptyForm(defaultProjectId, initialDate));
    // Solo al abrir: no queremos pisar lo que el usuario está escribiendo en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingEvent?.idEvento]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['mis-eventos'] });
  };

  const crear = useMutation({
    mutationFn: (projectId: number) =>
      createEvent(projectId, {
        tituloEvento: values.tituloEvento.trim(),
        descripcionEvento: values.descripcionEvento.trim() || undefined,
        fechaInicio: new Date(values.fechaInicio).toISOString(),
        fechaFin: new Date(values.fechaFin).toISOString(),
        antelacionMinutos: Number(values.antelacionMinutos) || 60,
      }),
    onSuccess: () => {
      invalidate();
      void uvgSwal.fire({
        toast: true,
        backdrop: false,
        icon: 'success',
        title: 'Evento creado',
        position: 'top-end',
        timer: 2000,
        timerProgressBar: true,
        showConfirmButton: false,
      });
      onOpenChange(false);
    },
    onError: (err) => setError(getApiErrorMessage(err, 'calendar')),
  });

  const editar = useMutation({
    mutationFn: () =>
      updateEvent(editingEvent!.idProyecto, editingEvent!.idEvento, {
        tituloEvento: values.tituloEvento.trim(),
        descripcionEvento: values.descripcionEvento.trim(),
        fechaInicio: new Date(values.fechaInicio).toISOString(),
        fechaFin: new Date(values.fechaFin).toISOString(),
        antelacionMinutos: Number(values.antelacionMinutos) || 60,
      }),
    onSuccess: () => {
      invalidate();
      onOpenChange(false);
    },
    onError: (err) => setError(getApiErrorMessage(err, 'calendar')),
  });

  const cancelar = useMutation({
    mutationFn: () => deleteEvent(editingEvent!.idProyecto, editingEvent!.idEvento),
    onSuccess: () => {
      invalidate();
      onOpenChange(false);
    },
    onError: (err) => setError(getApiErrorMessage(err, 'calendar')),
  });

  const isPending = crear.isPending || editar.isPending || cancelar.isPending;

  const confirmarCancelacion = async () => {
    const { isConfirmed } = await uvgSwal.fire({
      icon: 'warning',
      title: '¿Cancelar este evento?',
      text: 'Se eliminará del calendario del proyecto. Esta acción no se puede deshacer.',
      showCancelButton: true,
      confirmButtonText: 'Sí, cancelar',
      cancelButtonText: 'Volver',
    });
    if (!isConfirmed) return;
    cancelar.mutate();
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (values.tituloEvento.trim().length === 0) {
      setError('El título no puede estar vacío.');
      return;
    }
    setError(null);

    if (isEditing) {
      editar.mutate();
      return;
    }
    const projectId = Number(values.idProyecto);
    if (!projectId) {
      setError('Selecciona un proyecto.');
      return;
    }
    crear.mutate(projectId);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="w-[96vw] max-w-[480px] gap-0 border-outline-variant bg-surface-container-lowest p-0">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="border-b border-outline-variant/35 px-6 pb-4 pt-5 text-left">
            <DialogTitle className="text-xl font-bold text-on-surface">
              {isEditing ? 'Editar evento' : 'Nuevo evento'}
            </DialogTitle>
            <DialogDescription className="text-sm text-on-surface-variant">
              Reuniones, entregas u otras actividades del proyecto con fecha y hora.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-6 py-5">
            {!isEditing && (
              <div>
                <label htmlFor="evento-proyecto" className="text-xs font-semibold text-on-surface">
                  Proyecto
                </label>
                <Select
                  value={values.idProyecto}
                  onValueChange={(v) => setValues((c) => ({ ...c, idProyecto: v }))}
                  disabled={isPending}
                >
                  <SelectTrigger id="evento-proyecto" className="mt-1 h-10 w-full border-outline-variant">
                    <SelectValue placeholder="Selecciona un proyecto que lideras" />
                  </SelectTrigger>
                  <SelectContent>
                    {ledProjects.map((p) => (
                      <SelectItem key={p.idProyecto} value={String(p.idProyecto)}>
                        {p.tituloProyecto}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <label htmlFor="evento-titulo" className="text-xs font-semibold text-on-surface">
                Título
              </label>
              <Input
                id="evento-titulo"
                value={values.tituloEvento}
                maxLength={200}
                disabled={isPending}
                onChange={(e) => setValues((c) => ({ ...c, tituloEvento: e.target.value }))}
                placeholder="Ej. Reunión de avance"
                className="mt-1 h-10 rounded-md border-outline-variant text-sm"
              />
            </div>

            <div>
              <label htmlFor="evento-descripcion" className="text-xs font-semibold text-on-surface">
                Descripción (opcional)
              </label>
              <Textarea
                id="evento-descripcion"
                value={values.descripcionEvento}
                disabled={isPending}
                onChange={(e) => setValues((c) => ({ ...c, descripcionEvento: e.target.value }))}
                placeholder="Detalles del evento"
                className="mt-1 rounded-md border-outline-variant text-sm"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="evento-inicio" className="text-xs font-semibold text-on-surface">
                  Inicio
                </label>
                <Input
                  id="evento-inicio"
                  type="datetime-local"
                  value={values.fechaInicio}
                  disabled={isPending}
                  onChange={(e) => setValues((c) => ({ ...c, fechaInicio: e.target.value }))}
                  className="mt-1 h-10 rounded-md border-outline-variant text-sm"
                />
              </div>
              <div>
                <label htmlFor="evento-fin" className="text-xs font-semibold text-on-surface">
                  Fin
                </label>
                <Input
                  id="evento-fin"
                  type="datetime-local"
                  value={values.fechaFin}
                  disabled={isPending}
                  onChange={(e) => setValues((c) => ({ ...c, fechaFin: e.target.value }))}
                  className="mt-1 h-10 rounded-md border-outline-variant text-sm"
                />
              </div>
            </div>

            <div>
              <label htmlFor="evento-antelacion" className="text-xs font-semibold text-on-surface">
                Recordatorio (minutos antes)
              </label>
              <Input
                id="evento-antelacion"
                type="number"
                min={0}
                max={10080}
                value={values.antelacionMinutos}
                disabled={isPending}
                onChange={(e) => setValues((c) => ({ ...c, antelacionMinutos: e.target.value }))}
                className="mt-1 h-10 w-32 rounded-md border-outline-variant text-sm"
              />
              <p className="mt-1 text-xs text-on-surface-variant">Por defecto, 60 minutos antes del inicio.</p>
            </div>

            {error && (
              <p role="alert" className="text-xs text-status-error">
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 border-t border-outline-variant/35 px-6 py-4 sm:justify-between">
            {isEditing ? (
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => void confirmarCancelacion()}
                className="h-10 gap-1.5 rounded-md border-outline-variant text-xs font-bold text-status-error"
              >
                {cancelar.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="size-3.5" aria-hidden="true" />
                )}
                Cancelar evento
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => onOpenChange(false)}
                className="h-10 rounded-md border-outline-variant text-xs font-bold"
              >
                Cerrar
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className="h-10 gap-1.5 rounded-md bg-primary text-xs font-bold text-on-primary hover:bg-primary/90"
              >
                {(crear.isPending || editar.isPending) && (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                )}
                {isEditing ? 'Guardar cambios' : 'Crear evento'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
