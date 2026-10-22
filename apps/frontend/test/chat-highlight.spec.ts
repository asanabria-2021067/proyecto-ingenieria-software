import { describe, expect, it } from 'vitest';
import { resaltarTexto } from '@/lib/chat-highlight';

describe('resaltarTexto', () => {
  it('sin termino devuelve el texto completo sin marcar', () => {
    expect(resaltarTexto('hola mundo', undefined)).toEqual([{ texto: 'hola mundo', coincide: false }]);
    expect(resaltarTexto('hola mundo', '   ')).toEqual([{ texto: 'hola mundo', coincide: false }]);
    expect(resaltarTexto('hola mundo', null)).toEqual([{ texto: 'hola mundo', coincide: false }]);
  });

  it('marca todas las apariciones conservando el texto original', () => {
    expect(resaltarTexto('Hola hola HOLA', 'hola')).toEqual([
      { texto: 'Hola', coincide: true },
      { texto: ' ', coincide: false },
      { texto: 'hola', coincide: true },
      { texto: ' ', coincide: false },
      { texto: 'HOLA', coincide: true },
    ]);
  });

  it('ignora acentos en ambos sentidos', () => {
    expect(resaltarTexto('La reunión es hoy', 'reunion')).toEqual([
      { texto: 'La ', coincide: false },
      { texto: 'reunión', coincide: true },
      { texto: ' es hoy', coincide: false },
    ]);
    expect(resaltarTexto('reunion', 'REUNIÓN')).toEqual([{ texto: 'reunion', coincide: true }]);
  });

  it('trata los caracteres especiales de regex como texto literal', () => {
    expect(resaltarTexto('costo (100%) + iva', '(100%)')).toEqual([
      { texto: 'costo ', coincide: false },
      { texto: '(100%)', coincide: true },
      { texto: ' + iva', coincide: false },
    ]);
    expect(resaltarTexto('a.b', '.')).toEqual([
      { texto: 'a', coincide: false },
      { texto: '.', coincide: true },
      { texto: 'b', coincide: false },
    ]);
  });

  it('sin coincidencias devuelve un solo segmento', () => {
    expect(resaltarTexto('hola', 'xyz')).toEqual([{ texto: 'hola', coincide: false }]);
  });

  it('mantiene los indices con emoji (pares sustitutos)', () => {
    expect(resaltarTexto('😀 ok', 'ok')).toEqual([
      { texto: '😀 ', coincide: false },
      { texto: 'ok', coincide: true },
    ]);
  });
});
