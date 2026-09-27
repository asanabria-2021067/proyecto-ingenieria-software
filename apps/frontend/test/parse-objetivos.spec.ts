import { describe, expect, it } from 'vitest';
import { parseObjetivos } from '@/components/projects/detail/parse-objetivos';

// HU-154: los objetivos se guardan como texto libre, uno por línea. La vista
// del líder y la del participante comparten este parser.

describe('parseObjetivos', () => {
  it.each([
    ['guion', '- Uno\n- Dos'],
    ['asterisco', '* Uno\n* Dos'],
    ['viñeta tipográfica', '• Uno\n• Dos'],
    ['texto plano', 'Uno\nDos'],
    ['viñetas mezcladas', '- Uno\n• Dos'],
  ])('con %s devuelve los objetivos sin viñeta', (_, texto) => {
    expect(parseObjetivos(texto)).toEqual(['Uno', 'Dos']);
  });

  it('ignora líneas vacías o solo con espacios', () => {
    expect(parseObjetivos('Uno\n\n   \nDos\n')).toEqual(['Uno', 'Dos']);
  });

  it('tolera sangría antes de la viñeta y espacios sobrantes', () => {
    expect(parseObjetivos('   -   Uno  \n\t•Dos')).toEqual(['Uno', 'Dos']);
  });

  it('una viñeta sola no produce un objetivo vacío', () => {
    expect(parseObjetivos('-\n•\nUno')).toEqual(['Uno']);
  });

  it('solo quita la viñeta inicial: los guiones internos se conservan', () => {
    expect(parseObjetivos('- Reducir el tiempo de respuesta - al menos 20 %')).toEqual([
      'Reducir el tiempo de respuesta - al menos 20 %',
    ]);
  });

  it('respeta finales de línea Windows', () => {
    expect(parseObjetivos('- Uno\r\n- Dos\r\n')).toEqual(['Uno', 'Dos']);
  });

  it.each([null, undefined, ''])('sin texto (%s) devuelve una lista vacía', (texto) => {
    expect(parseObjetivos(texto)).toEqual([]);
  });
});
