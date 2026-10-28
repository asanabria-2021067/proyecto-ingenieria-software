import { describe, expect, it } from 'vitest';
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
import type { AdminMeetingDetalle } from '@/lib/types/admin-meetings';

/** Reloj fijo: 25 de octubre de 2026, 10:00 hora local. */
const AHORA = new Date(2026, 9, 25, 10, 0);

function valores(overrides: Partial<AdminMeetingFormValues> = {}): AdminMeetingFormValues {
  return {
    ...emptyAdminMeetingForm(new Date(2026, 9, 27, 9, 0), AHORA),
    tituloEvento: 'Revisión de avances de proyectos',
    linkSesion: 'https://meet.google.com/abc-defg-hij',
    proyectos: [3],
    ...overrides,
  };
}

const errores = (values: AdminMeetingFormValues, mode: 'create' | 'edit' = 'create') => {
  const r = buildAdminMeetingFormSchema({ mode, ahora: AHORA }).safeParse(values);
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message]));
};

describe('formulario de reunión de Administración — validación', () => {
  it('acepta una reunión virtual con un proyecto y no exige el proyecto único del evento', () => {
    expect(errores(valores())).toEqual({});
  });

  it('sin proyectos invitados no se puede programar, y lo dice junto al campo', () => {
    expect(errores(valores({ proyectos: [] }))).toMatchObject({ proyectos: 'Invita al menos un proyecto.' });
  });

  it('rechaza proyectos repetidos y conserva las reglas del evento (título, fin > inicio, enlace)', () => {
    const e = errores(valores({ proyectos: [3, 3], tituloEvento: '  ', horaFin: '08:00', linkSesion: 'http://localhost:3000' }));
    expect(e).toMatchObject({
      proyectos: 'Hay proyectos repetidos.',
      tituloEvento: 'El título no puede estar vacío.',
      horaFin: 'El fin debe ser posterior al inicio.',
    });
    expect(e.linkSesion).toMatch(/no parece válido/);
  });

  it('presencial e híbrida exigen el punto en el mapa', () => {
    expect(errores(valores({ modalidad: 'PRESENCIAL', linkSesion: '' }))).toMatchObject({ ubicacionLat: 'Marca la ubicación de la sesión en el mapa.' });
    expect(errores(valores({ modalidad: 'MIXTA', ubicacionLat: 14.6, ubicacionLng: -90.5 }))).toEqual({});
  });
});

describe('formulario de reunión de Administración — cuerpo para la API', () => {
  it('POST: campos del DTO, sin tipoEvento, invitados ni rolesDestino, y sin política si no se pide', () => {
    const cuerpo = buildAdminMeetingPayload(valores({ proyectos: [3, 9] }), { mode: 'create', incluirPolitica: false });
    expect(cuerpo).not.toHaveProperty('tipoEvento');
    expect(cuerpo).not.toHaveProperty('invitados');
    expect(cuerpo).not.toHaveProperty('rolesDestino');
    expect(cuerpo).not.toHaveProperty('politicaEdicion');
    expect(cuerpo).toMatchObject({
      tituloEvento: 'Revisión de avances de proyectos',
      modalidad: 'VIRTUAL',
      linkSesion: 'https://meet.google.com/abc-defg-hij',
      antelacionMinutos: 60,
      proyectos: [3, 9],
      fechaInicio: new Date(2026, 9, 27, 9, 0).toISOString(),
      fechaFin: new Date(2026, 9, 27, 10, 0).toISOString(),
    });
    // Al crear, lo que la modalidad no usa se omite.
    expect(cuerpo.ubicacionLat).toBeUndefined();
  });

  it('los editores solo viajan con ADMINISTRADORES_SELECCIONADOS', () => {
    const otra = buildAdminMeetingPayload(valores({ politicaEdicion: 'SOLO_CREADOR', editores: [5] }), { mode: 'create', incluirPolitica: true });
    expect(otra).toMatchObject({ politicaEdicion: 'SOLO_CREADOR' });
    expect(otra).not.toHaveProperty('editores');
    const seleccionados = buildAdminMeetingPayload(valores({ politicaEdicion: 'ADMINISTRADORES_SELECCIONADOS', editores: [5, 6] }), { mode: 'create', incluirPolitica: true });
    expect(seleccionados).toMatchObject({ politicaEdicion: 'ADMINISTRADORES_SELECCIONADOS', editores: [5, 6] });
  });

  it('PATCH: limpia con null el lugar que la modalidad virtual ya no usa y conserva la descripción vacía', () => {
    const cuerpo = buildAdminMeetingPayload(valores({ ubicacionLat: 14.6, ubicacionLng: -90.5, ubicacionNombre: 'CIT' }), { mode: 'edit', incluirPolitica: false });
    expect(cuerpo).toMatchObject({ ubicacionLat: null, ubicacionLng: null, ubicacionNombre: null, descripcionEvento: '' });
  });

  it('sin recordatorio se envía antelación 0', () => {
    expect(buildAdminMeetingPayload(valores({ recordatorioActivo: false }), { mode: 'create', incluirPolitica: false }).antelacionMinutos).toBe(0);
  });
});

describe('formulario de reunión de Administración — lectura de la API', () => {
  const reunion: AdminMeetingDetalle = {
    idReunion: 12,
    version: 2,
    estado: 'ACTIVA',
    integridad: 'OK',
    contenido: {
      tituloEvento: 'Seguimiento de cierre',
      descripcionEvento: 'Revisar entregables',
      fechaInicio: new Date(2026, 10, 20, 16, 0).toISOString(),
      fechaFin: new Date(2026, 10, 20, 17, 30).toISOString(),
      antelacionMinutos: 1440,
      modalidad: 'MIXTA',
      ubicacionLat: 14.6,
      ubicacionLng: -90.5,
      ubicacionNombre: 'Edificio CIT',
      linkSesion: 'https://meet.google.com/abc-defg-hij',
    },
    proyectos: [
      { idProyecto: 3, idEvento: 41, tituloProyecto: 'Huerto UVG', estadoProyecto: 'EN_PROGRESO' },
      { idProyecto: 7, idEvento: 42, tituloProyecto: 'Portal', estadoProyecto: 'CERRADO' },
    ],
    creador: { idUsuario: 8, nombre: 'Ana', apellido: 'Pérez' },
    politicaEdicion: 'ADMINISTRADORES_SELECCIONADOS',
    editores: [{ idUsuario: 9, nombre: 'Luis', apellido: 'Gómez' }],
    creadaEn: '2026-10-01T00:00:00.000Z',
    actualizadaEn: null,
    canceladaEn: null,
    canManage: true,
    motivoGestion: 'POLITICA',
    puedeCambiarPolitica: true,
  };

  it('precarga contenido, proyectos, política y editores de la reunión', () => {
    const v = adminMeetingFormFromReunion(reunion);
    expect(v).toMatchObject({
      tituloEvento: 'Seguimiento de cierre',
      descripcionEvento: 'Revisar entregables',
      horaInicio: '16:00',
      horaFin: '17:30',
      modalidad: 'MIXTA',
      ubicacionNombre: 'Edificio CIT',
      antelacionMinutos: 1440,
      recordatorioActivo: true,
      proyectos: [3, 7],
      politicaEdicion: 'ADMINISTRADORES_SELECCIONADOS',
      editores: [9],
    });
    expect(rangoDeReunion(v)).toEqual({ fechaInicio: new Date(2026, 10, 20, 16, 0), fechaFin: new Date(2026, 10, 20, 17, 30) });
  });

  it('lee los motivos del 400 de elegibilidad y reconoce el 409', () => {
    const error = Object.assign(new Error('Hay proyectos que no se pueden convocar a esta reunión'), {
      statusCode: 400,
      body: { proyectos: [{ idProyecto: 9, motivo: 'FUERA_DE_VENTANA_POSCIERRE' }] },
    });
    expect([...motivosNoElegibles(error)]).toEqual([[9, 'FUERA_DE_VENTANA_POSCIERRE']]);
    expect(motivosNoElegibles(new Error('otro')).size).toBe(0);
    expect(esConflictoDeVersion(Object.assign(new Error('x'), { statusCode: 409 }))).toBe(true);
    expect(esConflictoDeVersion(error)).toBe(false);
  });
});
