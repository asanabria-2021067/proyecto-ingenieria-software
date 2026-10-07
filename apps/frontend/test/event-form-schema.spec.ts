import { describe, expect, it } from 'vitest';
import {
  buildEventFormSchema,
  buildEventPayload,
  combinarFechaHora,
  duracionTexto,
  emptyEventForm,
  eventFormFromEvento,
  type EventFormValues,
} from '../components/calendar/event-form.schema';
import type { EventoProyectoDTO } from '../lib/services/events';

const AHORA = new Date(2026, 9, 5, 10, 0);

function valores(overrides: Partial<EventFormValues> = {}): EventFormValues {
  return {
    ...emptyEventForm(1, undefined, AHORA),
    tituloEvento: 'Reunión de avance',
    linkSesion: 'https://meet.google.com/abc',
    ...overrides,
  };
}

function mensajes(values: EventFormValues, opts: Parameters<typeof buildEventFormSchema>[0] = { mode: 'create', ahora: AHORA }) {
  const result = buildEventFormSchema(opts).safeParse(values);
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]));
}

function evento(overrides: Partial<EventoProyectoDTO> = {}): EventoProyectoDTO {
  return {
    idEvento: 9,
    idProyecto: 1,
    tituloEvento: 'Demo',
    descripcionEvento: null,
    fechaInicio: new Date(2026, 9, 10, 9, 0).toISOString(),
    fechaFin: new Date(2026, 9, 10, 10, 30).toISOString(),
    antelacionMinutos: 30,
    modalidad: 'VIRTUAL',
    ubicacionLat: null,
    ubicacionLng: null,
    ubicacionNombre: null,
    linkSesion: 'https://meet.google.com/x',
    rolesDestino: [2],
    tipoEvento: 'TUTORIA',
    invitados: [4, 5],
    ...overrides,
  };
}

describe('buildEventFormSchema (HU-184 T-323)', () => {
  it('acepta un evento virtual completo', () => {
    expect(mensajes(valores())).toEqual({});
  });

  it('título vacío o solo espacios es inválido', () => {
    expect(mensajes(valores({ tituloEvento: '   ' })).tituloEvento).toBe('El título no puede estar vacío.');
  });

  it('con todo vacío reporta título, fecha y horas a la vez', () => {
    const errores = mensajes(valores({ tituloEvento: '', fecha: undefined, horaInicio: '', horaFin: '' }));
    expect(errores.tituloEvento).toBeDefined();
    expect(errores.fecha).toBe('Selecciona la fecha.');
    expect(errores.horaInicio).toBe('Indica la hora de inicio.');
    expect(errores.horaFin).toBe('Indica la hora de fin.');
  });

  it('al crear exige proyecto; al editar no', () => {
    expect(mensajes(valores({ idProyecto: '' })).idProyecto).toBe('Selecciona un proyecto.');
    expect(mensajes(valores({ idProyecto: '' }), { mode: 'edit', ahora: AHORA }).idProyecto).toBeUndefined();
  });

  it('hora de fin igual o anterior a la de inicio es inválida', () => {
    const dia = new Date(2026, 9, 6);
    expect(mensajes(valores({ fecha: dia, horaInicio: '15:00', horaFin: '14:00' })).horaFin).toBe(
      'El fin debe ser posterior al inicio.',
    );
    expect(mensajes(valores({ fecha: dia, horaInicio: '15:00', horaFin: '15:00' })).horaFin).toBe(
      'El fin debe ser posterior al inicio.',
    );
  });

  it('inicio en el pasado es inválido al crear', () => {
    const hoy = new Date(2026, 9, 5);
    expect(mensajes(valores({ fecha: hoy, horaInicio: '08:00', horaFin: '09:00' })).horaInicio).toBe(
      'El inicio no puede ser anterior al momento actual.',
    );
  });

  it('al editar, un inicio pasado que no se movió sigue siendo válido', () => {
    const original = new Date(2026, 9, 5, 8, 0).toISOString();
    const hoy = new Date(2026, 9, 5);
    const errores = mensajes(valores({ fecha: hoy, horaInicio: '08:00', horaFin: '09:00' }), {
      mode: 'edit',
      fechaInicioOriginal: original,
      ahora: AHORA,
    });
    expect(errores.horaInicio).toBeUndefined();
  });

  it('un evento de varios días conserva su día de fin: una hora de fin "menor" sigue siendo válida', () => {
    const errores = mensajes(
      valores({ fecha: new Date(2026, 9, 6), horaInicio: '22:00', horaFin: '01:00', fechaFinOriginal: new Date(2026, 9, 7) }),
    );
    expect(errores.horaFin).toBeUndefined();
  });

  it('virtual sin link o con link sin http(s) es inválido', () => {
    expect(mensajes(valores({ linkSesion: '' })).linkSesion).toBe('Ingresa el link de la sesión.');
    expect(mensajes(valores({ linkSesion: 'meet.google.com/abc' })).linkSesion).toBe(
      'El link debe empezar con http:// o https://.',
    );
  });

  it('presencial exige ubicación en el mapa y no exige link; híbrida exige ambos', () => {
    const presencial = mensajes(valores({ modalidad: 'PRESENCIAL', linkSesion: '' }));
    expect(presencial.ubicacionLat).toBe('Marca la ubicación de la sesión en el mapa.');
    expect(presencial.linkSesion).toBeUndefined();
    const hibrida = mensajes(valores({ modalidad: 'MIXTA', linkSesion: '' }));
    expect(hibrida.ubicacionLat).toBeDefined();
    expect(hibrida.linkSesion).toBeDefined();
  });
});

describe('helpers del formulario de evento', () => {
  it('combinarFechaHora arma el instante en hora local', () => {
    const fecha = combinarFechaHora(new Date(2026, 9, 6), '14:30');
    expect(fecha?.getHours()).toBe(14);
    expect(fecha?.getMinutes()).toBe(30);
    expect(combinarFechaHora(undefined, '14:30')).toBeNull();
    expect(combinarFechaHora(new Date(2026, 9, 6), '25:00')).toBeNull();
  });

  it('emptyEventForm propone la siguiente hora en punto, una hora de duración, reunión y recordatorio de 1 h', () => {
    const form = emptyEventForm(3, undefined, new Date(2026, 9, 5, 10, 20));
    expect(form.idProyecto).toBe('3');
    expect(form.horaInicio).toBe('11:00');
    expect(form.horaFin).toBe('12:00');
    expect(form.tipoEvento).toBe('REUNION');
    expect(form.recordatorioActivo).toBe(true);
    expect(form.antelacionMinutos).toBe(60);
    expect(form.invitados).toEqual([]);
  });

  it('emptyEventForm a las 22:xx recorta el fin a las 23:59 del mismo día', () => {
    const form = emptyEventForm(1, undefined, new Date(2026, 9, 5, 22, 10));
    expect(form.horaInicio).toBe('23:00');
    expect(form.horaFin).toBe('23:59');
  });

  it('duracionTexto da el chip "1h 30m", "45m" o null si el rango no es válido', () => {
    const dia = new Date(2026, 9, 6);
    expect(duracionTexto({ fecha: dia, horaInicio: '09:00', horaFin: '10:30', fechaFinOriginal: null })).toBe('1h 30m');
    expect(duracionTexto({ fecha: dia, horaInicio: '09:00', horaFin: '09:45', fechaFinOriginal: null })).toBe('45m');
    expect(duracionTexto({ fecha: dia, horaInicio: '09:00', horaFin: '11:00', fechaFinOriginal: null })).toBe('2h');
    expect(duracionTexto({ fecha: dia, horaInicio: '10:00', horaFin: '09:00', fechaFinOriginal: null })).toBeNull();
  });

  it('eventFormFromEvento y buildEventPayload van y vuelven sin perder datos', () => {
    const original = evento();
    const payload = buildEventPayload(eventFormFromEvento(original), { keepEmptyDescripcion: true });
    expect(payload.fechaInicio).toBe(original.fechaInicio);
    expect(payload.fechaFin).toBe(original.fechaFin);
    expect(payload.antelacionMinutos).toBe(30);
    expect(payload.tipoEvento).toBe('TUTORIA');
    expect(payload.invitados).toEqual([4, 5]);
    expect(payload.rolesDestino).toEqual([2]);
    expect(payload.linkSesion).toBe('https://meet.google.com/x');
    expect(payload.ubicacionLat).toBeUndefined();
    expect(payload.descripcionEvento).toBe('');
  });

  it('un evento viejo de varios días conserva su fin al guardar', () => {
    const original = evento({
      fechaInicio: new Date(2026, 9, 10, 9, 0).toISOString(),
      fechaFin: new Date(2026, 9, 12, 17, 0).toISOString(),
    });
    const form = eventFormFromEvento(original);
    expect(form.fechaFinOriginal).toEqual(new Date(2026, 9, 12));
    expect(buildEventPayload(form, { keepEmptyDescripcion: true }).fechaFin).toBe(original.fechaFin);
  });

  it('recordatorio desmarcado se envía como 0; al cargar un evento con 0 queda desmarcado', () => {
    expect(buildEventPayload(valores({ recordatorioActivo: false }), { keepEmptyDescripcion: false }).antelacionMinutos).toBe(0);
    const form = eventFormFromEvento(evento({ antelacionMinutos: 0 }));
    expect(form.recordatorioActivo).toBe(false);
    expect(form.antelacionMinutos).toBe(60);
  });
});
