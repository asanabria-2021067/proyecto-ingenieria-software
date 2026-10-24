import { describe, expect, it } from 'vitest';
import { extraerMenciones, normalizarMenciones } from '../src/comentarios/menciones/menciones.parser';

/**
 * HU-200 (T-379): parseo del token de mención `@[Etiqueta](idUsuario)` que el
 * frontend inserta en `Comentario.contenido`.
 */
describe('extraerMenciones', () => {
  it('devuelve cada mención con su id y etiqueta, en orden de aparición', () => {
    const texto = 'Hola @[María López](12), revisa con @[Carlos Mendoza](3) por favor';

    expect(extraerMenciones(texto)).toEqual([
      { idUsuario: 12, etiqueta: 'María López' },
      { idUsuario: 3, etiqueta: 'Carlos Mendoza' },
    ]);
  });

  it('deduplica por usuario y conserva la primera etiqueta', () => {
    const texto = '@[María](12) y otra vez @[María López](12)';

    expect(extraerMenciones(texto)).toEqual([{ idUsuario: 12, etiqueta: 'María' }]);
  });

  it('acepta menciones pegadas a signos de puntuación y al inicio o final del texto', () => {
    expect(extraerMenciones('@[Ana](1),@[Luis](2).')).toEqual([
      { idUsuario: 1, etiqueta: 'Ana' },
      { idUsuario: 2, etiqueta: 'Luis' },
    ]);
  });

  it('ignora texto que no es un token: un @ suelto, correos y formatos incompletos', () => {
    const texto = [
      'escribe a ana@uvg.edu.gt',
      '@María sin token',
      '@[Sin id]()',
      '@[Id no numérico](abc)',
      '@[Cero](0)',
      '@[](5)',
      '@[Salto\nde línea](7)',
      '[Sin arroba](8)',
    ].join(' ');

    expect(extraerMenciones(texto)).toEqual([]);
  });

  it('rechaza etiquetas con corchetes o paréntesis anidados y ids fuera de rango', () => {
    expect(extraerMenciones('@[a[b]](1) @[a(b)](2) @[Largo](1234567890)')).toEqual([]);
  });

  it('un texto sin menciones devuelve una lista vacía', () => {
    expect(extraerMenciones('Comentario normal, sin nadie mencionado.')).toEqual([]);
  });
});

describe('normalizarMenciones', () => {
  it('conserva el token de las menciones elegibles', () => {
    const texto = 'Listo @[María López](12)';

    expect(normalizarMenciones(texto, new Set([12]))).toBe(texto);
  });

  it('convierte una mención no elegible en texto normal sin perder la etiqueta', () => {
    const texto = 'Hola @[María López](12) y @[Intruso](99)';

    expect(normalizarMenciones(texto, new Set([12]))).toBe('Hola @[María López](12) y @Intruso');
  });

  it('sin elegibles degrada todas las menciones y deja el resto del texto intacto', () => {
    expect(normalizarMenciones('@[Ana](1), @[Luis](2): ok', new Set())).toBe('@Ana, @Luis: ok');
  });
});
