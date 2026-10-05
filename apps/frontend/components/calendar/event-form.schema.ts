import { z } from 'zod';
import type { EventoProyectoDTO, EventPayload, ModalidadEvento } from '@/lib/services/events';

const HORA_FORMAT = /^([01]\d|2[0-3]):[0-5]\d$/;

export const MODALIDAD_OPTIONS: { value: ModalidadEvento; label: string }[] = [
  { value: 'PRESENCIAL', label: 'Presencial' },
  { value: 'VIRTUAL', label: 'Virtual' },
  { value: 'MIXTA', label: 'Mixta' },
];

/** HU-184 (T-323): opciones fijas del recordatorio, en minutos antes del inicio. */
export const RECORDATORIO_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Sin recordatorio' },
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

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Date -> "HH:mm" en hora LOCAL. */
export function toHora(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Día (Date) + "HH:mm" -> instante en hora LOCAL; null si falta alguno o la hora no es válida. */
export function combinarFechaHora(dia: Date | undefined, hora: string): Date | null {
  if (!dia || !HORA_FORMAT.test(hora)) return null;
  const [h, m] = hora.split(':').map(Number);
  return new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), h, m, 0, 0);
}

function soloDia(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export interface EventFormValues {
  idProyecto: string;
  tituloEvento: string;
  descripcionEvento: string;
  fechaInicio: Date | undefined;
  horaInicio: string;
  fechaFin: Date | undefined;
  horaFin: string;
  modalidad: ModalidadEvento;
  ubicacionLat: number | null;
  ubicacionLng: number | null;
  ubicacionNombre: string;
  linkSesion: string;
  rolesDestino: number[];
  antelacionMinutos: number;
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
    fechaInicio: soloDia(base),
    horaInicio: toHora(base),
    fechaFin: soloDia(fin),
    horaFin: toHora(fin),
    modalidad: 'VIRTUAL',
    ubicacionLat: null,
    ubicacionLng: null,
    ubicacionNombre: '',
    linkSesion: '',
    rolesDestino: [],
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
    fechaInicio: soloDia(inicio),
    horaInicio: toHora(inicio),
    fechaFin: soloDia(fin),
    horaFin: toHora(fin),
    modalidad: evento.modalidad,
    ubicacionLat: evento.ubicacionLat,
    ubicacionLng: evento.ubicacionLng,
    ubicacionNombre: evento.ubicacionNombre ?? '',
    linkSesion: evento.linkSesion ?? '',
    rolesDestino: evento.rolesDestino,
    antelacionMinutos: evento.antelacionMinutos,
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
 * inicio no anterior a ahora, ubicación si es presencial/mixta, link
 * http(s) si es virtual/mixta), pero validadas antes de enviar y con el
 * mensaje pegado a su campo.
 */
export function buildEventFormSchema({ mode, fechaInicioOriginal = null, ahora = new Date() }: BuildEventFormSchemaOptions) {
  return z
    .object({
      idProyecto: z.string(),
      tituloEvento: z
        .string()
        .trim()
        .min(1, 'El título no puede estar vacío.')
        .max(200, 'El título no puede exceder 200 caracteres.'),
      descripcionEvento: z.string().max(5000, 'La descripción no puede exceder 5000 caracteres.'),
      fechaInicio: z.date().optional(),
      horaInicio: z.string(),
      fechaFin: z.date().optional(),
      horaFin: z.string(),
      modalidad: z.enum(['PRESENCIAL', 'VIRTUAL', 'MIXTA']),
      ubicacionLat: z.number().nullable(),
      ubicacionLng: z.number().nullable(),
      ubicacionNombre: z.string().max(255, 'El nombre del lugar no puede exceder 255 caracteres.'),
      linkSesion: z.string().max(500, 'El link no puede exceder 500 caracteres.'),
      rolesDestino: z.array(z.number().int()),
      antelacionMinutos: z.number().int().min(0).max(10080),
    })
    .superRefine((values, ctx) => {
      if (mode === 'create' && !Number(values.idProyecto)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['idProyecto'], message: 'Selecciona un proyecto.' });
      }

      if (!values.fechaInicio) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fechaInicio'], message: 'Selecciona la fecha de inicio.' });
      }
      if (!HORA_FORMAT.test(values.horaInicio)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['horaInicio'], message: 'Indica la hora de inicio.' });
      }
      if (!values.fechaFin) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fechaFin'], message: 'Selecciona la fecha de fin.' });
      }
      if (!HORA_FORMAT.test(values.horaFin)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['horaFin'], message: 'Indica la hora de fin.' });
      }

      const inicio = combinarFechaHora(values.fechaInicio, values.horaInicio);
      const fin = combinarFechaHora(values.fechaFin, values.horaFin);
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
        } else if (!isValidHttpUrl(link)) {
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
  const inicio = combinarFechaHora(values.fechaInicio, values.horaInicio)!;
  const fin = combinarFechaHora(values.fechaFin, values.horaFin)!;
  return {
    tituloEvento: values.tituloEvento.trim(),
    descripcionEvento: keepEmptyDescripcion ? descripcion : descripcion || undefined,
    fechaInicio: inicio.toISOString(),
    fechaFin: fin.toISOString(),
    antelacionMinutos: values.antelacionMinutos,
    modalidad: values.modalidad,
    ubicacionLat: mostrarUbicacion && values.ubicacionLat !== null ? values.ubicacionLat : undefined,
    ubicacionLng: mostrarUbicacion && values.ubicacionLng !== null ? values.ubicacionLng : undefined,
    ubicacionNombre: mostrarUbicacion ? values.ubicacionNombre.trim() || undefined : undefined,
    linkSesion: mostrarLink ? values.linkSesion.trim() || undefined : undefined,
    rolesDestino: values.rolesDestino,
  };
}
