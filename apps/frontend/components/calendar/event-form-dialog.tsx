'use client';

import { useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { useCancelEvent } from '@/hooks/use-cancel-event';
import { useProjectRoles } from '@/hooks/use-project-roles';
import { aviso } from '@/lib/mensajes';
import { createEvent, updateEvent, type EventoProyectoDTO, type ModalidadEvento } from '@/lib/services/events';
import { DatePicker } from './date-picker';
import {
  MODALIDAD_OPTIONS,
  RECORDATORIO_OPTIONS,
  buildEventFormSchema,
  buildEventPayload,
  emptyEventForm,
  eventFormFromEvento,
  requiereLink,
  requiereUbicacion,
  type EventFormValues,
} from './event-form.schema';

const EventLocationPicker = dynamic(() => import('./event-location-picker'), {
  ssr: false, // leaflet/react-leaflet usan `window`: no puede renderizarse en el servidor.
  loading: () => <div className="h-48 w-full animate-pulse rounded-md bg-surface-container" />,
});

export interface LedProjectOption {
  idProyecto: number;
  tituloProyecto: string;
}

/**
 * Un evento creado antes de HU-184 pudo guardar cualquier número de minutos:
 * si no coincide con una opción fija, se agrega como opción propia para no
 * cambiarlo sin que el usuario lo note.
 */
function opcionesRecordatorio(actual: number) {
  if (RECORDATORIO_OPTIONS.some((opt) => opt.value === actual)) return RECORDATORIO_OPTIONS;
  return [...RECORDATORIO_OPTIONS, { value: actual, label: `${actual} minutos antes` }].sort((a, b) => a.value - b.value);
}

function hoyInicioDelDia(): Date {
  const hoy = new Date();
  return new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
}

/**
 * HU-169 (T-263/T-264), rediseñado en HU-184 (T-323): crear o editar un
 * evento de calendario. Solo accesible al líder de un proyecto (la lista
 * `ledProjects` ya viene filtrada por el caller a GET /proyectos/mine).
 * Campos en el orden en que se piensa un evento: qué, cuándo, cómo/dónde,
 * para quién y cuándo avisar. Valida con `buildEventFormSchema` antes de
 * enviar, con el mensaje debajo de cada campo.
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
  const queryClient = useQueryClient();

  const schema = useMemo(
    () =>
      buildEventFormSchema({
        mode: isEditing ? 'edit' : 'create',
        fechaInicioOriginal: editingEvent?.fechaInicio ?? null,
      }),
    // `ahora` se recalcula al abrir: un diálogo abierto mucho rato no debe
    // quedarse con la hora en que se montó.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isEditing, editingEvent?.fechaInicio, open],
  );

  const form = useForm<EventFormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyEventForm(defaultProjectId, initialDate),
  });

  useEffect(() => {
    if (!open) return;
    form.reset(editingEvent ? eventFormFromEvento(editingEvent) : emptyEventForm(defaultProjectId, initialDate));
    // Solo al abrir: no queremos pisar lo que el usuario está escribiendo en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingEvent?.idEvento]);

  const modalidad = form.watch('modalidad');
  const idProyectoForm = form.watch('idProyecto');
  const fechaInicio = form.watch('fechaInicio');

  // Roles del proyecto activo (el que se está creando/editando), para el multi-select.
  const idProyectoActivo = isEditing ? (editingEvent?.idProyecto ?? 0) : Number(idProyectoForm) || 0;
  const { roles } = useProjectRoles(idProyectoActivo, { enabled: open && idProyectoActivo > 0 });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['mis-eventos'] });
  };

  const crear = useMutation({
    mutationFn: (values: EventFormValues) =>
      createEvent(Number(values.idProyecto), buildEventPayload(values, { keepEmptyDescripcion: false })),
    onSuccess: () => {
      invalidate();
      aviso.exito('Evento creado');
      onOpenChange(false);
    },
    onError: (err) => aviso.error('No se pudo crear el evento', getApiErrorMessage(err, 'calendar')),
  });

  const editar = useMutation({
    mutationFn: (values: EventFormValues) =>
      updateEvent(editingEvent!.idProyecto, editingEvent!.idEvento, buildEventPayload(values, { keepEmptyDescripcion: true })),
    onSuccess: () => {
      invalidate();
      aviso.exito('Evento actualizado');
      onOpenChange(false);
    },
    onError: (err) => aviso.error('No se pudo guardar el evento', getApiErrorMessage(err, 'calendar')),
  });

  const { cancelarEvento, isPending: isCancelling } = useCancelEvent();

  const isPending = crear.isPending || editar.isPending || isCancelling;

  const confirmarCancelacion = async () => {
    if (!editingEvent) return;
    if (await cancelarEvento(editingEvent)) onOpenChange(false);
  };

  // Con el formulario largo (sobre todo en móvil) el campo con error puede
  // quedar fuera de vista: el aviso dice que hay algo que corregir.
  const onInvalid = () => {
    aviso.advertencia('Revisa los campos marcados', 'Hay datos del evento que faltan o no son válidos.');
  };

  const onSubmit = (values: EventFormValues) => {
    if (isEditing) {
      editar.mutate(values);
      return;
    }
    crear.mutate(values);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="flex max-h-[90dvh] w-full max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden border-outline-variant bg-surface-container-lowest p-0 sm:max-w-[720px]">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} noValidate className="flex max-h-[90dvh] min-h-0 flex-col">
            <DialogHeader className="shrink-0 border-b border-outline-variant/35 px-4 pb-4 pt-5 pr-12 text-left sm:px-6">
              <DialogTitle className="text-xl font-bold text-on-surface">
                {isEditing ? 'Editar evento' : 'Nuevo evento'}
              </DialogTitle>
              <DialogDescription className="text-sm text-on-surface-variant">
                Reuniones, entregas u otras actividades del proyecto con fecha y hora.
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
              {!isEditing && (
                <FormField
                  control={form.control}
                  name="idProyecto"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Proyecto</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(v) => {
                          field.onChange(v);
                          form.setValue('rolesDestino', []);
                        }}
                        disabled={isPending}
                      >
                        <FormControl>
                          <SelectTrigger className="h-10 w-full border-outline-variant">
                            <SelectValue placeholder="Selecciona un proyecto que lideras" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {ledProjects.map((p) => (
                            <SelectItem key={p.idProyecto} value={String(p.idProyecto)}>
                              {p.tituloProyecto}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="tituloEvento"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Título</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        maxLength={200}
                        disabled={isPending}
                        placeholder="Ej. Reunión de avance"
                        className="h-10 rounded-md border-outline-variant text-sm"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="descripcionEvento"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción (opcional)</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={2}
                        maxLength={5000}
                        disabled={isPending}
                        placeholder="Detalles del evento"
                        className="rounded-md border-outline-variant text-sm"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <fieldset className="min-w-0 space-y-2">
                  <legend className="text-sm font-medium text-on-surface">Inicio</legend>
                  <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
                    <FormField
                      control={form.control}
                      name="fechaInicio"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="sr-only">Fecha de inicio</FormLabel>
                          <FormControl>
                            <DatePicker
                              value={field.value}
                              onChange={(date) => {
                                field.onChange(date);
                                // El fin nunca debe quedar en un día anterior al nuevo inicio.
                                const fechaFin = form.getValues('fechaFin');
                                if (date && fechaFin && fechaFin < date) form.setValue('fechaFin', date);
                              }}
                              disabledBefore={isEditing ? undefined : hoyInicioDelDia()}
                              disabled={isPending}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="horaInicio"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="sr-only">Hora de inicio</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="time"
                              step={300}
                              disabled={isPending}
                              className="h-10 rounded-md border-outline-variant text-sm"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </fieldset>
  
                <fieldset className="min-w-0 space-y-2">
                  <legend className="text-sm font-medium text-on-surface">Fin</legend>
                  <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
                    <FormField
                      control={form.control}
                      name="fechaFin"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="sr-only">Fecha de fin</FormLabel>
                          <FormControl>
                            <DatePicker
                              value={field.value}
                              onChange={field.onChange}
                              disabledBefore={fechaInicio}
                              disabled={isPending}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="horaFin"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="sr-only">Hora de fin</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="time"
                              step={300}
                              disabled={isPending}
                              className="h-10 rounded-md border-outline-variant text-sm"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </fieldset>
              </div>

              <FormField
                control={form.control}
                name="modalidad"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Modalidad de la sesión</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(v) => field.onChange(v as ModalidadEvento)}
                      disabled={isPending}
                    >
                      <FormControl>
                        <SelectTrigger className="h-10 w-full border-outline-variant">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {MODALIDAD_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {requiereUbicacion(modalidad) && (
                <FormField
                  control={form.control}
                  name="ubicacionLat"
                  render={() => (
                    <FormItem>
                      <FormLabel>Ubicación de la sesión</FormLabel>
                      <EventLocationPicker
                        lat={form.watch('ubicacionLat')}
                        lng={form.watch('ubicacionLng')}
                        nombre={form.watch('ubicacionNombre')}
                        onNombreChange={(v) => form.setValue('ubicacionNombre', v)}
                        onPositionChange={(lat, lng) => {
                          form.setValue('ubicacionLng', lng);
                          form.setValue('ubicacionLat', lat, { shouldValidate: form.formState.isSubmitted });
                        }}
                        disabled={isPending}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {requiereLink(modalidad) && (
                <FormField
                  control={form.control}
                  name="linkSesion"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Link de la sesión</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="url"
                          inputMode="url"
                          maxLength={500}
                          disabled={isPending}
                          placeholder="https://meet.google.com/..."
                          className="h-10 rounded-md border-outline-variant text-sm"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {roles.length > 0 && (
                <FormField
                  control={form.control}
                  name="rolesDestino"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Para qué roles es la sesión</FormLabel>
                      <FormDescription className="type-meta">Vacío = visible para todos los participantes.</FormDescription>
                      <div className="max-h-32 space-y-1.5 overflow-y-auto rounded-md border border-outline-variant p-2">
                        {roles.map((rol) => (
                          <label key={rol.idRolProyecto} className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
                            <Checkbox
                              checked={field.value.includes(rol.idRolProyecto)}
                              disabled={isPending}
                              onCheckedChange={() =>
                                field.onChange(
                                  field.value.includes(rol.idRolProyecto)
                                    ? field.value.filter((id) => id !== rol.idRolProyecto)
                                    : [...field.value, rol.idRolProyecto],
                                )
                              }
                            />
                            {rol.nombreRol}
                          </label>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="antelacionMinutos"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Recordatorio</FormLabel>
                    <Select
                      value={String(field.value)}
                      onValueChange={(v) => field.onChange(Number(v))}
                      disabled={isPending}
                    >
                      <FormControl>
                        <SelectTrigger className="h-10 w-full border-outline-variant">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {opcionesRecordatorio(field.value).map((opt) => (
                          <SelectItem key={opt.value} value={String(opt.value)}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription className="type-meta">Se avisa a los participantes antes del inicio.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="shrink-0 gap-2 border-t border-outline-variant/35 px-4 py-4 sm:justify-between sm:px-6">
              {isEditing ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => void confirmarCancelacion()}
                  className="h-10 gap-1.5 rounded-md border-outline-variant text-xs font-bold text-status-error"
                >
                  {isCancelling ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  )}
                  Cancelar evento
                </Button>
              ) : (
                <span className="hidden sm:block" />
              )}
              <div className="grid grid-cols-2 gap-2 sm:flex">
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
        </Form>
      </DialogContent>
    </Dialog>
  );
}
