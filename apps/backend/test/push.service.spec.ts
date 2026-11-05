import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { PushService, MAX_SUSCRIPCIONES_PUSH } from '../src/notifications/push.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { readVapidConfig } from '../src/config/vapid-config';

const enviarMock = vi.hoisted(() => vi.fn());
vi.mock('web-push', () => ({ sendNotification: enviarMock }));

// Claves de prueba sin valor real: el modulo web-push esta mockeado.
const ENV = { VAPID_PUBLIC_KEY: 'pub-test', VAPID_PRIVATE_KEY: 'priv-test', VAPID_SUBJECT: 'mailto:soporte@uvg.edu.gt' };
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc';
// 2026-11-05 05:00Z = 23:00 en Guatemala (UTC-6): dentro de 22:00 a 07:00.
const NOCHE = new Date('2026-11-05T05:00:00.000Z');
const TARDE = new Date('2026-11-05T20:00:00.000Z');

function makeService(env: Record<string, string> = ENV) {
  const prisma = {
    suscripcionPush: { findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn(), deleteMany: vi.fn() },
    preferenciaSilencioNotificacion: { findMany: vi.fn().mockResolvedValue([]) },
    preferenciaNoMolestar: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const config = { get: vi.fn((n: string) => env[n]) };
  return { prisma, service: new PushService(prisma as any, config as any) };
}

const sub = (idSuscripcion: number, idUsuario: number) => ({
  idSuscripcion,
  idUsuario,
  endpoint: `${ENDPOINT}${idSuscripcion}`,
  p256dh: 'p',
  auth: 'a',
});

describe('PushService', () => {
  beforeEach(() => enviarMock.mockReset());

  it('sin claves VAPID no envia y la clave publica es null', async () => {
    const { service, prisma } = makeService({});
    expect(service.clavePublica()).toEqual({ clave: null });
    await service.enviar([1], { titulo: 'x' });
    expect(prisma.suscripcionPush.findMany).not.toHaveBeenCalled();
    expect(enviarMock).not.toHaveBeenCalled();
  });

  it('sirve la clave publica por la API', () => {
    expect(makeService().service.clavePublica()).toEqual({ clave: 'pub-test' });
  });

  it('envia a cada suscripcion del destinatario con las opciones VAPID', async () => {
    const { service, prisma } = makeService();
    prisma.suscripcionPush.findMany.mockResolvedValue([sub(1, 7), sub(2, 7)]);
    await service.enviar([7], { titulo: 'Hola', mensaje: 'Cuerpo' }, TARDE);
    expect(enviarMock).toHaveBeenCalledTimes(2);
    const [destino, cuerpo, opciones] = enviarMock.mock.calls[0];
    expect(destino).toEqual({ endpoint: `${ENDPOINT}1`, keys: { p256dh: 'p', auth: 'a' } });
    expect(JSON.parse(cuerpo)).toEqual({ titulo: 'Hola', mensaje: 'Cuerpo' });
    expect(opciones.vapidDetails.subject).toBe('mailto:soporte@uvg.edu.gt');
  });

  it('omite a quien esta en horario de silencio (cruce de medianoche) y lo envia fuera de el', async () => {
    const { service, prisma } = makeService();
    prisma.suscripcionPush.findMany.mockResolvedValue([sub(1, 7), sub(2, 8)]);
    prisma.preferenciaSilencioNotificacion.findMany.mockResolvedValue([
      { idUsuario: 7, activo: true, horaInicio: '22:00', horaFin: '07:00' },
    ]);
    await service.enviar([7, 8], { titulo: 'x' }, NOCHE);
    expect(enviarMock).toHaveBeenCalledTimes(1);
    expect(enviarMock.mock.calls[0][0].endpoint).toBe(`${ENDPOINT}2`);

    enviarMock.mockReset();
    await service.enviar([7, 8], { titulo: 'x' }, TARDE);
    expect(enviarMock).toHaveBeenCalledTimes(2);
  });

  it('omite a quien tiene no molestar activo en ese momento', async () => {
    const { service, prisma } = makeService();
    prisma.suscripcionPush.findMany.mockResolvedValue([sub(1, 7)]);
    prisma.preferenciaNoMolestar.findMany.mockResolvedValue([
      { idUsuario: 7, activo: true, horaInicio: '22:00', horaFin: '07:00', diasSemana: [0, 1, 2, 3, 4, 5, 6], zona: 'America/Guatemala' },
    ]);
    await service.enviar([7], { titulo: 'x' }, NOCHE);
    expect(enviarMock).not.toHaveBeenCalled();
  });

  it('borra la suscripcion que responde 410 o 404 y conserva la que falla por otra causa', async () => {
    const { service, prisma } = makeService();
    prisma.suscripcionPush.findMany.mockResolvedValue([sub(1, 7), sub(2, 7), sub(3, 7)]);
    enviarMock
      .mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }))
      .mockRejectedValueOnce(Object.assign(new Error('nf'), { statusCode: 404 }))
      .mockRejectedValueOnce(Object.assign(new Error('boom'), { statusCode: 500 }));
    await service.enviar([7], { titulo: 'x' }, TARDE);
    expect(prisma.suscripcionPush.deleteMany).toHaveBeenCalledTimes(2);
    expect(prisma.suscripcionPush.deleteMany).toHaveBeenCalledWith({ where: { idSuscripcion: 1 } });
    expect(prisma.suscripcionPush.deleteMany).toHaveBeenCalledWith({ where: { idSuscripcion: 2 } });
  });

  it('suscribir guarda para el usuario autenticado y descarta las que pasan del limite', async () => {
    const { service, prisma } = makeService();
    prisma.suscripcionPush.findMany.mockResolvedValue([{ idSuscripcion: 9 }]);
    await service.suscribir(7, { endpoint: ENDPOINT, p256dh: 'p', auth: 'a' });
    expect(prisma.suscripcionPush.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { endpoint: ENDPOINT } }));
    expect(prisma.suscripcionPush.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { idUsuario: 7 }, skip: MAX_SUSCRIPCIONES_PUSH }),
    );
    expect(prisma.suscripcionPush.deleteMany).toHaveBeenCalledWith({ where: { idSuscripcion: { in: [9] }, idUsuario: 7 } });
  });

  it('rechaza endpoints que no son de un servicio push de navegador (SSRF)', async () => {
    const { service, prisma } = makeService();
    for (const endpoint of [
      'https://169.254.169.254/latest',
      'https://localhost.evil.test/x',
      'https://fcm.googleapis.com.evil.test/x',
    ]) {
      await expect(service.suscribir(7, { endpoint, p256dh: 'p', auth: 'a' })).rejects.toThrow(BadRequestException);
    }
    expect(prisma.suscripcionPush.upsert).not.toHaveBeenCalled();
  });

  it('cancelar solo borra suscripciones del propio usuario', async () => {
    const { service, prisma } = makeService();
    await service.cancelar(7, ENDPOINT);
    expect(prisma.suscripcionPush.deleteMany).toHaveBeenCalledWith({ where: { idUsuario: 7, endpoint: ENDPOINT } });
  });
});

describe('readVapidConfig', () => {
  it('sin variables queda deshabilitado sin motivos; a medias, con motivos', () => {
    expect(readVapidConfig({})).toEqual({ config: null, motivos: [] });
    expect(readVapidConfig({ VAPID_PUBLIC_KEY: 'a' }).motivos).toEqual(['falta VAPID_PRIVATE_KEY', 'falta VAPID_SUBJECT']);
    expect(readVapidConfig({ ...ENV, VAPID_SUBJECT: 'soporte' }).motivos).toEqual(['VAPID_SUBJECT debe ser mailto: o https:']);
    expect(readVapidConfig(ENV).config).toEqual({
      publicKey: 'pub-test',
      privateKey: 'priv-test',
      subject: ENV.VAPID_SUBJECT,
    });
  });
});

describe('NotificationsService - push respeta las categorias', () => {
  it('solo empuja a los destinatarios con el tipo activo (la notificacion se guarda igual)', async () => {
    const prisma = {
      preferenciaNotificacion: { findMany: vi.fn().mockResolvedValue([{ idUsuario: 2 }]) },
      notificacion: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const push = { enviar: vi.fn() };
    const service = new NotificationsService(prisma as any, { notifyUsers: vi.fn() } as any, push as any);
    await service.notifyUsers([1, 2], { tipoNotificacion: 'MENCION_CHAT', tituloNotificacion: 'T', mensajeNotificacion: 'M' });
    expect(prisma.notificacion.createMany).toHaveBeenCalled();
    expect(push.enviar).toHaveBeenCalledWith([1], { titulo: 'T', mensaje: 'M' });
  });
});
