import { describe, expect, it } from 'vitest';
import { estaSilenciada, totalNoLeidos } from '../lib/chat-silencio';

const ahora = new Date('2026-10-16T12:00:00.000Z');
const sin = { silenciadaHasta: null, silenciadaSiempre: false };

describe('estaSilenciada', () => {
  it('sin silencio no esta silenciada', () => {
    expect(estaSilenciada(sin, ahora)).toBe(false);
  });

  it('siempre', () => {
    expect(estaSilenciada({ silenciadaHasta: null, silenciadaSiempre: true }, ahora)).toBe(true);
  });

  it('vigente un milisegundo antes de vencer', () => {
    expect(estaSilenciada({ silenciadaHasta: new Date(ahora.getTime() + 1).toISOString(), silenciadaSiempre: false }, ahora)).toBe(true);
  });

  it('limite: justo al vencer ya no esta silenciada', () => {
    expect(estaSilenciada({ silenciadaHasta: ahora.toISOString(), silenciadaSiempre: false }, ahora)).toBe(false);
  });

  it('usa la hora actual por defecto', () => {
    expect(estaSilenciada({ silenciadaHasta: new Date(Date.now() + 60_000).toISOString(), silenciadaSiempre: false })).toBe(true);
  });
});

describe('totalNoLeidos', () => {
  it('suma solo las conversaciones no silenciadas', () => {
    const lista = [
      { ...sin, noLeidos: 2 },
      { silenciadaHasta: null, silenciadaSiempre: true, noLeidos: 5 },
      { silenciadaHasta: new Date(ahora.getTime() - 1).toISOString(), silenciadaSiempre: false, noLeidos: 3 },
    ];
    expect(totalNoLeidos(lista, ahora)).toBe(5);
  });

  it('lista vacia suma cero', () => {
    expect(totalNoLeidos([], ahora)).toBe(0);
  });
});
