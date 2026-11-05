import { afterEach, describe, expect, it, vi } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { NotificationSilencioService } from '../src/notifications/notification-silencio.service';
import { enHorarioSilencio } from '../src/notifications/silencio-horario';
import { NotificationsService } from '../src/notifications/notifications.service';
import { UpdateSilencioDto } from '../src/notifications/dto/update-silencio.dto';

const pref = { activo: true, horaInicio: '22:00', horaFin: '07:00' };
// Guatemala es UTC-6 todo el año: 22:00 local = 04:00Z.
const utc = (hhmm: string) => new Date(`2026-11-05T${hhmm}:00.000Z`);

describe('enHorarioSilencio (hora de Guatemala, con cruce de medianoche)', () => {
  it('22:00 a 07:00: dentro de noche y madrugada, fuera de dia', () => {
    expect(enHorarioSilencio(pref, utc('04:00'))).toBe(true); // 22:00 local, inicio incluido
    expect(enHorarioSilencio(pref, utc('03:59'))).toBe(false); // 21:59 local
    expect(enHorarioSilencio(pref, utc('06:00'))).toBe(true); // 00:00 local
    expect(enHorarioSilencio(pref, utc('12:59'))).toBe(true); // 06:59 local
    expect(enHorarioSilencio(pref, utc('13:00'))).toBe(false); // 07:00 local, fin excluido
    expect(enHorarioSilencio(pref, utc('18:00'))).toBe(false); // 12:00 local
  });

  it('usa la hora de Guatemala y no la del servidor (01:00Z es 19:00 local)', () => {
    expect(enHorarioSilencio(pref, utc('01:00'))).toBe(false);
  });

  it('rango sin cruce (13:00 a 15:00) y desactivado o ausente', () => {
    const tarde = { activo: true, horaInicio: '13:00', horaFin: '15:00' };
    expect(enHorarioSilencio(tarde, utc('20:30'))).toBe(true); // 14:30 local
    expect(enHorarioSilencio(tarde, utc('21:00'))).toBe(false); // 15:00 local
    expect(enHorarioSilencio({ ...pref, activo: false }, utc('06:00'))).toBe(false);
    expect(enHorarioSilencio(null, utc('06:00'))).toBe(false);
  });
});

describe('UpdateSilencioDto', () => {
  const errores = async (p: Record<string, unknown>) =>
    (await validate(plainToInstance(UpdateSilencioDto, p))).map((e) => e.property);

  it('valida HH:mm', async () => {
    expect(await errores({ activo: true, horaInicio: '22:00', horaFin: '07:00' })).toEqual([]);
    expect(await errores({ activo: true, horaInicio: '24:00', horaFin: '7:00' })).toEqual(['horaInicio', 'horaFin']);
  });
});

describe('NotificationSilencioService', () => {
  it('sin fila devuelve el valor por defecto desactivado; guardar toca solo la fila del usuario', async () => {
    const prisma = {
      preferenciaSilencioNotificacion: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(),
      },
    };
    const service = new NotificationSilencioService(prisma as any);
    expect(await service.obtener(5)).toMatchObject({
      activo: false,
      horaInicio: '22:00',
      horaFin: '07:00',
      zona: 'America/Guatemala',
      enSilencio: false,
    });
    await service.guardar(5, { activo: true, horaInicio: '21:00', horaFin: '06:00' });
    expect(prisma.preferenciaSilencioNotificacion.upsert).toHaveBeenCalledWith({
      where: { idUsuario: 5 },
      create: { idUsuario: 5, activo: true, horaInicio: '21:00', horaFin: '06:00' },
      update: { activo: true, horaInicio: '21:00', horaFin: '06:00' },
    });
  });
});

describe('NotificationsService - horario de silencio (MEJ-136)', () => {
  afterEach(() => vi.useRealTimers());

  function make(silencios: { idUsuario: number; activo: boolean; horaInicio: string; horaFin: string }[]) {
    const prisma = {
      preferenciaNotificacion: { findMany: vi.fn().mockResolvedValue([]) },
      preferenciaSilencioNotificacion: { findMany: vi.fn().mockResolvedValue(silencios) },
      notificacion: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
    };
    const gateway = { server: {}, notifyUsers: vi.fn().mockResolvedValue(undefined) };
    const push = { enviar: vi.fn() };
    return { prisma, gateway, push, service: new NotificationsService(prisma as any, gateway as any, push as any) };
  }

  it('guarda para todos, pero a quien esta en silencio no le llega el aviso emergente (va marcado)', async () => {
    // 23:00 en Guatemala.
    vi.useFakeTimers({ now: new Date('2026-11-05T05:00:00.000Z') });
    const ctx = make([{ idUsuario: 1, activo: true, horaInicio: '22:00', horaFin: '07:00' }]);
    await ctx.service.notifyUsers([1, 2], { tipoNotificacion: 'MENCION_CHAT', tituloNotificacion: 'T', mensajeNotificacion: 'M' });
    expect(ctx.prisma.notificacion.createMany.mock.calls[0][0].data.map((d: { idUsuario: number }) => d.idUsuario)).toEqual([1, 2]);
    expect(ctx.gateway.notifyUsers).toHaveBeenCalledWith([2], expect.not.objectContaining({ silenciada: true }));
    expect(ctx.gateway.notifyUsers).toHaveBeenCalledWith([1], expect.objectContaining({ silenciada: true }));
  });

  it('fuera del horario nadie va marcado como silenciado', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-05T20:00:00.000Z') });
    const ctx = make([{ idUsuario: 1, activo: true, horaInicio: '22:00', horaFin: '07:00' }]);
    await ctx.service.notifyUsers([1, 2], { tipoNotificacion: 'MENCION_CHAT', tituloNotificacion: 'T' });
    expect(ctx.gateway.notifyUsers).toHaveBeenCalledTimes(1);
    expect(ctx.gateway.notifyUsers).toHaveBeenCalledWith([1, 2], expect.not.objectContaining({ silenciada: true }));
  });
});
