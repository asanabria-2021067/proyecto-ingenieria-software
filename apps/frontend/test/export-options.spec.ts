import { describe, expect, it } from 'vitest';
import { DEFAULT_EXPORT_OPTIONS, buildExportQuery, validarOpciones } from '../lib/export-options';

describe('buildExportQuery', () => {
  it('PDF con opciones por defecto: fuente, color y todas las secciones, sin gráficas ni fechas', () => {
    expect(buildExportQuery('pdf', DEFAULT_EXPORT_OPTIONS)).toBe(
      '?fuente=mediana&color=gris&secciones=miembros%2Cavance%2Cburndown',
    );
  });

  it('PDF con todo elegido lo envía completo', () => {
    const query = buildExportQuery('pdf', {
      fuente: 'grande',
      color: 'azul',
      secciones: ['miembros', 'avance'],
      graficas: ['barras', 'pastel'],
      desde: '2026-02-01',
      hasta: '2026-02-28',
    });
    const params = new URLSearchParams(query);

    expect(params.get('fuente')).toBe('grande');
    expect(params.get('color')).toBe('azul');
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
