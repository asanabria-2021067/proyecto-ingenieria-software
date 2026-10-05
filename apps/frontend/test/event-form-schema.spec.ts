import { describe, expect, it } from 'vitest';
import {
  buildEventFormSchema,
  buildEventPayload,
  combinarFechaHora,
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

describe('buildEventFormSchema (HU-184 T-323)', () => {
  it('acepta un evento virtual completo', () => {
    expect(mensajes(valores())).toEqual({});
  });

  it('título vacío o solo espacios es inválido', () => {
    expect(mensajes(valores({ tituloEvento: '   ' })).tituloEvento).toBe('El título no puede estar vacío.');
  });

  it('al crear exige proyecto', () => {
    expect(mensajes(valores({ idProyecto: '' })).idProyecto).toBe('Selecciona un proyecto.');
  });

  it('al editar no exige proyecto (no se puede cambiar)', () => {
    expect(mensajes(valores({ idProyecto: '' }), { mode: 'edit', ahora: AHORA }).idProyecto).toBeUndefined();
  });

  it('fecha u hora vacías marcan su propio campo', () => {
    const errores = mensajes(valores({ fechaInicio: undefined, horaFin: '' }));
    expect(errores.fechaInicio).toBe('Selecciona la fecha de inicio.');
    expect(errores.horaFin).toBe('Indica la hora de fin.');
  });

  it('fin igual o anterior al inicio es inválido', () => {
    const dia = new Date(2026, 9, 6);
    const errores = mensajes(valores({ fechaInicio: dia, horaInicio: '15:00', fechaFin: dia, horaFin: '14:00' }));
    expect(errores.horaFin).toBe('El fin debe ser posterior al inicio.');
    const iguales = mensajes(valores({ fechaInicio: dia, horaInicio: '15:00', fechaFin: dia, horaFin: '15:00' }));
    expect(iguales.horaFin).toBe('El fin debe ser posterior al inicio.');
  });

  it('inicio en el pasado es inválido al crear', () => {
    const hoy = new Date(2026, 9, 5);
    const errores = mensajes(valores({ fechaInicio: hoy, horaInicio: '08:00', fechaFin: hoy, horaFin: '09:00' }));
    expect(errores.horaInicio).toBe('El inicio no puede ser anterior al momento actual.');
  });

  it('al editar, un inicio pasado que no se movió sigue siendo válido', () => {
    const original = new Date(2026, 9, 5, 8, 0).toISOString();
    const hoy = new Date(2026, 9, 5);
    const errores = mensajes(valores({ fechaInicio: hoy, horaInicio: '08:00', fechaFin: hoy, horaFin: '09:00' }), {
      mode: 'edit',
      fechaInicioOriginal: original,
      ahora: AHORA,
    });
    expect(errores.horaInicio).toBeUndefined();
  });

  it('virtual sin link o con link sin http(s) es inválido', () => {
    expect(mensajes(valores({ linkSesion: '' })).linkSesion).toBe('Ingresa el link de la sesión.');
    expect(mensajes(valores({ linkSesion: 'meet.google.com/abc' })).linkSesion).toBe(
      'El link debe empezar con http:// o https://.',
    );
  });

  it('presencial exige ubicación en el mapa y no exige link', () => {
    const errores = mensajes(valores({ modalidad: 'PRESENCIAL', linkSesion: '' }));
    expect(errores.ubicacionLat).toBe('Marca la ubicación de la sesión en el mapa.');
    expect(errores.linkSesion).toBeUndefined();
  });

  it('mixta exige ubicación y link', () => {
    const errores = mensajes(valores({ modalidad: 'MIXTA', linkSesion: '' }));
    expect(errores.ubicacionLat).toBeDefined();
    expect(errores.linkSesion).toBeDefined();
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

  it('emptyEventForm propone la siguiente hora en punto y una hora de duración', () => {
    const form = emptyEventForm(3, undefined, new Date(2026, 9, 5, 10, 20));
    expect(form.idProyecto).toBe('3');
    expect(form.horaInicio).toBe('11:00');
    expect(form.horaFin).toBe('12:00');
    expect(form.antelacionMinutos).toBe(60);
  });

  it('eventFormFromEvento y buildEventPayload van y vuelven sin perder datos', () => {
    const evento: EventoProyectoDTO = {
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
    };
    const payload = buildEventPayload(eventFormFromEvento(evento), { keepEmptyDescripcion: true });
    expect(payload.fechaInicio).toBe(evento.fechaInicio);
    expect(payload.fechaFin).toBe(evento.fechaFin);
    expect(payload.antelacionMinutos).toBe(30);
    expect(payload.linkSesion).toBe('https://meet.google.com/x');
    expect(payload.ubicacionLat).toBeUndefined();
    expect(payload.descripcionEvento).toBe('');
    expect(payload.rolesDestino).toEqual([2]);
  });
});
