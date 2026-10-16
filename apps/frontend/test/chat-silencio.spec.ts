import { describe, expect, it } from 'vitest';
import { estaEnNoMolestar, estaSilenciada, totalNoLeidos } from '../lib/chat-silencio';
import type { PreferenciaNoMolestar } from '../lib/types/chat';

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

// Guatemala es UTC-6 todo el año. 2026-10-16 es viernes.
const gt = (iso: string) => new Date(`${iso}-06:00`);
const pref = (o: Partial<PreferenciaNoMolestar> = {}): PreferenciaNoMolestar => ({
  activo: true,
  horaInicio: '22:00',
  horaFin: '07:00',
  diasSemana: [0, 1, 2, 3, 4, 5, 6],
  zona: 'America/Guatemala',
  ...o,
});

describe('estaEnNoMolestar', () => {
  it('inactivo o inexistente no suprime', () => {
    expect(estaEnNoMolestar(null)).toBe(false);
    expect(estaEnNoMolestar(pref({ activo: false }), gt('2026-10-16T23:00:00'))).toBe(false);
  });

  it('rango del mismo dia: inicio inclusivo, fin exclusivo', () => {
    const p = pref({ horaInicio: '09:00', horaFin: '17:00' });
    expect(estaEnNoMolestar(p, gt('2026-10-16T08:59:00'))).toBe(false);
    expect(estaEnNoMolestar(p, gt('2026-10-16T09:00:00'))).toBe(true);
    expect(estaEnNoMolestar(p, gt('2026-10-16T17:00:00'))).toBe(false);
  });

  it('respeta los dias elegidos', () => {
    const p = pref({ horaInicio: '09:00', horaFin: '17:00', diasSemana: [1, 2, 3, 4, 5] });
    expect(estaEnNoMolestar(p, gt('2026-10-16T12:00:00'))).toBe(true);
    expect(estaEnNoMolestar(p, gt('2026-10-17T12:00:00'))).toBe(false);
  });

  it('rango que cruza la medianoche', () => {
    const p = pref();
    expect(estaEnNoMolestar(p, gt('2026-10-16T21:59:00'))).toBe(false);
    expect(estaEnNoMolestar(p, gt('2026-10-16T22:00:00'))).toBe(true);
    expect(estaEnNoMolestar(p, gt('2026-10-17T00:00:00'))).toBe(true);
    expect(estaEnNoMolestar(p, gt('2026-10-17T06:59:00'))).toBe(true);
    expect(estaEnNoMolestar(p, gt('2026-10-17T07:00:00'))).toBe(false);
  });

  it('la madrugada cuenta el dia en que empezo el rango', () => {
    const soloViernes = pref({ diasSemana: [5] });
    expect(estaEnNoMolestar(soloViernes, gt('2026-10-17T03:00:00'))).toBe(true);
    expect(estaEnNoMolestar(soloViernes, gt('2026-10-17T23:00:00'))).toBe(false);
    expect(estaEnNoMolestar(soloViernes, gt('2026-10-16T03:00:00'))).toBe(false);
    expect(estaEnNoMolestar(pref({ diasSemana: [6] }), gt('2026-10-18T02:00:00'))).toBe(true);
  });

  it('evalua la hora local de la zona', () => {
    const instante = new Date('2026-10-16T15:00:00Z'); // 09:00 en Guatemala, 11:00 en Nueva York
    expect(estaEnNoMolestar(pref({ horaInicio: '09:00', horaFin: '10:00' }), instante)).toBe(true);
    expect(estaEnNoMolestar(pref({ horaInicio: '09:00', horaFin: '10:00', zona: 'America/New_York' }), instante)).toBe(false);
    expect(estaEnNoMolestar(pref({ horaInicio: '11:00', horaFin: '12:00', zona: 'America/New_York' }), instante)).toBe(true);
  });

  it('zona invalida e inicio igual a fin no suprimen', () => {
    expect(estaEnNoMolestar(pref({ zona: 'No/Existe' }), gt('2026-10-16T23:00:00'))).toBe(false);
    expect(estaEnNoMolestar(pref({ horaInicio: '08:00', horaFin: '08:00' }), gt('2026-10-16T08:00:00'))).toBe(false);
  });
});

describe('badge con no molestar', () => {
  const sin = { silenciadaHasta: null, silenciadaSiempre: false };

  it('estaSilenciada es verdadera dentro del horario aunque el chat no este silenciado', () => {
    expect(estaSilenciada(sin, gt('2026-10-16T23:00:00'), pref())).toBe(true);
    expect(estaSilenciada(sin, gt('2026-10-16T12:00:00'), pref())).toBe(false);
  });

  it('totalNoLeidos cuenta cero dentro del horario y vuelve a contar fuera', () => {
    const lista = [{ ...sin, noLeidos: 3 }, { ...sin, noLeidos: 2 }];
    expect(totalNoLeidos(lista, gt('2026-10-16T23:00:00'), pref())).toBe(0);
    expect(totalNoLeidos(lista, gt('2026-10-16T12:00:00'), pref())).toBe(5);
    expect(totalNoLeidos(lista, gt('2026-10-16T23:00:00'), null)).toBe(5);
  });
});
