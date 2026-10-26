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

/** Autoridad tal como se escribió: `https://[usuario@]host[:puerto]…` (el host entre corchetes si es IPv6). */
const AUTORIDAD_DEL_ENLACE = /^https?:\/\/(?:[^/?#@]+@)?(\[[^\]]+\]|[^/?#:]+)/i;
const ETIQUETA_DE_DOMINIO = /^[a-z\u00a1-\uffff0-9-]+$/i;
const TLD = /^([a-z\u00a1-\uffff]{2,}|xn[a-z0-9-]{2,})$/i;
const OCTETO = /^(0|[1-9]\d{0,2})$/;

function esDominioConTld(host: string): boolean {
  const etiquetas = host.split('.');
  if (etiquetas.length < 2 || !TLD.test(etiquetas[etiquetas.length - 1])) return false;
  return etiquetas.every((e) => e.length > 0 && e.length <= 63 && ETIQUETA_DE_DOMINIO.test(e) && !e.startsWith('-') && !e.endsWith('-'));
}

/**
 * G04 (UI-24): política única del enlace de una sesión, la misma que aplica
 * el backend (`esEnlaceDeSesion` en create-event.dto.ts). Antes el formulario
 * solo exigía http(s) y el backend, además, un dominio real: un enlace como
 * `http://localhost:3000` o `https://intranet/sala` pasaba aquí y volvía como
 * 400 al guardar.
 *  1. URL absoluta http/https con host, sin espacios, caracteres de control ni
 *     invisibles (`safeExternalHref`, contrato OWASP G07).
 *  2. Sin `<` ni `>`.
 *  3. Host real: dominio con TLD (sin guion bajo), una IPv4 o una IPv6 entre
 *     corchetes. No hay excepción de desarrollo para `localhost`.
 */
export function esEnlaceDeSesionValido(valor: string): boolean {
  if (!safeExternalHref(valor) || /[<>]/.test(valor)) return false;
  const host = AUTORIDAD_DEL_ENLACE.exec(valor)?.[1];
  if (!host) return false;
  if (host.startsWith('[')) return true; // IPv6 literal: ya lo validó el analizador de URL.
  const partes = host.split('.');
  if (partes.every((p) => /^\d+$/.test(p))) return partes.length === 4 && partes.every((p) => OCTETO.test(p) && Number(p) <= 255);
  return esDominioConTld(host);
}

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
  /** Día de inicio; por defecto el evento también termina ese día. */
  fecha: Date | undefined;
  horaInicio: string;
  horaFin: string;
  /**
   * G02 (UI-06, F262-07): "Termina otro día". Desmarcado (lo normal), el
   * evento termina en `fecha`; marcado, termina en `fechaFin` (que puede ser
   * el día siguiente para 22:00 → 01:00, o varios días después). Al editar un
   * evento que ya duraba varios días viene marcado con su fin original.
   */
  terminaOtroDia: boolean;
  fechaFin: Date | undefined;
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

/** Lo mínimo para calcular el rango; fechas opcionales porque así las entrega zod. */
type RangoInput = { fecha?: Date; horaInicio: string; horaFin: string; terminaOtroDia: boolean; fechaFin?: Date };

/** Día en que termina el evento según el formulario: `fechaFin` solo si "Termina otro día" está marcado. */
export function diaDeFin(values: Pick<RangoInput, 'fecha' | 'terminaOtroDia' | 'fechaFin'>): Date | undefined {
  return values.terminaOtroDia ? values.fechaFin : values.fecha;
}

/** Inicio y fin reales del formulario, en hora local (fecha + hora, no solo HH:mm). */
export function rangoDelFormulario(values: RangoInput) {
  return {
    inicio: combinarFechaHora(values.fecha, values.horaInicio),
    fin: combinarFechaHora(diaDeFin(values), values.horaFin),
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

/**
 * Hora de inicio propuesta. G03 (UI-27): si el calendario entregó una fecha
 * con hora (celda del mes o vista Día a las 09:00) se respeta tal cual, para
 * que el formulario prometa lo mismo que la pantalla; si esa hora ya pasó o
 * no hay fecha, se propone la siguiente hora en punto a partir de ahora.
 */
export function inicioPropuesto(initialDate: Date | undefined, ahora: Date): Date {
  if (initialDate && initialDate.getTime() >= ahora.getTime()) {
    const base = new Date(initialDate);
    base.setSeconds(0, 0);
    return base;
  }
  const base = new Date(ahora);
  base.setMinutes(0, 0, 0);
  base.setHours(base.getHours() + 1);
  return base;
}

export function emptyEventForm(defaultProjectId?: number, initialDate?: Date, ahora = new Date()): EventFormValues {
  const base = inicioPropuesto(initialDate, ahora);
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
    terminaOtroDia: false,
    fechaFin: undefined,
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

/** Campos de un evento que el formulario necesita (una reunión de Administración también los tiene). */
export type EventoParaFormulario = Pick<
  EventoProyectoDTO,
  | 'idProyecto'
  | 'tituloEvento'
  | 'descripcionEvento'
  | 'tipoEvento'
  | 'fechaInicio'
  | 'fechaFin'
  | 'modalidad'
  | 'ubicacionLat'
  | 'ubicacionLng'
  | 'ubicacionNombre'
  | 'linkSesion'
  | 'rolesDestino'
  | 'invitados'
  | 'antelacionMinutos'
>;

export function eventFormFromEvento(evento: EventoParaFormulario): EventFormValues {
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
    terminaOtroDia: !mismoDia(inicio, fin),
    fechaFin: mismoDia(inicio, fin) ? undefined : soloDia(fin),
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
  /**
   * G03 (UI-26): reloj de la validación. Por defecto se lee en cada
   * ejecución del esquema (nunca se congela al construirlo): un diálogo
   * abierto un buen rato valida contra la hora real, como el backend.
   * Un `Date` fijo sirve para pruebas deterministas.
   */
  ahora?: Date | (() => Date);
  /**
   * Un evento de proyecto exige elegir su proyecto al crearlo. Una reunión de
   * Administración no tiene uno solo: convoca a varios con su propio campo.
   */
  exigirProyecto?: boolean;
}

/**
 * HU-184 (T-323): única fuente de validación del diálogo de evento. Mismas
 * reglas que EventsService/CreateEventDto en el backend (fin > inicio,
 * inicio no anterior a ahora, ubicación si es presencial/híbrida, link
 * http(s) si es virtual/híbrida), pero validadas antes de enviar y con el
 * mensaje pegado a su campo.
 */
export function buildEventFormSchema({ mode, fechaInicioOriginal = null, ahora = () => new Date(), exigirProyecto = true }: BuildEventFormSchemaOptions) {
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
      terminaOtroDia: z.boolean(),
      fechaFin: z.date().optional(),
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

      if (exigirProyecto && mode === 'create' && !Number(values.idProyecto)) {
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

      if (values.terminaOtroDia) {
        if (!values.fechaFin) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fechaFin'], message: 'Selecciona la fecha de fin.' });
        } else if (values.fecha && soloDia(values.fechaFin).getTime() < soloDia(values.fecha).getTime()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['fechaFin'],
            message: 'La fecha de fin no puede ser anterior a la de inicio.',
          });
        }
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
      const momento = typeof ahora === 'function' ? ahora() : ahora;
      if (inicio && !inicioSinCambios && inicio.getTime() < momento.getTime()) {
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
        } else if (!/^https?:\/\//i.test(link)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['linkSesion'],
            message: 'El link debe empezar con http:// o https://.',
          });
        } else if (!esEnlaceDeSesionValido(link)) {
          // G04 (UI-24): mismo criterio que el backend, para que el error salga aquí y no como 400 al guardar.
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['linkSesion'],
            message: 'El link no parece válido. Revisa el dominio, por ejemplo https://meet.google.com/abc-defg-hij.',
          });
        }
      }
    });
}

/**
 * `keepEmptyDescripcion` distingue edición (PATCH, `true`) de creación
 * (`false`). G04 (UI-35): al editar, lo que la modalidad elegida ya no usa
 * (el lugar en un evento virtual, el enlace en uno presencial) se envía como
 * `null` explícito para que el backend lo borre; antes se omitía y el evento
 * conservaba coordenadas o enlace huérfanos. Al crear se sigue omitiendo.
 */
export function buildEventPayload(
  values: EventFormValues,
  { keepEmptyDescripcion }: { keepEmptyDescripcion: boolean },
): EventPayload {
  const descripcion = values.descripcionEvento.trim();
  const mostrarUbicacion = requiereUbicacion(values.modalidad);
  const mostrarLink = requiereLink(values.modalidad);
  const sinValor = keepEmptyDescripcion ? null : undefined;
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
    ubicacionLat: mostrarUbicacion ? (values.ubicacionLat ?? undefined) : sinValor,
    ubicacionLng: mostrarUbicacion ? (values.ubicacionLng ?? undefined) : sinValor,
    // El nombre del lugar es opcional: vaciarlo al editar también lo borra.
    ubicacionNombre: mostrarUbicacion ? values.ubicacionNombre.trim() || sinValor : sinValor,
    linkSesion: mostrarLink ? values.linkSesion.trim() || undefined : sinValor,
    rolesDestino: values.rolesDestino,
    invitados: values.invitados,
  };
}
