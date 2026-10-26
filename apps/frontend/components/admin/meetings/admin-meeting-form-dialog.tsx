'use client';

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormItem } from '@/components/ui/form';
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
  buildAdminMeetingFormSchema,
  buildAdminMeetingPayload,
  emptyAdminMeetingForm,
  motivosNoElegibles,
  rangoDeReunion,
  type AdminMeetingFormValues,
} from '@/lib/admin/admin-meeting-form';
import { IconoTipoEvento } from '@/lib/calendar/paleta';
import { aviso } from '@/lib/mensajes';
import { createAdminMeeting } from '@/lib/services/admin-meetings';
import type { MotivoNoElegible } from '@/lib/types/admin-meetings';
import { InvitedProjectsField } from './invited-projects-field';
import { MeetingPermissionsField } from './meeting-permissions-field';

function hoyInicioDelDia(): Date {
  const hoy = new Date();
  return new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
}

const SIN_MOTIVOS: ReadonlyMap<number, MotivoNoElegible> = new Map();
const SIN_CONOCIDOS: ReadonlyMap<number, string> = new Map();

/** Mensaje del rechazo del servidor, dentro del diálogo (el aviso flotante queda detrás del modal). */
function mensajeDeRechazo(error: unknown, motivos: ReadonlyMap<number, MotivoNoElegible>): string {
  if (motivos.size > 0) return 'Hay proyectos que no se pueden convocar en este horario. Revisa las tarjetas marcadas.';
  if ((error as { statusCode?: number } | null)?.statusCode === 403) return 'No tienes permiso para programar reuniones de Administración.';
  return getApiErrorMessage(error, 'calendar');
}

/**
 * HU-195 (T-363): «Programar reunión administrativa». Es el diálogo del evento
 * de proyecto (mismas piezas de `event-form-fields`: título y descripción,
 * fecha y horario, modalidad con enlace y mapa, recordatorio) con lo propio
 * de Administración: el tipo es siempre Reunión, se invitan proyectos en vez
 * de personas y se decide quién puede gestionarla. Una sola petición
 * (`POST /admin/reuniones`) crea la reunión para todos los proyectos; los
 * destinatarios y los avisos los resuelve el backend.
 */
export function AdminMeetingFormDialog({
  open,
  onOpenChange,
  initialDate,
  restaurarFocoEn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Día (y, si viene, hora) desde el que se abrió: el día elegido en el calendario. */
  initialDate?: Date;
  /** Control que abrió el diálogo: recibe el foco al cerrarlo. */
  restaurarFocoEn?: RefObject<HTMLElement | null>;
}) {
  const [mostrarDescripcion, setMostrarDescripcion] = useState(false);
  const [rechazo, setRechazo] = useState<{ clave: string; motivos: ReadonlyMap<number, MotivoNoElegible> } | null>(null);
  const ubicacionInputRef = useRef<HTMLInputElement>(null);
  const errorServidorRef = useRef<HTMLParagraphElement>(null);
  const queryClient = useQueryClient();
  const { data: usuario } = useCurrentUser();

  const schema = useMemo(
    () => buildAdminMeetingFormSchema({ mode: 'create' }),
    // Se reconstruye al abrir, como el del evento: `ahora` se lee al validar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open],
  );
  const form = useForm<AdminMeetingFormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyAdminMeetingForm(initialDate),
  });

  useEffect(() => {
    if (!open) return;
    form.reset(emptyAdminMeetingForm(initialDate));
    setMostrarDescripcion(false);
    setRechazo(null);
    // Solo al abrir: no se pisa lo que el administrador está escribiendo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
    onError: (error) => {
      const deEsteRechazo = motivosNoElegibles(error);
      setRechazo({ clave: claveRango, motivos: deEsteRechazo });
      const mensaje = mensajeDeRechazo(error, deEsteRechazo);
      form.setError('root', { message: mensaje });
      aviso.error('No se pudo programar la reunión', mensaje);
    },
  });

  const isPending = crear.isPending;
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
            onSubmit={form.handleSubmit((values) => crear.mutate(values), onInvalid)}
            onChange={() => errorServidor && form.clearErrors('root')}
            noValidate
            className={EVENT_DIALOG_FORM_CLASS}
          >
            <EventDialogHeader
              titulo="Programar reunión administrativa"
              descripcion="Organiza reuniones con uno o varios equipos de proyectos."
            />

            <div className={EVENT_DIALOG_BODY_CLASS}>
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

              <FechaHorarioFields isPending={isPending} disabledBefore={hoyInicioDelDia()} />

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
                      conocidos={SIN_CONOCIDOS}
                      motivos={motivos}
                      disabled={isPending}
                      error={fieldState.error?.message}
                    />
                  </FormItem>
                )}
              />

              <MeetingPermissionsField isPending={isPending} puedeCambiar idCreador={usuario?.idUsuario ?? null} editoresConocidos={[]} />

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
                <Button type="submit" disabled={isPending} className={EVENT_DIALOG_PRIMARY_BUTTON_CLASS}>
                  {isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <CalendarPlus className="size-4" aria-hidden="true" />}
                  Programar reunión
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
