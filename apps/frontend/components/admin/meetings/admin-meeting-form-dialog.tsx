'use client';

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck2, CalendarPlus, Loader2, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormItem } from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
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
  TituloDescripcionFields,
} from '@/components/calendar/event-form-fields';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { useCurrentUser } from '@/hooks/use-current-user';
import {
  adminMeetingFormFromReunion,
  buildAdminMeetingFormSchema,
  buildAdminMeetingPayload,
  emptyAdminMeetingForm,
  esConflictoDeVersion,
  motivosNoElegibles,
  rangoDeReunion,
  type AdminMeetingFormValues,
} from '@/lib/admin/admin-meeting-form';
import { IconoTipoEvento } from '@/lib/calendar/paleta';
import { aviso } from '@/lib/mensajes';
import { createAdminMeeting, getAdminMeeting, updateAdminMeeting } from '@/lib/services/admin-meetings';
import type { AdminMeetingDetalle, MotivoNoElegible } from '@/lib/types/admin-meetings';
import { InvitedProjectsField } from './invited-projects-field';
import { MeetingPermissionsField } from './meeting-permissions-field';

function hoyInicioDelDia(): Date {
  const hoy = new Date();
  return new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
}

const SIN_MOTIVOS: ReadonlyMap<number, MotivoNoElegible> = new Map();
const SIN_CONOCIDOS: ReadonlyMap<number, string> = new Map();

/** Mensaje del rechazo del servidor, dentro del diálogo (el aviso flotante queda detrás del modal). */
function mensajeDeRechazo(error: unknown, motivos: ReadonlyMap<number, MotivoNoElegible>, editando: boolean): string {
  if (motivos.size > 0) return 'Hay proyectos que no se pueden convocar en este horario. Revisa las tarjetas marcadas.';
  const status = (error as { statusCode?: number } | null)?.statusCode;
  if (status === 403) return editando ? 'No tienes permiso para editar esta reunión.' : 'No tienes permiso para programar reuniones de Administración.';
  if (status === 404) return 'La reunión ya no existe.';
  return getApiErrorMessage(error, 'calendar');
}

/** Por qué una reunión cargada no se puede guardar; `null` si sí se puede. */
function bloqueoDeEdicion(reunion: AdminMeetingDetalle): string | null {
  if (reunion.estado === 'CANCELADA') return 'Esta reunión fue cancelada: ya no se puede editar.';
  if (reunion.integridad !== 'OK' || !reunion.contenido) return 'Los datos de esta reunión no son consistentes; no se puede editar. Avisa al equipo técnico.';
  if (!reunion.canManage) return 'No tienes permiso para editar esta reunión.';
  return null;
}

/**
 * HU-195 (T-363): «Programar reunión administrativa». Es el diálogo del evento
 * de proyecto (mismas piezas de `event-form-fields`: título y descripción,
 * fecha y horario, modalidad con enlace y mapa, recordatorio) con lo propio
 * de Administración: el tipo es siempre Reunión, se invitan proyectos en vez
 * de personas y se decide quién puede gestionarla. Una sola petición
 * (`POST /admin/reuniones`) crea la reunión para todos los proyectos; los
 * destinatarios y los avisos los resuelve el backend.
 *
 * Con `idReunion` es «Editar reunión»: precarga la reunión y guarda con
 * `PATCH` y la versión leída. Un 409 (otro administrador la cambió o la
 * canceló) no pisa nada: conserva lo escrito y ofrece cargar la versión actual.
 */
export function AdminMeetingFormDialog({
  open,
  onOpenChange,
  initialDate,
  idReunion = null,
  restaurarFocoEn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Día (y, si viene, hora) desde el que se abrió: el día elegido en el calendario. */
  initialDate?: Date;
  /** Presente = «Editar reunión»: se lee la reunión (con su versión) y se guarda con PATCH. */
  idReunion?: number | null;
  /** Control que abrió el diálogo: recibe el foco al cerrarlo. */
  restaurarFocoEn?: RefObject<HTMLElement | null>;
}) {
  const [mostrarDescripcion, setMostrarDescripcion] = useState(false);
  const [rechazo, setRechazo] = useState<{ clave: string; motivos: ReadonlyMap<number, MotivoNoElegible> } | null>(null);
  const ubicacionInputRef = useRef<HTMLInputElement>(null);
  const errorServidorRef = useRef<HTMLParagraphElement>(null);
  const queryClient = useQueryClient();
  const { data: usuario } = useCurrentUser();
  const editando = idReunion !== null;

  // Edición: la reunión se lee al abrir (versión fresca). `base` es la versión que está en el
  // formulario: un 409 no la reemplaza sola, para no pisar lo escrito.
  const detalle = useQuery({
    queryKey: ['admin', 'reuniones', idReunion, 'detalle'],
    queryFn: () => getAdminMeeting(idReunion!),
    enabled: open && editando,
    staleTime: 0,
    retry: false,
  });
  const [base, setBase] = useState<AdminMeetingDetalle | null>(null);
  const [conflicto, setConflicto] = useState(false);
  const actual = detalle.data ?? null;
  const bloqueo = actual ? bloqueoDeEdicion(actual) : null;

  const schema = useMemo(
    () =>
      buildAdminMeetingFormSchema({
        mode: editando ? 'edit' : 'create',
        fechaInicioOriginal: base?.contenido?.fechaInicio ?? null,
      }),
    // Se reconstruye al abrir, como el del evento: `ahora` se lee al validar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, editando, base?.contenido?.fechaInicio],
  );
  const form = useForm<AdminMeetingFormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyAdminMeetingForm(initialDate),
  });

  const cargar = (reunion: AdminMeetingDetalle) => {
    setBase(reunion);
    setConflicto(false);
    setRechazo(null);
    if (reunion.contenido) {
      form.reset(adminMeetingFormFromReunion(reunion));
      setMostrarDescripcion(Boolean(reunion.contenido.descripcionEvento));
    }
  };

  useEffect(() => {
    if (!open) return;
    setBase(null);
    setConflicto(false);
    setRechazo(null);
    if (!editando) {
      form.reset(emptyAdminMeetingForm(initialDate));
      setMostrarDescripcion(false);
    }
    // Solo al abrir: no se pisa lo que el administrador está escribiendo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, idReunion]);

  // Primera lectura de la reunión que se edita: llena el formulario una sola vez.
  useEffect(() => {
    if (open && editando && actual && base === null) cargar(actual);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editando, actual, base]);

  const fecha = form.watch('fecha');
  const horaInicio = form.watch('horaInicio');
  const horaFin = form.watch('horaFin');
  const terminaOtroDia = form.watch('terminaOtroDia');
  const fechaFin = form.watch('fechaFin');
  const rango = rangoDeReunion({ fecha, horaInicio, horaFin, terminaOtroDia, fechaFin });
  const claveRango = rango ? `${rango.fechaInicio.toISOString()}/${rango.fechaFin.toISOString()}` : '';
  // El motivo de un rechazo vale para el horario con que se pidió: al cambiarlo, decide la elegibilidad nueva.
  const motivos = rechazo?.clave === claveRango ? rechazo.motivos : SIN_MOTIVOS;
  const rangoEstable = useMemo(() => rango, [claveRango]); // eslint-disable-line react-hooks/exhaustive-deps

  const crear = useMutation({
    mutationFn: (values: AdminMeetingFormValues) =>
      createAdminMeeting(buildAdminMeetingPayload(values, { mode: 'create', incluirPolitica: true })),
    onSuccess: (reunion) => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'reuniones'] });
      const n = reunion.proyectos.length;
      aviso.exito('Reunión programada', `Se convocó a ${n === 1 ? '1 proyecto' : `${n} proyectos`}.`);
      onOpenChange(false);
    },
    onError: (error) => mostrarRechazo('No se pudo programar la reunión', error),
  });

  const editar = useMutation({
    mutationFn: (values: AdminMeetingFormValues) =>
      updateAdminMeeting(idReunion!, {
        ...buildAdminMeetingPayload(values, { mode: 'edit', incluirPolitica: base!.puedeCambiarPolitica }),
        version: base!.version,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'reuniones'] });
      aviso.exito('Reunión actualizada', 'Los equipos convocados recibirán el aviso del cambio.');
      onOpenChange(false);
    },
    onError: (error) => {
      if (esConflictoDeVersion(error)) {
        // Otro administrador la cambió (o la canceló): se relee y se ofrece cargarla, sin pisar lo escrito.
        setConflicto(true);
        void detalle.refetch();
        form.clearErrors('root');
        aviso.advertencia('La reunión cambió', 'Otro administrador la modificó mientras la editabas.');
        return;
      }
      mostrarRechazo('No se pudo guardar la reunión', error);
    },
  });

  function mostrarRechazo(titulo: string, error: unknown) {
    const deEsteRechazo = motivosNoElegibles(error);
    setRechazo({ clave: claveRango, motivos: deEsteRechazo });
    const mensaje = mensajeDeRechazo(error, deEsteRechazo, editando);
    form.setError('root', { message: mensaje });
    aviso.error(titulo, mensaje);
  }

  const isPending = crear.isPending || editar.isPending;
  const cargando = editando && base === null;
  // Tras un conflicto, la versión releída puede estar cancelada o fuera de permiso: no se guarda.
  const sinGuardar = cargando || conflicto || (editando && Boolean(bloqueo));
  const errorServidor = form.formState.errors.root?.message;
  useEffect(() => {
    if (errorServidor) errorServidorRef.current?.scrollIntoView({ block: 'nearest' });
  }, [errorServidor]);

  const onInvalid = (errores: FieldErrors<AdminMeetingFormValues>) => {
    aviso.advertencia('Revisa los campos marcados', 'Hay datos de la reunión que faltan o no son válidos.');
    const claves = Object.keys(errores).filter((k) => k !== 'root');
    if (claves.length > 0 && claves.every((k) => k === 'ubicacionLat' || k === 'ubicacionNombre')) ubicacionInputRef.current?.focus();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent
        // Escape dentro del buscador de proyectos solo cierra sus resultados, nunca el diálogo con lo escrito.
        onEscapeKeyDown={(e) => {
          if ((e.target as HTMLElement | null)?.closest?.('[data-buscador-proyectos]')) e.preventDefault();
        }}
        onCloseAutoFocus={(e) => {
          if (restaurarFocoEn?.current) {
            e.preventDefault();
            restaurarFocoEn.current.focus();
          }
        }}
        className={EVENT_DIALOG_CONTENT_CLASS}
      >
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => (editando ? editar.mutate(values) : crear.mutate(values)), onInvalid)}
            onChange={() => errorServidor && form.clearErrors('root')}
            noValidate
            className={EVENT_DIALOG_FORM_CLASS}
          >
            <EventDialogHeader
              titulo={editando ? 'Editar reunión administrativa' : 'Programar reunión administrativa'}
              descripcion="Organiza reuniones con uno o varios equipos de proyectos."
            />

            <div className={EVENT_DIALOG_BODY_CLASS}>
              {editando && detalle.isError && base === null && (
                <p role="alert" className={EVENT_DIALOG_ERROR_CLASS}>
                  {mensajeDeRechazo(detalle.error, SIN_MOTIVOS, true)}
                </p>
              )}
              {cargando && !detalle.isError && (
                <div role="status" aria-label="Cargando la reunión" className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              )}
              {conflicto && actual && (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-tight rounded-control border border-attention/40 bg-attention/10 px-3 py-2 text-sm text-on-surface">
                  <span>
                    {bloqueo ?? 'Otro administrador modificó esta reunión mientras la editabas. Tus cambios siguen aquí; carga la versión actual para revisarla antes de guardar.'}
                  </span>
                  {!bloqueo && (
                    <Button type="button" variant="outline" size="sm" className="gap-1.5 rounded-pill" onClick={() => cargar(actual)}>
                      <RefreshCw className="size-3.5" aria-hidden="true" />
                      Cargar la versión actual
                    </Button>
                  )}
                </div>
              )}
              {!conflicto && editando && bloqueo && base !== null && (
                <p role="alert" className={EVENT_DIALOG_ERROR_CLASS}>
                  {bloqueo}
                </p>
              )}
              {!cargando && (
                <>
                  <TituloDescripcionFields
                    isPending={isPending}
                    tituloLabel="Título de la reunión"
                    tituloPlaceholder="Ej. Revisión de avances de proyectos"
                    descripcionPlaceholder="Agenda o detalles de la reunión"
                    mostrarDescripcion={mostrarDescripcion}
                    onMostrarDescripcion={() => setMostrarDescripcion(true)}
                  />

                  <div>
                    <span className={LABEL_CLASS}>Tipo de actividad</span>
                    <p className="mt-2 flex h-10 items-center gap-tight rounded-control border border-outline-variant bg-surface-container-low px-3 text-sm text-on-surface">
                      <span aria-hidden="true">
                        <IconoTipoEvento tipo="REUNION" tono={3} />
                      </span>
                      Reunión administrativa
                    </p>
                  </div>

                  <FechaHorarioFields isPending={isPending} disabledBefore={editando ? undefined : hoyInicioDelDia()} />

                  <ModalidadFields isPending={isPending} ubicacionInputRef={ubicacionInputRef} />

                  <FormField
                    control={form.control}
                    name="proyectos"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <InvitedProjectsField
                          value={field.value}
                          onChange={(proyectos) => field.onChange(proyectos)}
                          rango={rangoEstable}
                          conocidos={base ? new Map(base.proyectos.map((p) => [p.idProyecto, p.tituloProyecto])) : SIN_CONOCIDOS}
                          motivos={motivos}
                          disabled={isPending}
                          error={fieldState.error?.message}
                        />
                      </FormItem>
                    )}
                  />

                  <MeetingPermissionsField
                    isPending={isPending}
                    puedeCambiar={base ? base.puedeCambiarPolitica : true}
                    idCreador={base ? base.creador.idUsuario : (usuario?.idUsuario ?? null)}
                    editoresConocidos={base?.editores ?? []}
                  />
                </>
              )}

              {errorServidor && (
                <p ref={errorServidorRef} role="alert" aria-live="assertive" className={EVENT_DIALOG_ERROR_CLASS}>
                  {errorServidor}
                </p>
              )}
            </div>

            <DialogFooter className={EVENT_DIALOG_FOOTER_CLASS}>
              <RecordatorioFields isPending={isPending} />
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button type="button" variant="ghost" disabled={isPending} onClick={() => onOpenChange(false)} className={EVENT_DIALOG_SECONDARY_BUTTON_CLASS}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isPending || sinGuardar} className={EVENT_DIALOG_PRIMARY_BUTTON_CLASS}>
                  {isPending ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  ) : editando ? (
                    <CalendarCheck2 className="size-4" aria-hidden="true" />
                  ) : (
                    <CalendarPlus className="size-4" aria-hidden="true" />
                  )}
                  {editando ? 'Guardar cambios' : 'Programar reunión'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
