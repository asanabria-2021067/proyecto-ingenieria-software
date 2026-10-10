import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildEventFormSchema,
  buildEventPayload,
  combinarFechaHora,
  duracionTexto,
  emptyEventForm,
  esEnlaceDeSesionValido,
  eventFormFromEvento,
  inicioPropuesto,
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

  // G02-C07: antes el día de fin solo existía como `fechaFinOriginal` oculto; ahora es "Termina otro día" + fechaFin.
  it('con "Termina otro día" una hora de fin "menor" es válida porque el fin cae en la fecha siguiente', () => {
    const errores = mensajes(
      valores({ fecha: new Date(2026, 9, 6), horaInicio: '22:00', horaFin: '01:00', terminaOtroDia: true, fechaFin: new Date(2026, 9, 7) }),
    );
    expect(errores.horaFin).toBeUndefined();
    expect(errores.fechaFin).toBeUndefined();
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
    expect(duracionTexto({ fecha: dia, horaInicio: '09:00', horaFin: '10:30', terminaOtroDia: false })).toBe('1h 30m');
    expect(duracionTexto({ fecha: dia, horaInicio: '09:00', horaFin: '09:45', terminaOtroDia: false })).toBe('45m');
    expect(duracionTexto({ fecha: dia, horaInicio: '09:00', horaFin: '11:00', terminaOtroDia: false })).toBe('2h');
    expect(duracionTexto({ fecha: dia, horaInicio: '10:00', horaFin: '09:00', terminaOtroDia: false })).toBeNull();
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
    // G04-C14 (clase B): antes se exigía `undefined` (omitir). Al editar un evento virtual, el lugar
    // que la modalidad no usa viaja como null explícito para que el backend limpie datos huérfanos.
    expect(payload.ubicacionLat).toBeNull();
    expect(payload.descripcionEvento).toBe('');
  });

  it('un evento viejo de varios días conserva su fin al guardar', () => {
    const original = evento({
      fechaInicio: new Date(2026, 9, 10, 9, 0).toISOString(),
      fechaFin: new Date(2026, 9, 12, 17, 0).toISOString(),
    });
    const form = eventFormFromEvento(original);
    expect(form.terminaOtroDia).toBe(true);
    expect(form.fechaFin).toEqual(new Date(2026, 9, 12));
    expect(buildEventPayload(form, { keepEmptyDescripcion: true }).fechaFin).toBe(original.fechaFin);
  });

  it('recordatorio desmarcado se envía como 0; al cargar un evento con 0 queda desmarcado', () => {
    expect(buildEventPayload(valores({ recordatorioActivo: false }), { keepEmptyDescripcion: false }).antelacionMinutos).toBe(0);
    const form = eventFormFromEvento(evento({ antelacionMinutos: 0 }));
    expect(form.recordatorioActivo).toBe(false);
    expect(form.antelacionMinutos).toBe(60);
  });
});

describe('límites de ubicación: nombre y coordenadas (G02-C03, UI-03/UI-25)', () => {
  const presencialConPunto = (overrides: Partial<EventFormValues> = {}) =>
    valores({ modalidad: 'PRESENCIAL', linkSesion: '', ubicacionLat: 14.6, ubicacionLng: -90.5, ...overrides });

  it.each([
    [0, true],
    [254, true],
    [255, true],
    [256, false],
    [300, false],
  ])('nombre del lugar de %i caracteres → válido: %s', (largo, valido) => {
    const errores = mensajes(presencialConPunto({ ubicacionNombre: 'x'.repeat(largo) }));
    if (valido) {
      expect(errores.ubicacionNombre).toBeUndefined();
    } else {
      expect(errores.ubicacionNombre).toBe('El nombre del lugar no puede exceder 255 caracteres.');
    }
    // El error de nombre nunca se confunde con el de título ni con el del punto.
    expect(errores.tituloEvento).toBeUndefined();
    expect(errores.ubicacionLat).toBeUndefined();
  });

  it('el nombre largo y el punto ausente se reportan a la vez, cada uno en su campo', () => {
    const errores = mensajes(valores({ modalidad: 'PRESENCIAL', linkSesion: '', ubicacionNombre: 'x'.repeat(300) }));
    expect(errores.ubicacionNombre).toBe('El nombre del lugar no puede exceder 255 caracteres.');
    expect(errores.ubicacionLat).toBe('Marca la ubicación de la sesión en el mapa.');
  });

  it.each([
    ['PRESENCIAL', true],
    ['MIXTA', true],
    ['VIRTUAL', false],
  ] as const)('%s exige punto en el mapa: %s', (modalidad, exige) => {
    const sinPunto = mensajes(valores({ modalidad, linkSesion: 'https://meet.google.com/x', ubicacionLat: null, ubicacionLng: null }));
    expect(sinPunto.ubicacionLat === undefined).toBe(!exige);
    const conPunto = mensajes(valores({ modalidad, linkSesion: 'https://meet.google.com/x', ubicacionLat: 14.6, ubicacionLng: -90.5 }));
    expect(conPunto.ubicacionLat).toBeUndefined();
  });

  it('solo una de las dos coordenadas no basta', () => {
    expect(mensajes(presencialConPunto({ ubicacionLng: null })).ubicacionLat).toBeDefined();
    expect(mensajes(presencialConPunto({ ubicacionLat: null })).ubicacionLat).toBeDefined();
  });

  it('en VIRTUAL el nombre del lugar no se valida ni se envía', () => {
    const virtual = valores({ ubicacionNombre: 'x'.repeat(300) });
    expect(mensajes(virtual).ubicacionNombre).toBe('El nombre del lugar no puede exceder 255 caracteres.');
    // La longitud se valida siempre (dato del formulario), pero el payload virtual no lleva ubicación.
    const payload = buildEventPayload(valores({ ubicacionNombre: 'Salón' }), { keepEmptyDescripcion: false });
    expect(payload.ubicacionNombre).toBeUndefined();
    expect(payload.ubicacionLat).toBeUndefined();
  });

  it('el payload presencial envía nombre recortado por el formulario y coordenadas tal cual', () => {
    const payload = buildEventPayload(presencialConPunto({ ubicacionNombre: `  ${'y'.repeat(255)}  ` }), { keepEmptyDescripcion: false });
    expect(payload.ubicacionNombre).toHaveLength(255);
    expect(payload.ubicacionLat).toBe(14.6);
    expect(payload.ubicacionLng).toBe(-90.5);
  });
});

describe('fecha de fin opcional: eventos que cruzan medianoche o duran varios días (G02-C07, UI-06/F262-07)', () => {
  const inicio = new Date(2026, 9, 6);

  it('sin "Termina otro día" el evento es de un solo día: fin > inicio válido, fin ≤ inicio inválido', () => {
    expect(mensajes(valores({ fecha: inicio, horaInicio: '09:00', horaFin: '10:00' }))).toEqual({});
    expect(mensajes(valores({ fecha: inicio, horaInicio: '10:00', horaFin: '09:00' })).horaFin).toBe('El fin debe ser posterior al inicio.');
    expect(mensajes(valores({ fecha: inicio, horaInicio: '22:00', horaFin: '01:00' })).horaFin).toBe('El fin debe ser posterior al inicio.');
  });

  it('22:00 del día 1 → 01:00 del día 2 es válido y se serializa con fecha y hora completas en hora local', () => {
    const form = valores({ fecha: inicio, horaInicio: '22:00', horaFin: '01:00', terminaOtroDia: true, fechaFin: new Date(2026, 9, 7) });
    expect(mensajes(form)).toEqual({});
    const payload = buildEventPayload(form, { keepEmptyDescripcion: false });
    expect(payload.fechaInicio).toBe(new Date(2026, 9, 6, 22, 0).toISOString());
    expect(payload.fechaFin).toBe(new Date(2026, 9, 7, 1, 0).toISOString());
  });

  it('un evento de dos días o más es válido y conserva ambas fechas', () => {
    const form = valores({ fecha: inicio, horaInicio: '09:00', horaFin: '17:00', terminaOtroDia: true, fechaFin: new Date(2026, 9, 8) });
    expect(mensajes(form)).toEqual({});
    const payload = buildEventPayload(form, { keepEmptyDescripcion: false });
    expect(new Date(payload.fechaFin).getTime() - new Date(payload.fechaInicio).getTime()).toBe((48 + 8) * 60 * 60 * 1000);
  });

  it('con "Termina otro día" marcado hay que elegir la fecha de fin, y no puede ser anterior a la de inicio', () => {
    expect(mensajes(valores({ fecha: inicio, terminaOtroDia: true, fechaFin: undefined })).fechaFin).toBe('Selecciona la fecha de fin.');
    expect(mensajes(valores({ fecha: inicio, terminaOtroDia: true, fechaFin: new Date(2026, 9, 5) })).fechaFin).toBe(
      'La fecha de fin no puede ser anterior a la de inicio.',
    );
  });

  it('la misma fecha de fin que la de inicio se valida como un solo día (fin ≤ inicio inválido)', () => {
    const errores = mensajes(valores({ fecha: inicio, horaInicio: '10:00', horaFin: '09:00', terminaOtroDia: true, fechaFin: inicio }));
    expect(errores.fechaFin).toBeUndefined();
    expect(errores.horaFin).toBe('El fin debe ser posterior al inicio.');
  });

  it('una fecha de fin que queda sin usar (desmarcado) no afecta: el fin vuelve al día de inicio', () => {
    const form = valores({ fecha: inicio, horaInicio: '09:00', horaFin: '10:00', terminaOtroDia: false, fechaFin: new Date(2026, 9, 9) });
    expect(mensajes(form)).toEqual({});
    expect(buildEventPayload(form, { keepEmptyDescripcion: false }).fechaFin).toBe(new Date(2026, 9, 6, 10, 0).toISOString());
  });

  it('eventFormFromEvento marca "Termina otro día" solo cuando el evento no termina el mismo día local', () => {
    const unDia = eventFormFromEvento(evento());
    expect(unDia.terminaOtroDia).toBe(false);
    expect(unDia.fechaFin).toBeUndefined();
    const nocturno = eventFormFromEvento(
      evento({ fechaInicio: new Date(2026, 9, 10, 22, 0).toISOString(), fechaFin: new Date(2026, 9, 11, 1, 0).toISOString() }),
    );
    expect(nocturno.terminaOtroDia).toBe(true);
    expect(nocturno.fechaFin).toEqual(new Date(2026, 9, 11));
    expect(nocturno.horaFin).toBe('01:00');
    expect(duracionTexto(nocturno)).toBe('3h');
  });
});

describe('matriz de creación y edición de varios días (G02-C10, UI-06/T-325)', () => {
  const dia6 = new Date(2026, 9, 6);
  const dia7 = new Date(2026, 9, 7);

  it.each([
    ['día siguiente con hora menor (22:00 → 01:00)', { horaInicio: '22:00', horaFin: '01:00', terminaOtroDia: true, fechaFin: dia7 }, true],
    ['día siguiente, misma hora (24 h exactas)', { horaInicio: '09:00', horaFin: '09:00', terminaOtroDia: true, fechaFin: dia7 }, true],
    ['dos días completos', { horaInicio: '09:00', horaFin: '17:00', terminaOtroDia: true, fechaFin: new Date(2026, 9, 8) }, true],
    ['marcado sin fecha de fin', { horaInicio: '09:00', horaFin: '10:00', terminaOtroDia: true, fechaFin: undefined }, false],
    ['misma fecha de fin y misma hora (duración cero)', { horaInicio: '09:00', horaFin: '09:00', terminaOtroDia: true, fechaFin: dia6 }, false],
    ['fecha de fin anterior', { horaInicio: '09:00', horaFin: '10:00', terminaOtroDia: true, fechaFin: new Date(2026, 9, 5) }, false],
    ['un día normal', { horaInicio: '09:00', horaFin: '10:00', terminaOtroDia: false, fechaFin: undefined }, true],
  ] as const)('%s → válido: %s', (_caso, campos, valido) => {
    const errores = mensajes(valores({ fecha: dia6, ...campos }));
    expect(Object.keys(errores).length === 0).toBe(valido);
  });

  it('al activar la opción no se pierden los demás mensajes (título vacío y fecha de fin ausente a la vez)', () => {
    const errores = mensajes(valores({ fecha: dia6, tituloEvento: '', terminaOtroDia: true, fechaFin: undefined }));
    expect(errores.tituloEvento).toBe('El título no puede estar vacío.');
    expect(errores.fechaFin).toBe('Selecciona la fecha de fin.');
  });

  it('en edición, un evento histórico de varios días con inicio en el pasado sigue siendo válido mientras no se mueva el inicio', () => {
    const original = evento({
      fechaInicio: new Date(2026, 9, 1, 22, 0).toISOString(),
      fechaFin: new Date(2026, 9, 3, 1, 0).toISOString(),
    });
    const form = eventFormFromEvento(original);
    const errores = mensajes({ ...form, tituloEvento: 'Renombrado' }, { mode: 'edit', fechaInicioOriginal: original.fechaInicio, ahora: AHORA });
    expect(errores).toEqual({});
    const payload = buildEventPayload({ ...form, tituloEvento: 'Renombrado' }, { keepEmptyDescripcion: true });
    expect(payload.fechaInicio).toBe(original.fechaInicio);
    expect(payload.fechaFin).toBe(original.fechaFin);
  });

  it('la serialización ISO es la misma que al volver a cargar el evento (ida y vuelta sin corrimiento, hora local)', () => {
    const form = valores({ fecha: dia6, horaInicio: '23:30', horaFin: '00:30', terminaOtroDia: true, fechaFin: dia7 });
    const payload = buildEventPayload(form, { keepEmptyDescripcion: false });
    const recargado = eventFormFromEvento(evento({ fechaInicio: payload.fechaInicio, fechaFin: payload.fechaFin }));
    expect(recargado).toMatchObject({ fecha: dia6, horaInicio: '23:30', horaFin: '00:30', terminaOtroDia: true, fechaFin: dia7 });
  });
});

describe('validación del inicio contra el reloj vivo (G03-C03, UI-26)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const dia5 = new Date(2026, 9, 5);

  it('un esquema construido a las 10:00 rechaza a las 11:00 un inicio de 10:30 que al abrir era válido', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 5, 10, 0));
    const schema = buildEventFormSchema({ mode: 'create' });
    const form = valores({ fecha: dia5, horaInicio: '10:30', horaFin: '11:30' });

    expect(schema.safeParse(form).success).toBe(true);

    vi.setSystemTime(new Date(2026, 9, 5, 11, 0));
    const resultado = schema.safeParse(form);
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues.map((i) => [i.path.join('.'), i.message])).toContainEqual([
      'horaInicio',
      'El inicio no puede ser anterior al momento actual.',
    ]);
  });

  it('cruzar un minuto con el diálogo abierto no produce falsos positivos: 10:31 sigue siendo válido a las 10:30:59', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 5, 10, 0));
    const schema = buildEventFormSchema({ mode: 'create' });
    const form = valores({ fecha: dia5, horaInicio: '10:31', horaFin: '11:30' });

    vi.setSystemTime(new Date(2026, 9, 5, 10, 30, 59));
    expect(schema.safeParse(form).success).toBe(true);
    vi.setSystemTime(new Date(2026, 9, 5, 10, 31, 1));
    expect(schema.safeParse(form).success).toBe(false);
  });

  it('acepta un reloj inyectado como función (se consulta en cada validación) o como Date fijo', () => {
    let hora = new Date(2026, 9, 5, 10, 0);
    const schema = buildEventFormSchema({ mode: 'create', ahora: () => hora });
    const form = valores({ fecha: dia5, horaInicio: '10:30', horaFin: '11:30' });
    expect(schema.safeParse(form).success).toBe(true);
    hora = new Date(2026, 9, 5, 12, 0);
    expect(schema.safeParse(form).success).toBe(false);
    expect(buildEventFormSchema({ mode: 'create', ahora: new Date(2026, 9, 5, 12, 0) }).safeParse(form).success).toBe(false);
  });

  it('en edición, cambiar el título de un evento cuyo inicio ya pasó sigue la política existente (válido si el inicio no se mueve)', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 5, 10, 0));
    const original = evento({ fechaInicio: new Date(2026, 9, 5, 8, 0).toISOString(), fechaFin: new Date(2026, 9, 5, 9, 0).toISOString() });
    const schema = buildEventFormSchema({ mode: 'edit', fechaInicioOriginal: original.fechaInicio });
    const form = eventFormFromEvento(original);

    vi.setSystemTime(new Date(2026, 9, 5, 15, 0));
    expect(schema.safeParse({ ...form, tituloEvento: 'Renombrado' }).success).toBe(true);
    // Mover el inicio dentro del pasado sí se rechaza, contra la hora actual.
    const movido = schema.safeParse({ ...form, horaInicio: '08:30' });
    expect(movido.success).toBe(false);
  });
});

describe('hora propuesta coherente con la fecha elegida (G03-C04, UI-27)', () => {
  const ahora = new Date(2026, 9, 5, 10, 20);

  it('abrir desde una celda a las 09:00 de un día futuro propone exactamente 09:00–10:00 de ese día', () => {
    const form = emptyEventForm(1, new Date(2026, 9, 8, 9, 0), ahora);
    expect(form.fecha).toEqual(new Date(2026, 9, 8));
    expect(form.horaInicio).toBe('09:00');
    expect(form.horaFin).toBe('10:00');
    expect(form.terminaOtroDia).toBe(false);
  });

  it('respeta una hora con minutos (vista Día a las 14:30) sin redondearla', () => {
    const form = emptyEventForm(1, new Date(2026, 9, 8, 14, 30), ahora);
    expect(form.horaInicio).toBe('14:30');
    expect(form.horaFin).toBe('15:30');
  });

  it('sin fecha inicial propone la siguiente hora en punto a partir de ahora (nunca el pasado)', () => {
    const form = emptyEventForm(1, undefined, ahora);
    expect(form.fecha).toEqual(new Date(2026, 9, 5));
    expect(form.horaInicio).toBe('11:00');
    expect(form.horaFin).toBe('12:00');
    expect(buildEventFormSchema({ mode: 'create', ahora }).safeParse({ ...form, tituloEvento: 'x', linkSesion: 'https://meet.google.com/x' }).success).toBe(true);
  });

  it('si la fecha elegida ya pasó (hoy a las 09:00 siendo las 10:20), cae en el siguiente hueco válido en vez de sugerir el pasado', () => {
    const form = emptyEventForm(1, new Date(2026, 9, 5, 9, 0), ahora);
    expect(form.fecha).toEqual(new Date(2026, 9, 5));
    expect(form.horaInicio).toBe('11:00');
    expect(form.horaFin).toBe('12:00');
  });

  it('una propuesta a las 23:30 recorta el fin a las 23:59 del mismo día', () => {
    const form = emptyEventForm(1, new Date(2026, 9, 8, 23, 30), ahora);
    expect(form.horaInicio).toBe('23:30');
    expect(form.horaFin).toBe('23:59');
  });

  it('inicioPropuesto es el único punto de decisión: futuro se respeta, pasado o ausente va a la siguiente hora', () => {
    expect(inicioPropuesto(new Date(2026, 9, 5, 10, 20), ahora)).toEqual(new Date(2026, 9, 5, 10, 20));
    expect(inicioPropuesto(new Date(2026, 9, 5, 10, 19), ahora)).toEqual(new Date(2026, 9, 5, 11, 0));
    expect(inicioPropuesto(undefined, ahora)).toEqual(new Date(2026, 9, 5, 11, 0));
  });

  it('al editar, las horas del evento se cargan tal cual y no se tocan por la propuesta', () => {
    const form = eventFormFromEvento(evento({ fechaInicio: new Date(2026, 9, 1, 8, 0).toISOString(), fechaFin: new Date(2026, 9, 1, 9, 15).toISOString() }));
    expect(form.horaInicio).toBe('08:00');
    expect(form.horaFin).toBe('09:15');
  });
});

describe('metadatos de modalidad obsoletos al editar (G04-C14, UI-35)', () => {
  const dia = new Date(2030, 9, 6);
  const base = { fecha: dia, horaInicio: '09:00', horaFin: '10:00' };
  const conLugarYEnlace = { ubicacionLat: 14.6, ubicacionLng: -90.5, ubicacionNombre: 'Edificio CIT', linkSesion: 'https://meet.google.com/abc' };

  it('PRESENCIAL → VIRTUAL al editar: lat, lng y nombre viajan como null explícito y el enlace se conserva', () => {
    const payload = buildEventPayload(valores({ ...base, ...conLugarYEnlace, modalidad: 'VIRTUAL' }), { keepEmptyDescripcion: true });
    expect(payload).toMatchObject({ modalidad: 'VIRTUAL', ubicacionLat: null, ubicacionLng: null, ubicacionNombre: null, linkSesion: 'https://meet.google.com/abc' });
    // null sobrevive a JSON (undefined se perdería y el backend no limpiaría nada).
    expect(JSON.parse(JSON.stringify(payload))).toMatchObject({ ubicacionLat: null, ubicacionLng: null, ubicacionNombre: null });
  });

  it('VIRTUAL → PRESENCIAL al editar: el enlace viaja como null y el lugar con sus coordenadas', () => {
    const payload = buildEventPayload(valores({ ...base, ...conLugarYEnlace, modalidad: 'PRESENCIAL' }), { keepEmptyDescripcion: true });
    expect(payload).toMatchObject({ modalidad: 'PRESENCIAL', linkSesion: null, ubicacionLat: 14.6, ubicacionLng: -90.5, ubicacionNombre: 'Edificio CIT' });
  });

  it('MIXTA conserva lugar y enlace: nada se limpia', () => {
    const payload = buildEventPayload(valores({ ...base, ...conLugarYEnlace, modalidad: 'MIXTA' }), { keepEmptyDescripcion: true });
    expect(payload).toMatchObject({ modalidad: 'MIXTA', ...conLugarYEnlace });
    expect(Object.values(payload)).not.toContain(null);
  });

  it('vaciar el nombre del lugar al editar un presencial lo borra (null) sin tocar las coordenadas', () => {
    const payload = buildEventPayload(valores({ ...base, ...conLugarYEnlace, modalidad: 'PRESENCIAL', ubicacionNombre: '   ' }), { keepEmptyDescripcion: true });
    expect(payload).toMatchObject({ ubicacionNombre: null, ubicacionLat: 14.6, ubicacionLng: -90.5 });
  });

  it('al crear no se envía ningún null: lo que no aplica se omite, como antes', () => {
    for (const modalidad of ['VIRTUAL', 'PRESENCIAL', 'MIXTA'] as const) {
      const payload = buildEventPayload(valores({ ...base, ...conLugarYEnlace, modalidad }), { keepEmptyDescripcion: false });
      expect(Object.values(payload)).not.toContain(null);
    }
    const virtual = JSON.parse(JSON.stringify(buildEventPayload(valores({ ...base, ...conLugarYEnlace, modalidad: 'VIRTUAL' }), { keepEmptyDescripcion: false })));
    expect(virtual).not.toHaveProperty('ubicacionLat');
    expect(virtual).not.toHaveProperty('ubicacionNombre');
  });

  it('ida y vuelta: un evento que el backend devuelve ya limpio (virtual, sin lugar) vuelve a producir el mismo payload', () => {
    const limpio = evento({ modalidad: 'VIRTUAL', ubicacionLat: null, ubicacionLng: null, ubicacionNombre: null, fechaInicio: new Date(2030, 9, 6, 9, 0).toISOString(), fechaFin: new Date(2030, 9, 6, 10, 0).toISOString() });
    const payload = buildEventPayload(eventFormFromEvento(limpio), { keepEmptyDescripcion: true });
    expect(payload).toMatchObject({ modalidad: 'VIRTUAL', ubicacionLat: null, ubicacionLng: null, ubicacionNombre: null, linkSesion: limpio.linkSesion });
  });
});

// Matriz compartida de G04-C17: es la MISMA lista en apps/backend/test/events.service.spec.ts y en
// apps/frontend/test/event-form-schema.spec.ts. Si cambia aquí, debe cambiar allá: lo que prueba es que
// formulario y backend aceptan y rechazan exactamente los mismos enlaces.
const ENLACES_ACEPTADOS = [
  "https://meet.google.com/abc-defg-hij",
  "http://zoom.us/j/123?pwd=x#frag",
  "HTTPS://Meet.Google.com/ABC",
  "https://teams.microsoft.com/l/meetup-join/19%3ameeting",
  "https://sub.dominio.edu.gt:8443/sala",
  "https://192.168.1.10/sala",
  "https://[2001:db8::1]/sala",
  "http://[::1]/x",
  "https://usuario:clave@ejemplo.com/x",
  "https://xn--espaa-rta.es/aula",
  "https://ejemplo.espa\u00f1a/aula",
  "https://ejemplo.com",
  "https://ejemplo.com/",
  "https://ejemplo.com?x=1",
  "https://ejemplo.com#f",
  "https://a.io/x",
  "https://ejemplo.co.uk/x",
  "https://ejemplo.museum/x",
  "https://255.255.255.255/x",
  "https://0.0.0.0/x",
  "https://ejemplo.com:8443/x",
  "https://ejemplo.com:/x",
  "https://ejemplo.COM/X",
  "https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.com/x",
  "https://ejemplo.com/ruta/muy/larga?aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
];

const ENLACES_RECHAZADOS: Record<string, string[]> = {
  "sin dominio real (el 400 tard\u00edo de UI-24)": ["http://localhost:3000/sala", "http://localhost", "https://intranet/sala", "https://meet", "https://ejemplo.c/x", "https://ejemplo.123/x", "https://.com/x"],
  "host mal formado": ["https://ejemplo..com/x", "https://-ejemplo.com/x", "https://ejemplo-.com/x", "https://exa_mple.com/x", "https://ejemplo.com./x", "https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.com/x", "https://@ejemplo.com/x"],
  "IP inv\u00e1lida": ["https://1.1/x", "https://1.2.3/x", "https://1.2.3.4.5/x", "https://999.1.1.1/x", "https://256.1.1.1/x", "https://01.2.3.4/x"],
  "puerto inv\u00e1lido": ["https://ejemplo.com:99999/x", "https://ejemplo.com:80a/x"],
  "sin esquema http(s)": ["meet.google.com/x", "//meet.google.com/x", "ftp://ejemplo.com/x", "file:///etc/passwd", "https-app://ejemplo.com", "http://", "https://", "https:///ruta"],
  "esquemas peligrosos": ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "java\tscript:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)"],
  "espacios, controles, invisibles o < >": ["https://ejemplo.com/a b", " https://ejemplo.com", "https://ejemplo.com\n", "https://ejemplo.com/\u200bx", "https://exam\u200bple.com/x", "https://ejemplo.com/<script>", "https://ejemplo.com/a>b"],
};

describe('enlace de la sesión — política única con el backend (G04-C17, UI-24)', () => {
  const errorDeEnlace = (linkSesion: string) => mensajes(valores({ linkSesion })).linkSesion;

  it.each(ENLACES_ACEPTADOS)('acepta %s', (enlace) => {
    expect(esEnlaceDeSesionValido(enlace)).toBe(true);
    expect(errorDeEnlace(enlace)).toBeUndefined();
  });

  for (const [motivo, enlaces] of Object.entries(ENLACES_RECHAZADOS)) {
    it.each(enlaces)(`rechaza por "${motivo}": %j`, (enlace) => {
      expect(esEnlaceDeSesionValido(enlace)).toBe(false);
      // El formulario recorta los extremos antes de validar, igual que el DTO del backend.
      const recortado = enlace.trim();
      if (esEnlaceDeSesionValido(recortado)) expect(errorDeEnlace(enlace)).toBeUndefined();
      else expect(errorDeEnlace(enlace)).toBeDefined();
    });
  }

  it('lo que antes pasaba aquí y volvía como 400 del servidor ahora se explica junto al campo', () => {
    for (const enlace of ['http://localhost:3000/sala', 'https://intranet/sala', 'https://exa_mple.com/x', 'https://ejemplo.com/<script>']) {
      expect(errorDeEnlace(enlace)).toBe('El link no parece válido. Revisa el dominio, por ejemplo https://meet.google.com/abc-defg-hij.');
    }
  });

  it('sin http(s) conserva su mensaje de siempre; vacío sigue pidiendo el enlace', () => {
    for (const enlace of ['meet.google.com/x', 'javascript:alert(1)', 'data:text/html,x', 'ftp://ejemplo.com/x']) {
      expect(errorDeEnlace(enlace)).toBe('El link debe empezar con http:// o https://.');
    }
    expect(errorDeEnlace('   ')).toBe('Ingresa el link de la sesión.');
  });

  it('un evento presencial no valida el enlace (la modalidad no lo usa)', () => {
    const errores = mensajes(valores({ modalidad: 'PRESENCIAL', ubicacionLat: 14.6, ubicacionLng: -90.5, linkSesion: 'no es un enlace' }));
    expect(errores.linkSesion).toBeUndefined();
  });
});
