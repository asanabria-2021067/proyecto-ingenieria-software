'use client';

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck2, Loader2, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { useCancelEvent } from '@/hooks/use-cancel-event';
import { useCurrentUser } from '@/hooks/use-current-user';
import { aviso } from '@/lib/mensajes';
import { esProyectoAgendable } from '@/lib/calendar/proyectos-agendables';
import { TIPO_EVENTO_ESTILO, TIPOS_EVENTO_EN_ORDEN, TONO_CLASES } from '@/lib/calendar/paleta';
import { createEvent, updateEvent, type EventoProyectoDTO, type TipoEvento } from '@/lib/services/events';
import { enfocarDisparador, enfocarElemento } from './event-detail-dialog';
import { InvitadosField } from './invitados-field';
import { esEscapeDeBuscadorEnLinea } from './inline-command-search';
import {
  EVENT_DIALOG_BODY_CLASS,
  EVENT_DIALOG_CONTENT_CLASS,
  EVENT_DIALOG_ERROR_CLASS,
  EVENT_DIALOG_FOOTER_CLASS,
  EVENT_DIALOG_FORM_CLASS,
  EVENT_DIALOG_PRIMARY_BUTTON_CLASS,
  EVENT_DIALOG_SECONDARY_BUTTON_CLASS,
  EventDialogHeader,
  FechaHorarioFields,
  LABEL_CLASS,
  ModalidadFields,
  RecordatorioFields,
  SELECT_CLASS,
  TituloDescripcionFields,
} from './event-form-fields';
import { buildEventFormSchema, buildEventPayload, emptyEventForm, eventFormFromEvento, type EventFormValues } from './event-form.schema';

export interface LedProjectOption {
  idProyecto: number;
  tituloProyecto: string;
  /** Para la marca "Horas beca" junto al selector de proyecto. */
  tipoProyecto?: string;
  /** GPI01-C08: un proyecto CERRADO se lista deshabilitado; el backend rechaza eventos nuevos en él. */
  estadoProyecto?: string;
}

function hoyInicioDelDia(): Date {
  const hoy = new Date();
  return new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
}

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
  restaurarFocoA = null,
  restaurarFocoEn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ledProjects: LedProjectOption[];
  /** Presente = modo edición sobre este evento; ausente = modo creación. */
  editingEvent?: EventoProyectoDTO | null;
  defaultProjectId?: number;
  initialDate?: Date;
  /**
   * G03 (UI-10, D-17): al abrir desde el detalle, Radix difiere el retorno de
   * foco del detalle (setTimeout) y este diálogo captura <body>; con la clave
   * del bloque original, al cancelar o guardar el foco vuelve a él.
   */
  restaurarFocoA?: string | null;
  /** G04-R01: control que abrió el diálogo cuando no fue un bloque del calendario (botón de la barra). */
  restaurarFocoEn?: RefObject<HTMLElement | null>;
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

  const idProyectoForm = form.watch('idProyecto');

  const idProyectoActivo = isEditing ? (editingEvent?.idProyecto ?? 0) : Number(idProyectoForm) || 0;
  const proyectoActivo = ledProjects.find((p) => p.idProyecto === idProyectoActivo);
  // GPI01-C08 (H-06): sin ningún proyecto agendable no hay nada que crear.
  const sinProyectoAgendable = !isEditing && !ledProjects.some((p) => esProyectoAgendable(p.estadoProyecto));

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
  // G02/G03 (UI-09): react-hook-form enfoca el primer campo inválido con ref
  // registrada (inputs nativos y, desde G03-C14, los triggers de Select y
  // DatePicker). La ubicación no tiene ref de formulario: si es lo único
  // inválido, se enfoca su input a mano.
  const onInvalid = (errores: FieldErrors<EventFormValues>) => {
    aviso.advertencia('Revisa los campos marcados', 'Hay datos del evento que faltan o no son válidos.');
    const claves = Object.keys(errores).filter((k) => k !== 'root');
    const soloUbicacion = claves.length > 0 && claves.every((k) => k === 'ubicacionLat' || k === 'ubicacionNombre');
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
      <DialogContent
        // Escape dentro del buscador de integrantes solo cierra sus resultados, nunca el diálogo con lo escrito.
        onEscapeKeyDown={(e) => esEscapeDeBuscadorEnLinea(e) && e.preventDefault()}
        onCloseAutoFocus={(e) => (enfocarDisparador(restaurarFocoA) || enfocarElemento(restaurarFocoEn?.current)) && e.preventDefault()}
        className={EVENT_DIALOG_CONTENT_CLASS}
      >
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit, onInvalid)}
            // Corregir cualquier campo retira el error del servidor (los errores por campo siguen).
            onChange={() => errorServidor && form.clearErrors('root')}
            noValidate
            className={EVENT_DIALOG_FORM_CLASS}
          >
            <EventDialogHeader
              titulo={isEditing ? 'Editar evento' : 'Nuevo evento o sesión'}
              descripcion="Programa tutorías, reuniones, revisiones o entregas de tus proyectos."
            />

            <div className={EVENT_DIALOG_BODY_CLASS}>
              <TituloDescripcionFields
                isPending={isPending}
                tituloLabel="Título del evento o actividad"
                tituloPlaceholder="Ej. Tutoría de Algoritmos y Estructura de Datos"
                descripcionPlaceholder="Detalles del evento"
                mostrarDescripcion={mostrarDescripcion}
                onMostrarDescripcion={() => setMostrarDescripcion(true)}
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="tipoEvento"
                  render={({ field }) => (
                    <FormItem className="min-w-0">
                      <FormLabel className={LABEL_CLASS}>Tipo de actividad</FormLabel>
                      <Select value={field.value} onValueChange={(v) => field.onChange(v as TipoEvento)} disabled={isPending}>
                        <FormControl>
                          {/* G03 (UI-09): con la ref del campo, react-hook-form puede enfocar el trigger si queda inválido. */}
                          <SelectTrigger ref={field.ref} aria-required className={SELECT_CLASS}>
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
                          <SelectTrigger ref={field.ref} aria-required className={SELECT_CLASS}>
                            <SelectValue placeholder="Selecciona un proyecto que lideras" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {ledProjects.map((p) => {
                            const agendable = esProyectoAgendable(p.estadoProyecto);
                            return (
                              <SelectItem key={p.idProyecto} value={String(p.idProyecto)} disabled={!agendable}>
                                {p.tituloProyecto}
                                {!agendable && ' · Cerrado'}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      {sinProyectoAgendable && (
                        <p role="status" className="type-meta">
                          Ninguno de tus proyectos admite actividades nuevas: los proyectos cerrados son de solo lectura.
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FechaHorarioFields isPending={isPending} disabledBefore={isEditing ? undefined : hoyInicioDelDia()} />

              <ModalidadFields isPending={isPending} ubicacionInputRef={ubicacionInputRef} />

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
                  className={EVENT_DIALOG_ERROR_CLASS}
                >
                  {errorServidor}
                </p>
              )}
            </div>

            <DialogFooter className={EVENT_DIALOG_FOOTER_CLASS}>
              <RecordatorioFields isPending={isPending} />

              <div className="flex flex-wrap items-center justify-end gap-2">
                {isEditing && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() => void confirmarEliminacion()}
                    className="h-10 gap-1.5 rounded-pill text-xs font-bold text-on-status-error hover:text-on-status-error"
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
                  className={EVENT_DIALOG_SECONDARY_BUTTON_CLASS}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isPending || sinProyectoAgendable}
                  className={EVENT_DIALOG_PRIMARY_BUTTON_CLASS}
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
