import { describe, expect, it } from 'vitest';
import { formatearHoras } from '../lib/hours/format';

// HU-158 (T-232): el formatter solo presenta el string decimal del backend.
describe('formatearHoras', () => {
  it.each([
    ['12.50', '12.5 h'],
    ['0.00', '0 h'],
    ['6.00', '6 h'],
    ['22.25', '22.25 h'],
    ['10.05', '10.05 h'],
    ['100.00', '100 h'],
    ['150.10', '150.1 h'],
  ])('«%s» se muestra como «%s»', (valor, esperado) => {
    expect(formatearHoras(valor)).toBe(esperado);
  });

  it('no pasa por coma flotante: conserva exactamente los dígitos significativos del string', () => {
    // Como número, 0.1 + 0.2 sería 0.30000000000000004; aquí no hay aritmética.
    expect(formatearHoras('0.30')).toBe('0.3 h');
    expect(formatearHoras('99999999.99')).toBe('99999999.99 h');
  });

  it('tolera un entero sin parte decimal y espacios alrededor', () => {
    expect(formatearHoras('7')).toBe('7 h');
    expect(formatearHoras(' 4.50 ')).toBe('4.5 h');
  });
});
