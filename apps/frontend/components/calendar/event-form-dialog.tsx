'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck2, Link2, Loader2, MapPin, Plus, SlidersHorizontal, Trash2, Type, Video } from 'lucide-react';
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { useCancelEvent } from '@/hooks/use-cancel-event';
import { useCurrentUser } from '@/hooks/use-current-user';
import { aviso } from '@/lib/mensajes';
import { MODALIDAD_ESTILO } from '@/lib/calendar/modalidad';
import { TIPO_EVENTO_ESTILO, TIPOS_EVENTO_EN_ORDEN, TONO_CLASES } from '@/lib/calendar/paleta';
import { createEvent, updateEvent, type EventoProyectoDTO, type ModalidadEvento, type TipoEvento } from '@/lib/services/events';
import { DatePicker } from './date-picker';
import { InvitadosField } from './invitados-field';
import {
  MODALIDAD_OPTIONS,
  RECORDATORIO_OPTIONS,
  buildEventFormSchema,
  buildEventPayload,
  duracionTexto,
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
  /** Para la marca "Horas beca" junto al selector de proyecto. */
  tipoProyecto?: string;
}

const MODALIDAD_AYUDA: Record<ModalidadEvento, string> = {
  PRESENCIAL: 'Presencial: requiere el lugar en el mapa',
  VIRTUAL: 'Virtual: requiere el enlace de la sesión',
  MIXTA: 'Híbrida: requiere enlace virtual y lugar físico',
};

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

function esLinkDeMeet(link: string): boolean {
  try {
    return new URL(link.trim()).hostname === 'meet.google.com';
  } catch {
    return false;
  }
}

const LABEL_CLASS = 'flex items-center gap-1.5 text-sm font-medium text-on-surface';

/**
 * HU-169 (T-263/T-264), rediseñado en HU-184 (T-323) según la maqueta del
 * equipo: qué (título y tipo), de qué proyecto, cuándo (una fecha, hora de
 * inicio y fin con su duración), cómo (modalidad con su enlace y/o lugar en
 * el mapa), para quién (invitados del proyecto) y si se envía recordatorio.
 * Solo accesible al líder del proyecto (`ledProjects` viene de
 * GET /proyectos/mine). Valida con `buildEventFormSchema` antes de enviar.
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
  const [mostrarDescripcion, setMostrarDescripcion] = useState(false);
  const ubicacionInputRef = useRef<HTMLInputElement>(null);
  const errorServidorRef = useRef<HTMLParagraphElement>(null);
  const queryClient = useQueryClient();
  const { data: usuario } = useCurrentUser();

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
    setMostrarDescripcion(Boolean(editingEvent?.descripcionEvento));
    // Solo al abrir: no queremos pisar lo que el usuario está escribiendo en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingEvent?.idEvento]);

  const modalidad = form.watch('modalidad');
  const idProyectoForm = form.watch('idProyecto');
  const linkSesion = form.watch('linkSesion');
  const recordatorioActivo = form.watch('recordatorioActivo');
  const terminaOtroDia = form.watch('terminaOtroDia');
  const fecha = form.watch('fecha');
  const duracion = duracionTexto({
    fecha,
    horaInicio: form.watch('horaInicio'),
    horaFin: form.watch('horaFin'),
    terminaOtroDia,
    fechaFin: form.watch('fechaFin'),
  });

  const idProyectoActivo = isEditing ? (editingEvent?.idProyecto ?? 0) : Number(idProyectoForm) || 0;
  const proyectoActivo = ledProjects.find((p) => p.idProyecto === idProyectoActivo);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['mis-eventos'] });
  };

  // G03 (UI-07): el toast vive fuera del árbol del modal (Radix lo marca
  // aria-hidden y en 375 px tapa la cabecera), así que la causa del rechazo
  // también se escribe dentro del diálogo como error `root` del formulario.
  const mostrarErrorServidor = (titulo: string, err: unknown) => {
    const mensaje = getApiErrorMessage(err, 'calendar');
    form.setError('root', { message: mensaje });
    aviso.error(titulo, mensaje);
  };

  const crear = useMutation({
    mutationFn: (values: EventFormValues) =>
      createEvent(Number(values.idProyecto), buildEventPayload(values, { keepEmptyDescripcion: false })),
    onSuccess: () => {
      invalidate();
      aviso.exito('Evento agendado');
      onOpenChange(false);
    },
    onError: (err) => mostrarErrorServidor('No se pudo agendar el evento', err),
  });

  const editar = useMutation({
    mutationFn: (values: EventFormValues) =>
      updateEvent(editingEvent!.idProyecto, editingEvent!.idEvento, buildEventPayload(values, { keepEmptyDescripcion: true })),
    onSuccess: () => {
      invalidate();
      aviso.exito('Evento actualizado');
      onOpenChange(false);
    },
    onError: (err) => mostrarErrorServidor('No se pudo guardar el evento', err),
  });

  const { cancelarEvento, isPending: isCancelling } = useCancelEvent();

  const errorServidor = form.formState.errors.root?.message;
  useEffect(() => {
    // Con el formulario largo el aviso queda al final del área con scroll: se trae a la vista.
    if (errorServidor) errorServidorRef.current?.scrollIntoView({ block: 'nearest' });
  }, [errorServidor]);

  const isPending = crear.isPending || editar.isPending || isCancelling;

  const confirmarEliminacion = async () => {
    if (!editingEvent) return;
    if (await cancelarEvento(editingEvent)) onOpenChange(false);
  };

  // Con el formulario largo (sobre todo en móvil) el campo con error puede
  // quedar fuera de vista: el aviso dice que hay algo que corregir.
  // G02 (UI-09): react-hook-form enfoca solo campos nativos; si lo único
  // inválido es la ubicación (sin ref registrada), se enfoca su input a mano.
  const onInvalid = (errores: FieldErrors<EventFormValues>) => {
    aviso.advertencia('Revisa los campos marcados', 'Hay datos del evento que faltan o no son válidos.');
    const soloUbicacion =
      (errores.ubicacionLat || errores.ubicacionNombre) &&
      !errores.tituloEvento &&
      !errores.descripcionEvento &&
      !errores.horaInicio &&
      !errores.horaFin &&
      !errores.linkSesion;
    if (soloUbicacion) ubicacionInputRef.current?.focus();
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
      <DialogContent className="flex max-h-[92dvh] w-full max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden border-outline-variant bg-surface-container-lowest p-0 sm:max-w-[600px]">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit, onInvalid)}
            // Corregir cualquier campo retira el error del servidor (los errores por campo siguen).
            onChange={() => errorServidor && form.clearErrors('root')}
            noValidate
            className="flex max-h-[92dvh] min-h-0 flex-col"
          >
            <DialogHeader className="shrink-0 flex-row items-start gap-3 space-y-0 px-4 pb-3 pt-5 pr-12 text-left sm:px-6">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-primary text-on-primary">
                <CalendarCheck2 className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="text-lg font-bold text-on-surface sm:text-xl">
                  {isEditing ? 'Editar evento' : 'Nuevo evento o sesión'}
                </DialogTitle>
                <DialogDescription className="text-xs text-on-surface-variant sm:text-sm">
                  Programa tutorías, reuniones, revisiones o entregas de tus proyectos.
                </DialogDescription>
              </div>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 pb-5 pt-2 sm:px-6">
              <FormField
                control={form.control}
                name="tituloEvento"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={LABEL_CLASS}>
                      <Type className="size-3.5 text-primary" aria-hidden="true" />
                      Título del evento o actividad
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        maxLength={200}
                        disabled={isPending}
                        placeholder="Ej. Tutoría de Algoritmos y Estructura de Datos"
                        className="h-10 rounded-md border-outline-variant bg-surface-container-low text-sm"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {mostrarDescripcion ? (
                <FormField
                  control={form.control}
                  name="descripcionEvento"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={LABEL_CLASS}>Descripción (opcional)</FormLabel>
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
              ) : (
                <button
                  type="button"
                  onClick={() => setMostrarDescripcion(true)}
                  className="-mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                  Agregar descripción
                </button>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="tipoEvento"
                  render={({ field }) => (
                    <FormItem className="min-w-0">
                      <FormLabel className={LABEL_CLASS}>Tipo de actividad</FormLabel>
                      <Select value={field.value} onValueChange={(v) => field.onChange(v as TipoEvento)} disabled={isPending}>
                        <FormControl>
                          <SelectTrigger className="h-10 w-full border-outline-variant bg-surface-container-low">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {TIPOS_EVENTO_EN_ORDEN.map((tipo) => {
                            const estilo = TIPO_EVENTO_ESTILO[tipo];
                            return (
                              <SelectItem key={tipo} value={tipo}>
                                <span className={`size-2 shrink-0 rounded-pill ${TONO_CLASES[estilo.tono].punto}`} aria-hidden="true" />
                                {estilo.label}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="idProyecto"
                  render={({ field }) => (
                    <FormItem className="min-w-0">
                      <div className="flex items-center justify-between gap-tight">
                        <FormLabel className={LABEL_CLASS}>Proyecto</FormLabel>
                        {proyectoActivo?.tipoProyecto === 'ACADEMICO_HORAS_BECA' && (
                          <span className="text-xs font-semibold text-primary">+ Horas beca</span>
                        )}
                      </div>
                      <Select
                        value={isEditing ? String(editingEvent?.idProyecto ?? '') : field.value}
                        onValueChange={(v) => {
                          field.onChange(v);
                          form.setValue('invitados', []);
                        }}
                        disabled={isPending || isEditing}
                      >
                        <FormControl>
                          <SelectTrigger className="h-10 w-full border-outline-variant bg-surface-container-low">
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
              </div>

              <div className="rounded-card border border-outline-variant/60 bg-surface-container-low p-stack">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
                  <FormField
                    control={form.control}
                    name="fecha"
                    render={({ field }) => (
                      <FormItem className="col-span-2 min-w-0 sm:col-span-1">
                        <FormLabel className="text-xs font-medium text-on-surface-variant">Fecha</FormLabel>
                        <FormControl>
                          <DatePicker
                            value={field.value}
                            onChange={(date) => {
                              field.onChange(date);
                              // G02 (UI-06): mover el inicio de un evento de varios días nunca lo
                              // colapsa a un día; la fecha de fin se conserva y, si queda antes
                              // del nuevo inicio, el error se muestra de inmediato.
                              if (form.getValues('terminaOtroDia')) void form.trigger('fechaFin');
                            }}
                            disabledBefore={isEditing ? undefined : hoyInicioDelDia()}
                            disabled={isPending}
                            className="bg-surface-container-lowest"
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
                      <FormItem className="min-w-0">
                        <FormLabel className="text-xs font-medium text-on-surface-variant">Hora de inicio</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="time"
                            step={300}
                            disabled={isPending}
                            className="h-10 rounded-md border-outline-variant bg-surface-container-lowest text-sm"
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
                      <FormItem className="min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <FormLabel className="text-xs font-medium text-on-surface-variant">Hora de fin</FormLabel>
                          {duracion && (
                            <span className="pill pill-success px-1.5 py-0 text-[11px]" aria-label={`Duración ${duracion}`}>
                              {duracion}
                            </span>
                          )}
                        </div>
                        <FormControl>
                          <Input
                            {...field}
                            type="time"
                            step={300}
                            disabled={isPending}
                            className="h-10 rounded-md border-outline-variant bg-surface-container-lowest text-sm"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                {/* G02 (UI-06): "Termina otro día" es opcional; desmarcado, el evento termina en la misma fecha. */}
                <div className="mt-tight flex flex-wrap items-start gap-x-4 gap-y-2">
                  <FormField
                    control={form.control}
                    name="terminaOtroDia"
                    render={({ field }) => (
                      <FormItem className="flex h-10 items-center gap-2 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            disabled={isPending}
                            onCheckedChange={(checked) => {
                              field.onChange(checked === true);
                              if (checked !== true) form.clearErrors('fechaFin');
                            }}
                          />
                        </FormControl>
                        <FormLabel className="text-xs font-normal text-on-surface">Termina otro día</FormLabel>
                      </FormItem>
                    )}
                  />
                  {terminaOtroDia && (
                    <FormField
                      control={form.control}
                      name="fechaFin"
                      render={({ field }) => (
                        <FormItem className="min-w-0 flex-1 sm:max-w-[16rem]">
                          <FormLabel className="sr-only">Fecha de fin</FormLabel>
                          <FormControl>
                            <DatePicker
                              value={field.value}
                              onChange={field.onChange}
                              disabledBefore={fecha}
                              disabled={isPending}
                              placeholder="Selecciona la fecha de fin"
                              className="bg-surface-container-lowest"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              </div>

              <FormField
                control={form.control}
                name="modalidad"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex flex-wrap items-center justify-between gap-x-tight gap-y-1">
                      {/* G03 (UI-08): el nombre del grupo lo da este span por aria-labelledby, no un FormLabel con htmlFor colgante. */}
                      <span id="modalidad-sesion-label" className={LABEL_CLASS}>
                        <SlidersHorizontal className="size-3.5 text-primary" aria-hidden="true" />
                        Modalidad de la sesión
                      </span>
                      <span className="type-meta">{MODALIDAD_AYUDA[field.value]}</span>
                    </div>
                    {/* G03 (UI-08): RadioGroup de Radix (misma dependencia que components/ui/radio-group,
                        sin su indicador circular para conservar los botones segmentados de la maqueta):
                        un solo tab stop, ←/→ cambian la opción, aria-checked real. */}
                    <RadioGroupPrimitive.Root
                      value={field.value}
                      onValueChange={(v) => field.onChange(v as ModalidadEvento)}
                      disabled={isPending}
                      aria-labelledby="modalidad-sesion-label"
                      orientation="horizontal"
                      loop
                      className="grid grid-cols-3 gap-1 rounded-control bg-surface-container-low p-1"
                    >
                      {MODALIDAD_OPTIONS.map((opt) => {
                        const Icono = MODALIDAD_ESTILO[opt.value].icon;
                        const activo = field.value === opt.value;
                        return (
                          <RadioGroupPrimitive.Item
                            key={opt.value}
                            value={opt.value}
                            className={`flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-control px-2 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/60 sm:text-sm ${
                              activo
                                ? 'border border-primary/60 bg-surface-container-lowest text-on-surface shadow-card'
                                : 'text-on-surface-variant hover:text-on-surface'
                            }`}
                          >
                            <Icono className="size-4 shrink-0" aria-hidden="true" />
                            <span className="truncate">{opt.label}</span>
                          </RadioGroupPrimitive.Item>
                        );
                      })}
                    </RadioGroupPrimitive.Root>
                  </FormItem>
                )}
              />

              {(requiereLink(modalidad) || requiereUbicacion(modalidad)) && (
                <div className="space-y-4 rounded-card border border-outline-variant/60 bg-surface-container-low p-stack">
                  {requiereLink(modalidad) && (
                    <FormField
                      control={form.control}
                      name="linkSesion"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center justify-between gap-tight">
                            <FormLabel className={LABEL_CLASS}>
                              <Link2 className="size-3.5 text-primary" aria-hidden="true" />
                              Enlace de conexión virtual
                            </FormLabel>
                            {esLinkDeMeet(linkSesion) && <span className="pill pill-neutral">Google Meet</span>}
                          </div>
                          <div className="relative">
                            <Video
                              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-on-surface-variant"
                              aria-hidden="true"
                            />
                            <FormControl>
                              <Input
                                {...field}
                                type="url"
                                inputMode="url"
                                maxLength={500}
                                disabled={isPending}
                                placeholder="https://meet.google.com/..."
                                className="h-10 rounded-md border-outline-variant bg-surface-container-lowest pl-9 text-sm"
                              />
                            </FormControl>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {requiereUbicacion(modalidad) && (
                    <FormField
                      control={form.control}
                      name="ubicacionLat"
                      render={() => (
                        <FormItem>
                          <div className="flex items-center justify-between gap-tight">
                            <FormLabel className={LABEL_CLASS}>
                              <MapPin className="size-3.5 text-primary" aria-hidden="true" />
                              Ubicación presencial
                            </FormLabel>
                            {form.watch('ubicacionLat') !== null && (
                              <span className="pill pill-success">Punto marcado</span>
                            )}
                          </div>
                          {/* Nombre del lugar arriba y el mapa debajo, como pidió el equipo. */}
                          <FormControl>
                            <EventLocationPicker
                              inputRef={ubicacionInputRef}
                              lat={form.watch('ubicacionLat')}
                              lng={form.watch('ubicacionLng')}
                              nombre={form.watch('ubicacionNombre')}
                              onNombreChange={(v) => form.setValue('ubicacionNombre', v, { shouldValidate: form.formState.isSubmitted })}
                              onPositionChange={(lat, lng) => {
                                form.setValue('ubicacionLng', lng);
                                form.setValue('ubicacionLat', lat, { shouldValidate: form.formState.isSubmitted });
                              }}
                              disabled={isPending}
                            />
                          </FormControl>
                          {/* G02 (UI-03): el tope de 255 del nombre también se muestra junto al campo. */}
                          {form.formState.errors.ubicacionNombre?.message && (
                            <p role="alert" className="text-sm text-destructive">
                              {form.formState.errors.ubicacionNombre.message}
                            </p>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              )}

              <FormField
                control={form.control}
                name="invitados"
                render={({ field }) => (
                  <FormItem>
                    <InvitadosField
                      idProyecto={idProyectoActivo}
                      value={field.value}
                      onChange={field.onChange}
                      lider={usuario ?? null}
                      disabled={isPending}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              {errorServidor && (
                <p
                  ref={errorServidorRef}
                  role="alert"
                  aria-live="assertive"
                  className="rounded-control border border-status-error/40 bg-status-error/10 px-3 py-2 text-sm text-status-error"
                >
                  {errorServidor}
                </p>
              )}
            </div>

            <DialogFooter className="shrink-0 flex-col gap-3 border-t border-outline-variant/35 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <FormField
                  control={form.control}
                  name="recordatorioActivo"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          disabled={isPending}
                          onCheckedChange={(checked) => field.onChange(checked === true)}
                        />
                      </FormControl>
                      <FormLabel className="text-xs font-normal text-on-surface">Enviar recordatorio</FormLabel>
                    </FormItem>
                  )}
                />
                {recordatorioActivo && (
                  <FormField
                    control={form.control}
                    name="antelacionMinutos"
                    render={({ field }) => (
                      <FormItem className="space-y-0">
                        <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))} disabled={isPending}>
                          <FormControl>
                            <SelectTrigger aria-label="Cuándo enviar el recordatorio" className="h-8 w-auto border-outline-variant text-xs">
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
                      </FormItem>
                    )}
                  />
                )}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                {isEditing && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() => void confirmarEliminacion()}
                    className="h-10 gap-1.5 rounded-md text-xs font-bold text-status-error hover:text-status-error"
                  >
                    {isCancelling ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    )}
                    Eliminar evento
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isPending}
                  onClick={() => onOpenChange(false)}
                  className="h-10 rounded-md text-xs font-bold"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  className="h-10 gap-1.5 rounded-pill bg-primary px-5 text-xs font-bold text-on-primary hover:bg-primary/90"
                >
                  {crear.isPending || editar.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <CalendarCheck2 className="size-4" aria-hidden="true" />
                  )}
                  {isEditing ? 'Guardar cambios' : 'Agendar evento'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
