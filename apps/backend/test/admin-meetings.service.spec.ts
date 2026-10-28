import { describe, expect, it } from 'vitest';
import { contenidoCanonico, type ContenidoReunion } from '../src/events/admin-meetings.service';

const base: ContenidoReunion = {
  tituloEvento: 'Seguimiento',
  descripcionEvento: null,
  fechaInicio: new Date('2031-03-10T15:00:00Z'),
  fechaFin: new Date('2031-03-10T16:00:00Z'),
  antelacionMinutos: 60,
  modalidad: 'VIRTUAL',
  ubicacionLat: null,
  ubicacionLng: null,
  ubicacionNombre: null,
  linkSesion: 'https://meet.google.com/abc-defg-hij',
};

describe('HU-195 · contenidoCanonico (fuente de verdad de las proyecciones)', () => {
  it('proyecciones iguales (fechas como instancias distintas) → contenido único', () => {
    const otra = { ...base, fechaInicio: new Date(base.fechaInicio.getTime()), idEvento: 9 } as ContenidoReunion;
    expect(contenidoCanonico([base, otra])).toEqual({ contenido: base, integridad: 'OK' });
  });

  it('AC-18B: si una proyección diverge no se elige ninguna: contenido null e INCONSISTENTE', () => {
    expect(contenidoCanonico([base, { ...base, linkSesion: 'https://meet.google.com/otro-enlace' }])).toEqual({ contenido: null, integridad: 'INCONSISTENTE' });
    expect(contenidoCanonico([base, { ...base, fechaFin: new Date('2031-03-10T17:00:00Z') }])).toEqual({ contenido: null, integridad: 'INCONSISTENTE' });
  });

  it('sin proyecciones → SIN_PROYECCIONES', () => {
    expect(contenidoCanonico([])).toEqual({ contenido: null, integridad: 'SIN_PROYECCIONES' });
  });

  it('solo devuelve campos de contenido, aunque la fila traiga más', () => {
    const { contenido } = contenidoCanonico([{ ...base, idEvento: 1, idProyecto: 2 } as ContenidoReunion]);
    expect(Object.keys(contenido ?? {})).toEqual(Object.keys(base));
  });
});
