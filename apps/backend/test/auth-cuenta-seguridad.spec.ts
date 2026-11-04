import { BadRequestException, HttpException } from '@nestjs/common';
import { describe, expect, it, vi, type Mock } from 'vitest';
import type { JwtService } from '@nestjs/jwt';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../src/auth/auth.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import type { SecurityEventsService } from '../src/security-events/security-events.service';
import { huellaDispositivo, parseUserAgent } from '../src/auth/user-agent.util';

vi.mock('bcryptjs', () => ({ compare: vi.fn(), hash: vi.fn() }));

process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const usuario = { idUsuario: 1, correo: 'a@uvg.edu.gt', contrasena: 'hash', estado: 'ACTIVO', sesionVersion: 3 };

function setup(over: { conocidos?: number; creados?: number } = {}) {
  const tx = {
    usuario: { update: vi.fn().mockResolvedValue({ sesionVersion: 4 }) },
    tokenRefresco: { updateMany: vi.fn().mockResolvedValue({ count: 3 }) },
  };
  const prisma = {
    usuario: { findUnique: vi.fn().mockResolvedValue(usuario), update: vi.fn().mockResolvedValue({}) },
    tokenRefresco: {
      create: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue({ idSesion: 'sesion-actual', navegador: 'Chrome', sistema: 'Windows', huella: 'h' }),
      findUnique: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    dispositivoUsuario: {
      count: vi.fn().mockResolvedValue(over.conocidos ?? 1),
      createMany: vi.fn().mockResolvedValue({ count: over.creados ?? 1 }),
      update: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(async (cb: (c: unknown) => unknown) => cb(tx)),
  };
  const notifications = { notifyFromTemplate: vi.fn().mockResolvedValue(undefined), notifyAdminsFromTemplate: vi.fn() };
  const eventos = { record: vi.fn().mockResolvedValue(true) };
  const emitter = { emit: vi.fn() };
  const jwt = { sign: vi.fn().mockReturnValue('jwt'), verify: vi.fn() };
  const service = new AuthService(
    prisma as unknown as PrismaService,
    jwt as unknown as JwtService,
    notifications as unknown as NotificationsService,
    undefined,
    undefined,
    eventos as unknown as SecurityEventsService,
    emitter as unknown as EventEmitter2,
  );
  return { service, prisma, tx, notifications, eventos, emitter, jwt };
}

describe('MEJ-81/82 login con dispositivo', () => {
  const login = (s: AuthService, idDispositivo = 'dev-1') =>
    s.login({ correo: 'a@uvg.edu.gt', contrasena: 'x' }, undefined, { userAgent: UA, idDispositivo });

  it('guarda navegador, sistema, huella e id de sesion en el refresh token, sin la IP', async () => {
    (bcrypt.compare as Mock).mockResolvedValue(true);
    const { service, prisma } = setup();

    await login(service);

    const data = prisma.tokenRefresco.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      navegador: 'Chrome',
      sistema: 'Windows',
      huella: huellaDispositivo('dev-1', parseUserAgent(UA)),
    });
    expect(data.idSesion).toMatch(/^[0-9a-f-]{36}$/);
    expect(Object.keys(data)).not.toContain('ip');
  });

  it('navegador nuevo en una cuenta con otros conocidos: notifica con el id de sesion', async () => {
    (bcrypt.compare as Mock).mockResolvedValue(true);
    const { service, notifications, prisma } = setup({ conocidos: 2, creados: 1 });

    await login(service);

    const idSesion = prisma.tokenRefresco.create.mock.calls[0][0].data.idSesion;
    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([1], 'NUEVO_INICIO_SESION', {
      navegador: 'Chrome',
      sistema: 'Windows',
      idSesion,
    });
  });

  it('primer navegador de la cuenta: se registra sin avisar', async () => {
    (bcrypt.compare as Mock).mockResolvedValue(true);
    const { service, notifications, prisma } = setup({ conocidos: 0, creados: 1 });

    await login(service);

    expect(prisma.dispositivoUsuario.createMany).toHaveBeenCalled();
    expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
  });

  it('navegador ya visto: solo actualiza la ultima vez, sin avisar', async () => {
    (bcrypt.compare as Mock).mockResolvedValue(true);
    const { service, notifications, prisma } = setup({ conocidos: 2, creados: 0 });

    await login(service);

    expect(prisma.dispositivoUsuario.update).toHaveBeenCalled();
    expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
  });

  it('si falla el registro del dispositivo el login igual entrega los tokens', async () => {
    (bcrypt.compare as Mock).mockResolvedValue(true);
    const { service, prisma } = setup();
    prisma.dispositivoUsuario.count.mockRejectedValue(new Error('db'));

    await expect(login(service)).resolves.toEqual({ accessToken: 'jwt', refreshToken: 'jwt' });
  });

  it('un usuario inactivo no inicia sesion ni recibe tokens', async () => {
    (bcrypt.compare as Mock).mockResolvedValue(true);
    const { service, prisma } = setup();
    prisma.usuario.findUnique.mockResolvedValue({ ...usuario, estado: 'INACTIVO' });

    await expect(login(service)).rejects.toThrow();
    expect(prisma.tokenRefresco.create).not.toHaveBeenCalled();
  });
});

describe('MEJ-81 refresh conserva la sesion', () => {
  it('el token rotado hereda id de sesion, navegador, sistema y huella', async () => {
    const { service, prisma, jwt } = setup();
    jwt.verify.mockReturnValue({ sub: 1, correo: 'a@uvg.edu.gt', tipo: 'refresh', sv: 3 });
    prisma.tokenRefresco.findUnique.mockResolvedValue({
      idTokenRefresco: 'fila',
      idUsuario: 1,
      revocadoEn: null,
      expiraEn: new Date(Date.now() + 60_000),
      idSesion: 'sesion-1',
      navegador: 'Firefox',
      sistema: 'Linux',
      huella: 'hh',
    });

    await service.refreshToken('viejo');

    expect(prisma.tokenRefresco.create.mock.calls[0][0].data).toMatchObject({
      idSesion: 'sesion-1',
      navegador: 'Firefox',
      sistema: 'Linux',
      huella: 'hh',
    });
  });
});

describe('MEJ-83 cambiarContrasena', () => {
  it('con la actual correcta: sube sesionVersion, revoca todas las sesiones y emite tokens nuevos de la misma sesion', async () => {
    (bcrypt.compare as Mock).mockResolvedValue(true);
    (bcrypt.hash as Mock).mockResolvedValue('nuevo-hash');
    const { service, prisma, tx, eventos, emitter, jwt } = setup();

    const r = await service.cambiarContrasena(1, 'vieja-123', 'nueva-1234', 'refresh-actual');

    expect(tx.usuario.update).toHaveBeenCalledWith({
      where: { idUsuario: 1 },
      data: { contrasena: 'nuevo-hash', sesionVersion: { increment: 1 } },
      select: { sesionVersion: true },
    });
    expect(tx.tokenRefresco.updateMany).toHaveBeenCalledWith({
      where: { idUsuario: 1, revocadoEn: null },
      data: { revocadoEn: expect.any(Date) },
    });
    expect(jwt.sign).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'access', sv: 4 }), expect.anything());
    expect(prisma.tokenRefresco.create.mock.calls[0][0].data).toMatchObject({ idSesion: 'sesion-actual', huella: 'h' });
    expect(eventos.record).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'PASSWORD_CHANGED', idActor: 1, detalle: { sesionesRevocadas: 3 } }),
    );
    expect(emitter.emit).toHaveBeenCalled();
    expect(r).toEqual({ accessToken: 'jwt', refreshToken: 'jwt' });
  });

  it('la sesion actual se busca solo entre los tokens de la cuenta', async () => {
    (bcrypt.compare as Mock).mockResolvedValue(true);
    (bcrypt.hash as Mock).mockResolvedValue('h');
    const { service, prisma } = setup();

    await service.cambiarContrasena(1, 'vieja-123', 'nueva-1234', 'refresh-actual');

    expect(prisma.tokenRefresco.findFirst).toHaveBeenCalledWith({
      where: { tokenHash: expect.any(String), idUsuario: 1 },
    });
  });

  it('con la actual incorrecta responde 400 y no cambia nada', async () => {
    (bcrypt.compare as Mock).mockResolvedValue(false);
    const { service, prisma } = setup();

    await expect(service.cambiarContrasena(1, 'mala', 'nueva-1234')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.tokenRefresco.create).not.toHaveBeenCalled();
  });

  it('la nueva igual a la actual se rechaza', async () => {
    (bcrypt.compare as Mock).mockResolvedValue(true);
    const { service, prisma } = setup();

    await expect(service.cambiarContrasena(1, 'misma-1234', 'misma-1234')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('tras 5 intentos fallidos la cuenta queda bloqueada (429) aunque llegue la contrasena correcta', async () => {
    const { service, prisma } = setup();
    (bcrypt.compare as Mock).mockResolvedValue(false);
    for (let i = 0; i < 5; i++) {
      await expect(service.cambiarContrasena(1, 'mala', 'nueva-1234')).rejects.toBeInstanceOf(BadRequestException);
    }
    (bcrypt.compare as Mock).mockResolvedValue(true);

    const error = await service.cambiarContrasena(1, 'vieja-123', 'nueva-1234').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('MEJ-81 refresh: cierre deliberado frente a reuso', () => {
  const fila = (over: object) => ({
    idTokenRefresco: 'fila',
    idUsuario: 1,
    revocadoEn: new Date(Date.now() - 60_000),
    expiraEn: new Date(Date.now() + 3_600_000),
    ...over,
  });

  it('un token cerrado a propósito (expiraEn <= revocadoEn) da 401 y no revoca las demás sesiones', async () => {
    const { service, prisma, jwt } = setup();
    jwt.verify.mockReturnValue({ sub: 1, correo: 'a@uvg.edu.gt', tipo: 'refresh', sv: 3 });
    const cierre = new Date(Date.now() - 60_000);
    prisma.tokenRefresco.findUnique.mockResolvedValue(fila({ revocadoEn: cierre, expiraEn: cierre }));

    await expect(service.refreshToken('cerrado')).rejects.toMatchObject({ status: 401 });

    expect(prisma.tokenRefresco.updateMany).not.toHaveBeenCalled();
  });

  it('el reuso real de un token rotado sigue revocando todas las sesiones vivas', async () => {
    const { service, prisma, jwt } = setup();
    jwt.verify.mockReturnValue({ sub: 1, correo: 'a@uvg.edu.gt', tipo: 'refresh', sv: 3 });
    prisma.tokenRefresco.findUnique.mockResolvedValue(fila({}));

    await expect(service.refreshToken('rotado')).rejects.toMatchObject({ status: 401 });

    expect(prisma.tokenRefresco.updateMany).toHaveBeenCalledWith({
      where: { idUsuario: 1, revocadoEn: null },
      data: { revocadoEn: expect.any(Date) },
    });
  });
});
