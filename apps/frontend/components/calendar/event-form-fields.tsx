'use client';

import type { ReactNode, RefObject } from 'react';
import dynamic from 'next/dynamic';
import { useFormContext } from 'react-hook-form';
import { CalendarCheck2, Link2, MapPin, Plus, SlidersHorizontal, Type, Video } from 'lucide-react';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MODALIDAD_ESTILO } from '@/lib/calendar/modalidad';
import type { ModalidadEvento } from '@/lib/services/events';
import { DatePicker } from './date-picker';
import {
  MODALIDAD_OPTIONS,
  RECORDATORIO_OPTIONS,
  duracionTexto,
  requiereLink,
  requiereUbicacion,
  type EventFormValues,
} from './event-form.schema';

/**
 * Piezas del diálogo de evento (HU-184, T-323) que comparten el formulario de
 * un evento de proyecto (`EventFormDialog`) y el de una reunión de
 * Administración (`AdminMeetingFormDialog`). Leen el formulario del contexto
 * de react-hook-form (`<Form {...form}>`), así que solo exigen que sus valores
 * tengan los campos de `EventFormValues` que usan. Marcado y comportamiento
 * son los del diálogo original; aquí solo cambiaron de archivo.
 */

const EventLocationPicker = dynamic(() => import('./event-location-picker'), {
  ssr: false, // leaflet/react-leaflet usan `window`: no puede renderizarse en el servidor.
  loading: () => <div className="h-48 w-full animate-pulse rounded-md bg-surface-container" />,
});

export const LABEL_CLASS = 'flex items-center gap-1.5 text-sm font-medium text-on-surface';
// G05-R05: `min-w-0` deja que el selector se encoja hasta su columna (el valor se trunca). Sin él, el
// texto sin salto de línea fijaba el ancho mínimo y a 320 px el cuerpo del diálogo se desplazaba de lado.
export const SELECT_CLASS = 'h-10 w-full min-w-0 border-outline-variant bg-surface-container-low';

/** Contenedor del diálogo: centrado, con cabecera y pie fijos y el cuerpo con scroll propio. */
export const EVENT_DIALOG_CONTENT_CLASS =
  'flex max-h-[92dvh] w-full max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden border-outline-variant bg-surface-container-lowest p-0 sm:max-w-[600px]';
export const EVENT_DIALOG_FORM_CLASS = 'flex max-h-[92dvh] min-h-0 flex-col';
export const EVENT_DIALOG_BODY_CLASS = 'min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 pb-5 pt-2 sm:px-6';
export const EVENT_DIALOG_FOOTER_CLASS =
  'shrink-0 flex-col gap-3 border-t border-outline-variant/35 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6';
export const EVENT_DIALOG_SECONDARY_BUTTON_CLASS = 'h-10 rounded-pill text-xs font-bold';
export const EVENT_DIALOG_PRIMARY_BUTTON_CLASS = 'h-10 gap-1.5 rounded-pill bg-primary px-5 text-xs font-bold text-on-primary hover:bg-primary/90';
export const EVENT_DIALOG_ERROR_CLASS = 'rounded-control border border-status-error/40 bg-status-error/10 px-3 py-2 text-sm text-on-status-error';

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

function esLinkDeMeet(link: string): boolean {
  try {
    return new URL(link.trim()).hostname === 'meet.google.com';
  } catch {
    return false;
  }
}

/** Cabecera del diálogo: ícono en verde, título y una línea de contexto. */
export function EventDialogHeader({ titulo, descripcion, icono }: { titulo: string; descripcion: string; icono?: ReactNode }) {
  return (
    <DialogHeader className="shrink-0 flex-row items-start gap-3 space-y-0 px-4 pb-3 pt-5 pr-12 text-left sm:px-6">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-primary text-on-primary">
        {icono ?? <CalendarCheck2 className="size-5" aria-hidden="true" />}
      </span>
      <div className="min-w-0">
        {/* G04 (UI-33): el título usa el `type-section` que ya trae DialogTitle. */}
        <DialogTitle>{titulo}</DialogTitle>
        <DialogDescription className="text-xs text-on-surface-variant sm:text-sm">{descripcion}</DialogDescription>
      </div>
    </DialogHeader>
  );
}

/** Título obligatorio y la descripción opcional detrás de «Agregar descripción». */
export function TituloDescripcionFields({
  isPending,
  tituloLabel,
  tituloPlaceholder,
  descripcionPlaceholder,
  mostrarDescripcion,
  onMostrarDescripcion,
}: {
  isPending: boolean;
  tituloLabel: string;
  tituloPlaceholder: string;
  descripcionPlaceholder: string;
  mostrarDescripcion: boolean;
  onMostrarDescripcion: () => void;
}) {
  const form = useFormContext<EventFormValues>();
  return (
    <>
      <FormField
        control={form.control}
        name="tituloEvento"
        render={({ field }) => (
          <FormItem>
            <FormLabel className={LABEL_CLASS}>
              <Type className="size-3.5 text-primary" aria-hidden="true" />
              {tituloLabel}
            </FormLabel>
            <FormControl>
              <Input
                {...field}
                maxLength={200}
                aria-required
                disabled={isPending}
                placeholder={tituloPlaceholder}
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
                  placeholder={descripcionPlaceholder}
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
          onClick={onMostrarDescripcion}
          className="-mt-2 inline-flex min-h-6 items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          Agregar descripción
        </button>
      )}
    </>
  );
}

/** Fecha, hora de inicio y fin con su duración, y «Termina otro día» con la fecha de fin. */
export function FechaHorarioFields({ isPending, disabledBefore }: { isPending: boolean; disabledBefore: Date | undefined }) {
  const form = useFormContext<EventFormValues>();
  const terminaOtroDia = form.watch('terminaOtroDia');
  const fecha = form.watch('fecha');
  const duracion = duracionTexto({
    fecha,
    horaInicio: form.watch('horaInicio'),
    horaFin: form.watch('horaFin'),
    terminaOtroDia,
    fechaFin: form.watch('fechaFin'),
  });

  return (
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
                  ref={field.ref}
                  value={field.value}
                  onChange={(date) => {
                    field.onChange(date);
                    // G02 (UI-06): mover el inicio de un evento de varios días nunca lo
                    // colapsa a un día; la fecha de fin se conserva y, si queda antes
                    // del nuevo inicio, el error se muestra de inmediato.
                    if (form.getValues('terminaOtroDia')) void form.trigger('fechaFin');
                  }}
                  disabledBefore={disabledBefore}
                  disabled={isPending}
                  className="bg-surface-container-lowest"
                />
              </FormControl>
              {/* G04 (UI-30): el disparador es un <button>, que no admite aria-required
                  (axe: aria-allowed-attr); la obligatoriedad va como descripción accesible. */}
              <FormDescription className="sr-only">Campo obligatorio</FormDescription>
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
                  aria-required
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
                  // G04 (UI-32): sin aria-label en un span genérico (no es válido ni fiable): texto oculto + valor.
                  <span className="pill pill-success px-1.5 py-0 type-micro">
                    <span className="sr-only">Duración </span>
                    {duracion}
                  </span>
                )}
              </div>
              <FormControl>
                <Input
                  {...field}
                  type="time"
                  step={300}
                  aria-required
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
              // G04-R02: en móvil ocupa su propia fila; al lado de la casilla no cabía y se salía de la tarjeta.
              <FormItem className="min-w-0 flex-1 basis-full sm:max-w-[16rem] sm:basis-0">
                <FormLabel className="sr-only">Fecha de fin</FormLabel>
                <FormControl>
                  <DatePicker
                    ref={field.ref}
                    value={field.value}
                    onChange={field.onChange}
                    disabledBefore={fecha}
                    disabled={isPending}
                    placeholder="Selecciona la fecha de fin"
                    className="bg-surface-container-lowest"
                  />
                </FormControl>
                <FormDescription className="sr-only">Campo obligatorio</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Modalidad (Presencial, Virtual, Híbrida) y, según ella, el enlace de la
 * sesión y/o el lugar con el mapa existente.
 */
export function ModalidadFields({ isPending, ubicacionInputRef }: { isPending: boolean; ubicacionInputRef: RefObject<HTMLInputElement | null> }) {
  const form = useFormContext<EventFormValues>();
  const modalidad = form.watch('modalidad');
  const linkSesion = form.watch('linkSesion');

  return (
    <>
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
              // G05-R06: en móvil cada opción apila ícono y nombre y las columnas se reparten según
              // su contenido; con tres columnas iguales en fila «Presencial» quedaba en «Pres…».
              className="grid grid-cols-[repeat(3,auto)] gap-1 rounded-control bg-surface-container-low p-1 sm:grid-cols-3"
            >
              {MODALIDAD_OPTIONS.map((opt) => {
                const Icono = MODALIDAD_ESTILO[opt.value].icon;
                const activo = field.value === opt.value;
                return (
                  <RadioGroupPrimitive.Item
                    key={opt.value}
                    value={opt.value}
                    className={`flex h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-control px-1 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/60 sm:h-9 sm:flex-row sm:gap-1.5 sm:px-2 sm:text-sm ${
                      activo
                        ? 'border border-primary/60 bg-surface-container-lowest text-on-surface shadow-card'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <Icono className="size-4 shrink-0" aria-hidden="true" />
                    <span className="whitespace-nowrap">{opt.label}</span>
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
                        aria-required
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
                    {form.watch('ubicacionLat') !== null && <span className="pill pill-success">Punto marcado</span>}
                  </div>
                  {/* Nombre del lugar arriba y el mapa debajo, como pidió el equipo. */}
                  <FormControl>
                    <EventLocationPicker
                      inputRef={ubicacionInputRef}
                      aria-required
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
    </>
  );
}

/** «Enviar recordatorio» y cuándo, en el pie del diálogo. */
export function RecordatorioFields({ isPending }: { isPending: boolean }) {
  const form = useFormContext<EventFormValues>();
  const recordatorioActivo = form.watch('recordatorioActivo');
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <FormField
        control={form.control}
        name="recordatorioActivo"
        render={({ field }) => (
          <FormItem className="flex items-center gap-2 space-y-0">
            <FormControl>
              <Checkbox checked={field.value} disabled={isPending} onCheckedChange={(checked) => field.onChange(checked === true)} />
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
  );
}
