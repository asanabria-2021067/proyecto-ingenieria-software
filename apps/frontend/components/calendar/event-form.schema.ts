import { z } from 'zod';
import type { EventoProyectoDTO, EventPayload, ModalidadEvento, TipoEvento } from '@/lib/services/events';
import { safeExternalHref } from '@/lib/security/safe-url';

const HORA_FORMAT = /^([01]\d|2[0-3]):[0-5]\d$/;

export const MODALIDAD_OPTIONS: { value: ModalidadEvento; label: string }[] = [
  { value: 'PRESENCIAL', label: 'Presencial' },
  { value: 'VIRTUAL', label: 'Virtual' },
  { value: 'MIXTA', label: 'Híbrida' },
];

/**
 * HU-184 (T-323): cuándo avisar, en minutos antes del inicio. "Sin
 * recordatorio" es desmarcar el check del diálogo (se envía 0).
 */
export const RECORDATORIO_OPTIONS: { value: number; label: string }[] = [
  { value: 15, label: '15 minutos antes' },
  { value: 30, label: '30 minutos antes' },
  { value: 60, label: '1 hora antes' },
  { value: 1440, label: '1 día antes' },
  { value: 10080, label: '1 semana antes' },
];

export const RECORDATORIO_DEFAULT = 60;

export function requiereUbicacion(modalidad: ModalidadEvento): boolean {
  return modalidad === 'PRESENCIAL' || modalidad === 'MIXTA';
}

export function requiereLink(modalidad: ModalidadEvento): boolean {
  return modalidad === 'VIRTUAL' || modalidad === 'MIXTA';
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Date -> "HH:mm" en hora LOCAL. */
export function toHora(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Día (Date) + "HH:mm" -> instante en hora LOCAL; null si falta alguno o la hora no es válida. */
export function combinarFechaHora(dia: Date | undefined | null, hora: string): Date | null {
  if (!dia || !HORA_FORMAT.test(hora)) return null;
  const [h, m] = hora.split(':').map(Number);
  return new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), h, m, 0, 0);
}

function soloDia(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function mismoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export interface EventFormValues {
  idProyecto: string;
  tituloEvento: string;
  descripcionEvento: string;
  tipoEvento: TipoEvento;
  /** HU-184: una sola fecha; el evento empieza y termina ese día. */
  fecha: Date | undefined;
  horaInicio: string;
  horaFin: string;
  /**
   * Solo para eventos creados antes de HU-184 que duran varios días: el día
   * en que terminan. Se conserva al guardar mientras no se cambie la fecha.
   */
  fechaFinOriginal: Date | null;
  modalidad: ModalidadEvento;
  ubicacionLat: number | null;
  ubicacionLng: number | null;
  ubicacionNombre: string;
  linkSesion: string;
  /** Ya no se edita en el diálogo; se conserva tal cual al guardar. */
  rolesDestino: number[];
  /** HU-184: idUsuario invitados; [] = todo el proyecto. */
  invitados: number[];
  recordatorioActivo: boolean;
  antelacionMinutos: number;
}

/** Lo mínimo para calcular el rango; `fecha` opcional porque así la entrega zod. */
type RangoInput = { fecha?: Date; horaInicio: string; horaFin: string; fechaFinOriginal: Date | null };

/** Inicio y fin reales del formulario (con el día de fin original si el evento dura varios días). */
export function rangoDelFormulario(values: RangoInput) {
  return {
    inicio: combinarFechaHora(values.fecha, values.horaInicio),
    fin: combinarFechaHora(values.fechaFinOriginal ?? values.fecha, values.horaFin),
  };
}

/** "1h 30m", "45m"; null si el rango no es válido. Para el chip de duración del diálogo. */
export function duracionTexto(values: RangoInput): string | null {
  const { inicio, fin } = rangoDelFormulario(values);
  if (!inicio || !fin || fin <= inicio) return null;
  const minutos = Math.round((fin.getTime() - inicio.getTime()) / 60_000);
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas === 0) return `${resto}m`;
  return resto === 0 ? `${horas}h` : `${horas}h ${resto}m`;
}

export function emptyEventForm(defaultProjectId?: number, initialDate?: Date, ahora = new Date()): EventFormValues {
  const base = initialDate ? new Date(initialDate) : new Date(ahora);
  base.setMinutes(0, 0, 0);
  base.setHours(base.getHours() + 1);
  const fin = new Date(base);
  fin.setHours(fin.getHours() + 1);
  return {
    idProyecto: defaultProjectId ? String(defaultProjectId) : '',
    tituloEvento: '',
    descripcionEvento: '',
    tipoEvento: 'REUNION',
    fecha: soloDia(base),
    horaInicio: toHora(base),
    // Si la hora propuesta es las 23:00, una hora después ya es otro día:
    // con una sola fecha, el fin se recorta al final del mismo día.
    horaFin: mismoDia(base, fin) ? toHora(fin) : '23:59',
    fechaFinOriginal: null,
    modalidad: 'VIRTUAL',
    ubicacionLat: null,
    ubicacionLng: null,
    ubicacionNombre: '',
    linkSesion: '',
    rolesDestino: [],
    invitados: [],
    recordatorioActivo: true,
    antelacionMinutos: RECORDATORIO_DEFAULT,
  };
}

export function eventFormFromEvento(evento: EventoProyectoDTO): EventFormValues {
  const inicio = new Date(evento.fechaInicio);
  const fin = new Date(evento.fechaFin);
  return {
    idProyecto: String(evento.idProyecto),
    tituloEvento: evento.tituloEvento,
    descripcionEvento: evento.descripcionEvento ?? '',
    tipoEvento: evento.tipoEvento,
    fecha: soloDia(inicio),
    horaInicio: toHora(inicio),
    horaFin: toHora(fin),
    fechaFinOriginal: mismoDia(inicio, fin) ? null : soloDia(fin),
    modalidad: evento.modalidad,
    ubicacionLat: evento.ubicacionLat,
    ubicacionLng: evento.ubicacionLng,
    ubicacionNombre: evento.ubicacionNombre ?? '',
    linkSesion: evento.linkSesion ?? '',
    rolesDestino: evento.rolesDestino,
    invitados: evento.invitados,
    recordatorioActivo: evento.antelacionMinutos > 0,
    antelacionMinutos: evento.antelacionMinutos > 0 ? evento.antelacionMinutos : RECORDATORIO_DEFAULT,
  };
}

export interface BuildEventFormSchemaOptions {
  mode: 'create' | 'edit';
  /** Inicio ya persistido (solo en edición): si no se mueve, puede quedar en el pasado. */
  fechaInicioOriginal?: string | null;
  ahora?: Date;
}

/**
 * HU-184 (T-323): única fuente de validación del diálogo de evento. Mismas
 * reglas que EventsService/CreateEventDto en el backend (fin > inicio,
 * inicio no anterior a ahora, ubicación si es presencial/híbrida, link
 * http(s) si es virtual/híbrida), pero validadas antes de enviar y con el
 * mensaje pegado a su campo.
 */
export function buildEventFormSchema({ mode, fechaInicioOriginal = null, ahora = new Date() }: BuildEventFormSchemaOptions) {
  return z
    .object({
      idProyecto: z.string(),
      // "No vacío" se valida en superRefine: si fallara aquí, zod no corre el
      // superRefine y el usuario no vería los errores de fecha al mismo tiempo.
      tituloEvento: z.string().max(200, 'El título no puede exceder 200 caracteres.'),
      descripcionEvento: z.string().max(5000, 'La descripción no puede exceder 5000 caracteres.'),
      tipoEvento: z.enum(['TUTORIA', 'REUNION', 'ENTREGA', 'REVISION', 'TALLER', 'OTRO']),
      fecha: z.date().optional(),
      horaInicio: z.string(),
      horaFin: z.string(),
      fechaFinOriginal: z.date().nullable(),
      modalidad: z.enum(['PRESENCIAL', 'VIRTUAL', 'MIXTA']),
      ubicacionLat: z.number().nullable(),
      ubicacionLng: z.number().nullable(),
      ubicacionNombre: z.string().max(255, 'El nombre del lugar no puede exceder 255 caracteres.'),
      linkSesion: z.string().max(500, 'El link no puede exceder 500 caracteres.'),
      rolesDestino: z.array(z.number().int()),
      invitados: z.array(z.number().int()),
      recordatorioActivo: z.boolean(),
      antelacionMinutos: z.number().int().min(0).max(10080),
    })
    .superRefine((values, ctx) => {
      if (values.tituloEvento.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tituloEvento'], message: 'El título no puede estar vacío.' });
      }

      if (mode === 'create' && !Number(values.idProyecto)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['idProyecto'], message: 'Selecciona un proyecto.' });
      }

      if (!values.fecha) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fecha'], message: 'Selecciona la fecha.' });
      }
      if (!HORA_FORMAT.test(values.horaInicio)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['horaInicio'], message: 'Indica la hora de inicio.' });
      }
      if (!HORA_FORMAT.test(values.horaFin)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['horaFin'], message: 'Indica la hora de fin.' });
      }

      const { inicio, fin } = rangoDelFormulario(values);
      if (inicio && fin && fin.getTime() <= inicio.getTime()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['horaFin'],
          message: 'El fin debe ser posterior al inicio.',
        });
      }

      const inicioSinCambios =
        mode === 'edit' &&
        fechaInicioOriginal !== null &&
        inicio !== null &&
        inicio.getTime() === new Date(fechaInicioOriginal).getTime();
      if (inicio && !inicioSinCambios && inicio.getTime() < ahora.getTime()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['horaInicio'],
          message: 'El inicio no puede ser anterior al momento actual.',
        });
      }

      if (requiereUbicacion(values.modalidad) && (values.ubicacionLat === null || values.ubicacionLng === null)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ubicacionLat'],
          message: 'Marca la ubicación de la sesión en el mapa.',
        });
      }

      if (requiereLink(values.modalidad)) {
        const link = values.linkSesion.trim();
        if (link.length === 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['linkSesion'], message: 'Ingresa el link de la sesión.' });
        } else if (!safeExternalHref(link)) {
          // Mismo criterio que decide si el link es clicable en el detalle del evento.
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['linkSesion'],
            message: 'El link debe empezar con http:// o https://.',
          });
        }
      }
    });
}

export function buildEventPayload(
  values: EventFormValues,
  { keepEmptyDescripcion }: { keepEmptyDescripcion: boolean },
): EventPayload {
  const descripcion = values.descripcionEvento.trim();
  const mostrarUbicacion = requiereUbicacion(values.modalidad);
  const mostrarLink = requiereLink(values.modalidad);
  // El schema ya garantizó fechas válidas antes de llegar aquí.
  const { inicio, fin } = rangoDelFormulario(values);
  return {
    tituloEvento: values.tituloEvento.trim(),
    descripcionEvento: keepEmptyDescripcion ? descripcion : descripcion || undefined,
    tipoEvento: values.tipoEvento,
    fechaInicio: inicio!.toISOString(),
    fechaFin: fin!.toISOString(),
    antelacionMinutos: values.recordatorioActivo ? values.antelacionMinutos : 0,
    modalidad: values.modalidad,
    ubicacionLat: mostrarUbicacion && values.ubicacionLat !== null ? values.ubicacionLat : undefined,
    ubicacionLng: mostrarUbicacion && values.ubicacionLng !== null ? values.ubicacionLng : undefined,
    ubicacionNombre: mostrarUbicacion ? values.ubicacionNombre.trim() || undefined : undefined,
    linkSesion: mostrarLink ? values.linkSesion.trim() || undefined : undefined,
    rolesDestino: values.rolesDestino,
    invitados: values.invitados,
  };
}
