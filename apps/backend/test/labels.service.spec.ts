import { describe, expect, it } from 'vitest';
import { LabelsService } from '../src/labels/labels.service';

/**
 * Tarea 30: normalizeName es la única fuente de producción para el cálculo
 * de `Etiqueta.nombreNormalizado`. Fórmula exacta y obligatoria:
 * Unicode NFKC → trim → lowercase. No colapsa espacios internos, no
 * elimina acentos, no usa toLocaleLowerCase.
 */
describe('LabelsService.normalizeName', () => {
  const service = new LabelsService();

  it('recorta espacios externos y aplica lowercase a un string simple', () => {
    expect(service.normalizeName('Backend')).toBe('backend');
  });

  it('aplica trim (espacios externos)', () => {
    expect(service.normalizeName('   backend   ')).toBe('backend');
  });

  it('aplica lowercase', () => {
    expect(service.normalizeName('URGENTE')).toBe('urgente');
  });

  it('preserva acentos (no los elimina)', () => {
    expect(service.normalizeName('  DISEÑO  ')).toBe('diseño');
  });

  it('preserva espacios internos (no los colapsa)', () => {
    expect(service.normalizeName('  Diseño  Web  ')).toBe('diseño  web');
    expect(service.normalizeName('  Diseño   UI  ')).toBe('diseño   ui');
  });

  it('normaliza caracteres fullwidth vía NFKC', () => {
    expect(service.normalizeName('  ＦＲＯＮＴＥＮＤ  ')).toBe('frontend');
  });

  it('normaliza un carácter de compatibilidad Unicode vía NFKC (ohm sign → letra griega omega)', () => {
    // U+2126 OHM SIGN se descompone bajo NFKC en U+03A9 GREEK CAPITAL
    // LETTER OMEGA; lowercase produce la omega minúscula U+03C9.
    expect(service.normalizeName('Ω')).toBe('ω');
  });

  it('el resultado es determinista para la misma entrada', () => {
    const input = '  Diseño Frontend  ';
    expect(service.normalizeName(input)).toBe(service.normalizeName(input));
  });

  it('no muta el argumento original', () => {
    const input = '  Diseño Frontend  ';
    const copia = input;
    service.normalizeName(input);
    expect(input).toBe(copia);
  });

  it('llamadas consecutivas con valores distintos no interfieren entre sí', () => {
    expect(service.normalizeName('Backend')).toBe('backend');
    expect(service.normalizeName('  ＦＲＯＮＴＥＮＤ  ')).toBe('frontend');
    expect(service.normalizeName('  DISEÑO  ')).toBe('diseño');
  });
});
