'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { useProjectRoles } from '@/hooks/use-project-roles';
import uvgSwal from '@/lib/swal';
import {
  createEvent,
  deleteEvent,
  updateEvent,
  type EventoProyectoDTO,
  type EventPayload,
  type ModalidadEvento,
} from '@/lib/services/events';

const EventLocationPicker = dynamic(() => import('./event-location-picker'), {
  ssr: false, // leaflet/react-leaflet usan `window`: no puede renderizarse en el servidor.
  loading: () => <div className="h-48 w-full animate-pulse rounded-md bg-surface-container" />,
});

export interface LedProjectOption {
  idProyecto: number;
  tituloProyecto: string;
}

const MODALIDAD_OPTIONS: { value: ModalidadEvento; label: string }[] = [
  { value: 'PRESENCIAL', label: 'Presencial' },
  { value: 'VIRTUAL', label: 'Virtual' },
  { value: 'MIXTA', label: 'Mixta' },
];

interface FormState {
  idProyecto: string;
  tituloEvento: string;
  descripcionEvento: string;
  fechaInicio: string; // valor nativo de <input type="datetime-local">
  fechaFin: string;
  antelacionMinutos: string;
  modalidad: ModalidadEvento;
  ubicacionLat: number | null;
  ubicacionLng: number | null;
  ubicacionNombre: string;
  linkSesion: string;
  rolesDestino: number[];
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
    modalidad: 'VIRTUAL',
    ubicacionLat: null,
    ubicacionLng: null,
    ubicacionNombre: '',
    linkSesion: '',
    rolesDestino: [],
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
    modalidad: evento.modalidad,
    ubicacionLat: evento.ubicacionLat,
    ubicacionLng: evento.ubicacionLng,
    ubicacionNombre: evento.ubicacionNombre ?? '',
    linkSesion: evento.linkSesion ?? '',
    rolesDestino: evento.rolesDestino,
  };
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function requiereUbicacion(modalidad: ModalidadEvento): boolean {
  return modalidad === 'PRESENCIAL' || modalidad === 'MIXTA';
}

function requiereLink(modalidad: ModalidadEvento): boolean {
  return modalidad === 'VIRTUAL' || modalidad === 'MIXTA';
}

/** Requisito 5: fin > inicio, e inicio no puede quedar en el pasado si se está fijando/moviendo ahora. */
function validarFechasYModalidad(
  values: FormState,
  isEditing: boolean,
  editingEvent: EventoProyectoDTO | null | undefined,
): string | null {
  const inicio = new Date(values.fechaInicio).getTime();
  const fin = new Date(values.fechaFin).getTime();
  if (Number.isNaN(inicio) || Number.isNaN(fin)) {
    return 'Selecciona una fecha y hora de inicio y fin válidas.';
  }
  if (fin <= inicio) {
    return 'La fecha y hora de fin debe ser posterior a la de inicio.';
  }
  const inicioSinCambios = isEditing && editingEvent && inicio === new Date(editingEvent.fechaInicio).getTime();
  if (!inicioSinCambios && inicio < Date.now()) {
    return 'La fecha y hora de inicio no puede ser anterior al momento actual.';
  }
  if (requiereUbicacion(values.modalidad) && (values.ubicacionLat === null || values.ubicacionLng === null)) {
    return 'Marca la ubicación de la sesión en el mapa.';
  }
  if (requiereLink(values.modalidad) && !isValidHttpUrl(values.linkSesion.trim())) {
    return 'Ingresa un link de sesión válido (debe empezar con http:// o https://).';
  }
  return null;
}

function buildPayload(values: FormState, { keepEmptyDescripcion }: { keepEmptyDescripcion: boolean }): EventPayload {
  const descripcion = values.descripcionEvento.trim();
  const mostrarUbicacion = requiereUbicacion(values.modalidad);
  const mostrarLink = requiereLink(values.modalidad);
  return {
    tituloEvento: values.tituloEvento.trim(),
    descripcionEvento: keepEmptyDescripcion ? descripcion : descripcion || undefined,
    fechaInicio: new Date(values.fechaInicio).toISOString(),
    fechaFin: new Date(values.fechaFin).toISOString(),
    antelacionMinutos: Number(values.antelacionMinutos) || 60,
    modalidad: values.modalidad,
    ubicacionLat: mostrarUbicacion && values.ubicacionLat !== null ? values.ubicacionLat : undefined,
    ubicacionLng: mostrarUbicacion && values.ubicacionLng !== null ? values.ubicacionLng : undefined,
    ubicacionNombre: mostrarUbicacion ? values.ubicacionNombre.trim() || undefined : undefined,
    linkSesion: mostrarLink ? values.linkSesion.trim() || undefined : undefined,
    rolesDestino: values.rolesDestino,
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

  // Requisito 3: roles del proyecto activo (el que se está creando/editando), para el multi-select.
  const idProyectoActivo = isEditing ? (editingEvent?.idProyecto ?? 0) : Number(values.idProyecto) || 0;
  const { roles } = useProjectRoles(idProyectoActivo, { enabled: open && idProyectoActivo > 0 });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['mis-eventos'] });
  };

  const crear = useMutation({
    mutationFn: (projectId: number) => createEvent(projectId, buildPayload(values, { keepEmptyDescripcion: false })),
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
      updateEvent(editingEvent!.idProyecto, editingEvent!.idEvento, buildPayload(values, { keepEmptyDescripcion: true })),
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

  const toggleRol = (idRolProyecto: number) => {
    setValues((c) => ({
      ...c,
      rolesDestino: c.rolesDestino.includes(idRolProyecto)
        ? c.rolesDestino.filter((id) => id !== idRolProyecto)
        : [...c.rolesDestino, idRolProyecto],
    }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (values.tituloEvento.trim().length === 0) {
      setError('El título no puede estar vacío.');
      return;
    }
    if (!isEditing && !Number(values.idProyecto)) {
      setError('Selecciona un proyecto.');
      return;
    }
    const mensajeFechas = validarFechasYModalidad(values, isEditing, editingEvent);
    if (mensajeFechas) {
      setError(mensajeFechas);
      return;
    }
    setError(null);

    if (isEditing) {
      editar.mutate();
      return;
    }
    crear.mutate(Number(values.idProyecto));
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="flex max-h-[90vh] w-[96vw] max-w-[520px] flex-col gap-0 overflow-hidden border-outline-variant bg-surface-container-lowest p-0">
        <form onSubmit={handleSubmit} className="flex max-h-[90vh] min-h-0 flex-col">
          <DialogHeader className="shrink-0 border-b border-outline-variant/35 px-6 pb-4 pt-5 text-left">
            <DialogTitle className="text-xl font-bold text-on-surface">
              {isEditing ? 'Editar evento' : 'Nuevo evento'}
            </DialogTitle>
            <DialogDescription className="text-sm text-on-surface-variant">
              Reuniones, entregas u otras actividades del proyecto con fecha y hora.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
            {!isEditing && (
              <div>
                <label htmlFor="evento-proyecto" className="text-xs font-semibold text-on-surface">
                  Proyecto
                </label>
                <Select
                  value={values.idProyecto}
                  onValueChange={(v) => setValues((c) => ({ ...c, idProyecto: v, rolesDestino: [] }))}
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

            {/* Requisito 1: el input de recordatorio comparte fila con Modalidad en vez de vivir solo (w-32 quedaba angosto). */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="evento-modalidad" className="text-xs font-semibold text-on-surface">
                  Modalidad de la sesión
                </label>
                <Select
                  value={values.modalidad}
                  onValueChange={(v) => setValues((c) => ({ ...c, modalidad: v as ModalidadEvento }))}
                  disabled={isPending}
                >
                  <SelectTrigger id="evento-modalidad" className="mt-1 h-10 w-full border-outline-variant">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODALIDAD_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                  className="mt-1 h-10 w-full rounded-md border-outline-variant text-sm"
                />
              </div>
            </div>
            <p className="-mt-2 type-meta">Por defecto, 60 minutos antes del inicio.</p>

            {requiereUbicacion(values.modalidad) && (
              <div>
                <label className="text-xs font-semibold text-on-surface">Ubicación de la sesión</label>
                <div className="mt-1">
                  <EventLocationPicker
                    lat={values.ubicacionLat}
                    lng={values.ubicacionLng}
                    nombre={values.ubicacionNombre}
                    onNombreChange={(v) => setValues((c) => ({ ...c, ubicacionNombre: v }))}
                    onPositionChange={(lat, lng) => setValues((c) => ({ ...c, ubicacionLat: lat, ubicacionLng: lng }))}
                    disabled={isPending}
                  />
                </div>
              </div>
            )}

            {requiereLink(values.modalidad) && (
              <div>
                <label htmlFor="evento-link" className="text-xs font-semibold text-on-surface">
                  Link de la sesión
                </label>
                <Input
                  id="evento-link"
                  type="url"
                  value={values.linkSesion}
                  disabled={isPending}
                  onChange={(e) => setValues((c) => ({ ...c, linkSesion: e.target.value }))}
                  placeholder="https://meet.google.com/..."
                  className="mt-1 h-10 rounded-md border-outline-variant text-sm"
                />
              </div>
            )}

            {roles.length > 0 && (
              <div>
                <label className="text-xs font-semibold text-on-surface">Para qué roles es la sesión</label>
                <p className="mt-1 type-meta">Vacío = visible para todos los participantes.</p>
                <div className="mt-2 max-h-32 space-y-1.5 overflow-y-auto rounded-md border border-outline-variant p-2">
                  {roles.map((rol) => (
                    <label key={rol.idRolProyecto} className="flex items-center gap-2 text-sm text-text-primary">
                      <Checkbox
                        checked={values.rolesDestino.includes(rol.idRolProyecto)}
                        disabled={isPending}
                        onCheckedChange={() => toggleRol(rol.idRolProyecto)}
                      />
                      {rol.nombreRol}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <p role="alert" className="text-xs text-status-error">
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-outline-variant/35 px-6 py-4 sm:justify-between">
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
