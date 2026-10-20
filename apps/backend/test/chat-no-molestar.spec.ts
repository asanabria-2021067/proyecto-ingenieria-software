import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ChatService } from '../src/chat/chat.service';
import { estaEnNoMolestar, estaSilenciada, type NoMolestar } from '../src/chat/chat-silencio.util';
import { UpdateNoMolestarDto } from '../src/chat/dto/update-no-molestar.dto';

const TODOS = [0, 1, 2, 3, 4, 5, 6];
const pref = (o: Partial<NoMolestar> = {}): NoMolestar => ({
  activo: true,
  horaInicio: '22:00',
  horaFin: '07:00',
  diasSemana: TODOS,
  zona: 'America/Guatemala',
  ...o,
});

// Guatemala es UTC-6 todo el año (sin horario de verano).
// 2026-10-16 es viernes, 2026-10-19 es lunes.
const gt = (iso: string) => new Date(`${iso}-06:00`);

describe('estaEnNoMolestar', () => {
  it('inactivo o inexistente nunca suprime', () => {
    expect(estaEnNoMolestar(null)).toBe(false);
    expect(estaEnNoMolestar(undefined)).toBe(false);
    expect(estaEnNoMolestar(pref({ activo: false }), gt('2026-10-16T23:00:00'))).toBe(false);
  });

  describe('rango dentro del mismo dia (09:00-17:00)', () => {
    const p = pref({ horaInicio: '09:00', horaFin: '17:00' });
    it('limites: inicio inclusivo, fin exclusivo', () => {
      expect(estaEnNoMolestar(p, gt('2026-10-16T08:59:00'))).toBe(false);
      expect(estaEnNoMolestar(p, gt('2026-10-16T09:00:00'))).toBe(true);
      expect(estaEnNoMolestar(p, gt('2026-10-16T16:59:00'))).toBe(true);
      expect(estaEnNoMolestar(p, gt('2026-10-16T17:00:00'))).toBe(false);
    });
    it('respeta los dias elegidos', () => {
      const lunAVie = pref({ horaInicio: '09:00', horaFin: '17:00', diasSemana: [1, 2, 3, 4, 5] });
      expect(estaEnNoMolestar(lunAVie, gt('2026-10-16T12:00:00'))).toBe(true); // viernes
      expect(estaEnNoMolestar(lunAVie, gt('2026-10-17T12:00:00'))).toBe(false); // sabado
    });
  });

  describe('rango que cruza la medianoche (22:00-07:00)', () => {
    const p = pref();
    it('antes de la medianoche y de madrugada', () => {
      expect(estaEnNoMolestar(p, gt('2026-10-16T21:59:00'))).toBe(false);
      expect(estaEnNoMolestar(p, gt('2026-10-16T22:00:00'))).toBe(true);
      expect(estaEnNoMolestar(p, gt('2026-10-16T23:59:00'))).toBe(true);
      expect(estaEnNoMolestar(p, gt('2026-10-17T00:00:00'))).toBe(true);
      expect(estaEnNoMolestar(p, gt('2026-10-17T06:59:00'))).toBe(true);
      expect(estaEnNoMolestar(p, gt('2026-10-17T07:00:00'))).toBe(false);
    });
    it('la madrugada pertenece al dia en que empezo el rango', () => {
      const soloViernes = pref({ diasSemana: [5] });
      expect(estaEnNoMolestar(soloViernes, gt('2026-10-16T23:00:00'))).toBe(true); // vie 23:00
      expect(estaEnNoMolestar(soloViernes, gt('2026-10-17T03:00:00'))).toBe(true); // sab 03:00 (viene del viernes)
      expect(estaEnNoMolestar(soloViernes, gt('2026-10-17T23:00:00'))).toBe(false); // sab 23:00
      expect(estaEnNoMolestar(soloViernes, gt('2026-10-16T03:00:00'))).toBe(false); // vie 03:00 (viene del jueves)
    });
    it('domingo de madrugada viene del sabado (envoltura semanal)', () => {
      const soloSabado = pref({ diasSemana: [6] });
      expect(estaEnNoMolestar(soloSabado, gt('2026-10-18T02:00:00'))).toBe(true); // dom 02:00
    });
  });

  describe('zona horaria', () => {
    it('evalua la hora local de la zona, no la del servidor', () => {
      const p = pref({ horaInicio: '09:00', horaFin: '17:00' });
      const instante = new Date('2026-10-16T15:00:00Z'); // 09:00 en Guatemala, 11:00 en Nueva York (EDT)
      expect(estaEnNoMolestar(p, instante)).toBe(true);
      expect(estaEnNoMolestar(pref({ horaInicio: '09:00', horaFin: '10:00', zona: 'America/New_York' }), instante)).toBe(false);
      expect(estaEnNoMolestar(pref({ horaInicio: '11:00', horaFin: '12:00', zona: 'America/New_York' }), instante)).toBe(true);
    });
    it('una zona invalida no suprime', () => {
      expect(estaEnNoMolestar(pref({ zona: 'No/Existe' }), gt('2026-10-16T23:00:00'))).toBe(false);
    });
  });

  it('inicio igual a fin no define un rango', () => {
    expect(estaEnNoMolestar(pref({ horaInicio: '08:00', horaFin: '08:00' }), gt('2026-10-16T08:00:00'))).toBe(false);
  });

  it('usa la hora actual por defecto', () => {
    const todoElDia = pref({ horaInicio: '00:00', horaFin: '23:59' });
    expect(typeof estaEnNoMolestar(todoElDia)).toBe('boolean');
  });
});

describe('estaSilenciada con no molestar', () => {
  const ahora = gt('2026-10-16T23:00:00');
  it('el horario suprime aunque el chat no este silenciado', () => {
    expect(estaSilenciada({}, ahora)).toBe(false);
    expect(estaSilenciada({}, ahora, pref())).toBe(true);
    expect(estaSilenciada(null, ahora, pref())).toBe(true);
  });
  it('fuera de horario manda el silencio del chat', () => {
    const fuera = gt('2026-10-16T12:00:00');
    expect(estaSilenciada({ silenciadaSiempre: true }, fuera, pref())).toBe(true);
    expect(estaSilenciada({}, fuera, pref())).toBe(false);
  });
});

describe('UpdateNoMolestarDto', () => {
  const base = { activo: true, horaInicio: '22:00', horaFin: '07:00', diasSemana: [1, 2], zona: 'America/Guatemala' };
  const errores = (o: object) => validate(plainToInstance(UpdateNoMolestarDto, { ...base, ...o }));

  it('acepta un payload valido, con y sin zona', async () => {
    expect(await errores({})).toHaveLength(0);
    expect(await errores({ zona: undefined })).toHaveLength(0);
  });
  it.each([
    ['hora invalida', { horaInicio: '24:00' }],
    ['formato de hora', { horaFin: '7:00' }],
    ['dia fuera de rango', { diasSemana: [7] }],
    ['dias repetidos', { diasSemana: [1, 1] }],
    ['dias no enteros', { diasSemana: ['lunes'] }],
    ['zona invalida', { zona: 'Marte/Olimpo' }],
    ['activo no booleano', { activo: 'si' }],
  ])('rechaza %s', async (_n, o) => {
    expect(await errores(o)).not.toHaveLength(0);
  });
});

describe('ChatService no molestar', () => {
  let prisma: any;
  let service: ChatService;
  beforeEach(() => {
    prisma = { preferenciaNoMolestar: { findUnique: vi.fn(), upsert: vi.fn().mockResolvedValue({}) } };
    service = new ChatService(prisma, {} as any);
  });

  it('sin preferencia devuelve los valores por defecto desactivados', async () => {
    prisma.preferenciaNoMolestar.findUnique.mockResolvedValue(null);
    const r = await service.getNoMolestar(1);
    expect(r).toMatchObject({ activo: false, horaInicio: '22:00', horaFin: '07:00', zona: 'America/Guatemala' });
    expect(r.diasSemana).toEqual(TODOS);
    expect(r.enHorarioAhora).toBe(false);
    expect(prisma.preferenciaNoMolestar.findUnique).toHaveBeenCalledWith({ where: { idUsuario: 1 } });
  });

  it('devuelve la preferencia guardada', async () => {
    prisma.preferenciaNoMolestar.findUnique.mockResolvedValue({
      activo: true, horaInicio: '00:00', horaFin: '23:59', diasSemana: TODOS, zona: 'America/Guatemala',
    });
    const r = await service.getNoMolestar(1);
    expect(r.activo).toBe(true);
    expect(r.horaFin).toBe('23:59');
  });

  it('update hace upsert solo del usuario, ordena dias y usa la zona por defecto', async () => {
    prisma.preferenciaNoMolestar.findUnique.mockResolvedValue(null);
    await service.updateNoMolestar(7, { activo: true, horaInicio: '21:00', horaFin: '06:30', diasSemana: [5, 1, 3] });
    const datos = { activo: true, horaInicio: '21:00', horaFin: '06:30', diasSemana: [1, 3, 5], zona: 'America/Guatemala' };
    expect(prisma.preferenciaNoMolestar.upsert).toHaveBeenCalledWith({
      where: { idUsuario: 7 },
      create: { idUsuario: 7, ...datos },
      update: datos,
    });
  });

  it('update conserva la zona indicada', async () => {
    prisma.preferenciaNoMolestar.findUnique.mockResolvedValue(null);
    await service.updateNoMolestar(7, { activo: false, horaInicio: '21:00', horaFin: '06:30', diasSemana: [], zona: 'America/Mexico_City' });
    expect(prisma.preferenciaNoMolestar.upsert.mock.calls[0][0].update.zona).toBe('America/Mexico_City');
  });

  it('rechaza inicio igual a fin', async () => {
    await expect(
      service.updateNoMolestar(7, { activo: true, horaInicio: '08:00', horaFin: '08:00', diasSemana: [1] }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.preferenciaNoMolestar.upsert).not.toHaveBeenCalled();
  });
});
