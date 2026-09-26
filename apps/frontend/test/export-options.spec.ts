import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXPORT_OPTIONS,
  buildExportQuery,
  diaDeCreacion,
  erroresDeFechas,
  validarOpciones,
} from '../lib/export-options';

describe('buildExportQuery', () => {
  it('PDF con opciones por defecto: fuente, color y todas las secciones, sin gráficas ni fechas', () => {
    expect(buildExportQuery('pdf', DEFAULT_EXPORT_OPTIONS)).toBe(
      '?fuente=mediana&color=%23464646&secciones=miembros%2Cavance%2Cburndown',
    );
  });

  it('PDF con todo elegido lo envía completo', () => {
    const query = buildExportQuery('pdf', {
      fuente: 'grande',
      color: '#1e408c',
      secciones: ['miembros', 'avance'],
      graficas: ['barras', 'pastel'],
      desde: '2026-02-01',
      hasta: '2026-02-28',
    });
    const params = new URLSearchParams(query);

    expect(params.get('fuente')).toBe('grande');
    expect(params.get('color')).toBe('#1e408c');
    expect(params.get('secciones')).toBe('miembros,avance');
    expect(params.get('graficas')).toBe('barras,pastel');
    expect(params.get('desde')).toBe('2026-02-01');
    expect(params.get('hasta')).toBe('2026-02-28');
  });

  it('omite las gráficas si no se exporta la sección de miembros (de ahí salen sus datos)', () => {
    const query = buildExportQuery('pdf', {
      ...DEFAULT_EXPORT_OPTIONS,
      secciones: ['avance'],
      graficas: ['barras'],
    });

    expect(new URLSearchParams(query).has('graficas')).toBe(false);
  });

  it('CSV solo envía el rango de fechas', () => {
    const query = buildExportQuery('csv', {
      ...DEFAULT_EXPORT_OPTIONS,
      fuente: 'grande',
      graficas: ['pastel'],
      desde: '2026-02-01',
    });

    expect(query).toBe('?desde=2026-02-01');
  });

  it('CSV sin fechas no agrega query string', () => {
    expect(buildExportQuery('csv', DEFAULT_EXPORT_OPTIONS)).toBe('');
  });
});

describe('validarOpciones', () => {
  it('acepta las opciones por defecto', () => {
    expect(validarOpciones('pdf', DEFAULT_EXPORT_OPTIONS)).toBeNull();
    expect(validarOpciones('csv', DEFAULT_EXPORT_OPTIONS)).toBeNull();
  });

  it('rechaza un PDF sin ningún dato seleccionado', () => {
    expect(validarOpciones('pdf', { ...DEFAULT_EXPORT_OPTIONS, secciones: [] })).toMatch(/al menos un dato/i);
  });

  it('el CSV no exige secciones (siempre exporta miembros y horas)', () => {
    expect(validarOpciones('csv', { ...DEFAULT_EXPORT_OPTIONS, secciones: [] })).toBeNull();
  });

  it('rechaza un rango con "Desde" posterior a "Hasta"', () => {
    expect(
      validarOpciones('pdf', { ...DEFAULT_EXPORT_OPTIONS, desde: '2026-03-10', hasta: '2026-03-01' }),
    ).toMatch(/desde/i);
  });

  it('acepta solo una de las dos fechas', () => {
    expect(validarOpciones('pdf', { ...DEFAULT_EXPORT_OPTIONS, desde: '2026-03-10' })).toBeNull();
  });
});

describe('erroresDeFechas (revisión del PR: validaciones de fechas)', () => {
  const ctx = { hoy: '2026-09-24', fechaCreacion: '2026-01-10' };
  const con = (desde: string, hasta: string) => ({ ...DEFAULT_EXPORT_OPTIONS, desde, hasta });

  it('sin fechas o con un rango válido no hay errores', () => {
    expect(erroresDeFechas(con('', ''), ctx)).toEqual({});
    expect(erroresDeFechas(con('2026-02-01', '2026-03-01'), ctx)).toEqual({});
  });

  it('los extremos son válidos: desde = creación, hasta = hoy', () => {
    expect(erroresDeFechas(con('2026-01-10', '2026-09-24'), ctx)).toEqual({});
  });

  it('"Desde" antes de la creación: dice que debe ser posterior a la creación del proyecto, con la fecha', () => {
    expect(erroresDeFechas(con('2026-01-09', ''), ctx).desde).toBe(
      'La fecha "Desde" debe ser igual o posterior a la fecha de creación del proyecto (10/01/2026).',
    );
  });

  it('"Hasta" después de hoy: dice que no puede ser posterior a la fecha actual', () => {
    expect(erroresDeFechas(con('', '2026-09-25'), ctx).hasta).toBe(
      'La fecha "Hasta" no puede ser posterior a la fecha actual.',
    );
  });

  it('"Desde" después de hoy también es error de fecha futura', () => {
    expect(erroresDeFechas(con('2026-10-01', ''), ctx).desde).toBe(
      'La fecha "Desde" no puede ser posterior a la fecha actual.',
    );
  });

  it('"Hasta" antes de la creación del proyecto es error', () => {
    expect(erroresDeFechas(con('', '2026-01-01'), ctx).hasta).toMatch(/creación del proyecto \(10\/01\/2026\)/);
  });

  it('"Desde" posterior a "Hasta" se reporta en "Desde"', () => {
    expect(erroresDeFechas(con('2026-03-10', '2026-03-01'), ctx)).toEqual({
      desde: 'La fecha "Desde" no puede ser posterior a la fecha "Hasta".',
    });
  });

  it('sin fecha de creación conocida (p. ej. el detalle no cargó) solo valida contra hoy y entre sí', () => {
    expect(erroresDeFechas(con('2000-01-01', ''), { hoy: '2026-09-24', fechaCreacion: null })).toEqual({});
    expect(erroresDeFechas(con('', '2027-01-01'), { hoy: '2026-09-24', fechaCreacion: null }).hasta).toBeDefined();
  });

  it('validarOpciones devuelve el primer error de fechas para deshabilitar la descarga', () => {
    expect(validarOpciones('pdf', con('2026-01-09', ''), ctx)).toMatch(/creación del proyecto/);
    expect(validarOpciones('csv', con('', '2026-09-25'), ctx)).toMatch(/fecha actual/);
  });
});

describe('diaDeCreacion', () => {
  it('toma el día UTC del ISO (mismo criterio que el backend)', () => {
    expect(diaDeCreacion('2026-01-10T15:00:00.000Z')).toBe('2026-01-10');
    expect(diaDeCreacion('2026-01-10T23:30:00.000Z')).toBe('2026-01-10');
  });

  it('sin fecha devuelve null', () => {
    expect(diaDeCreacion(undefined)).toBeNull();
    expect(diaDeCreacion(null)).toBeNull();
  });
});
