import { describe, expect, it, vi } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { EstadoUsuario } from '@prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import { NotificationsGateway } from '../src/notifications/notifications.gateway';
import { WsAuthService } from '../src/ws-auth/ws-auth.service';
import { SYNTHETIC_JWT_SECRET } from './helpers/synthetic-jwt-secret';

/**
 * G07-C02 · OWASP25-C025 (T09–T11 · HU-157). El handshake del namespace
 * /notifications usa la política compartida: solo un access token de una
 * cuenta ACTIVO entra a su room `user:{id}`. Tokens reales firmados; solo
 * Prisma es un doble. La room y el evento `connected` no cambian.
 */

const jwt = new JwtService({ secret: SYNTHETIC_JWT_SECRET });
const sign = (payload: Record<string, unknown>) => jwt.sign(payload, { secret: SYNTHETIC_JWT_SECRET, expiresIn: 3600 });

function makeSocket(token?: string) {
  return {
    id: 'socket-n1',
    handshake: { auth: token ? { token } : {}, headers: {} },
    data: {} as Record<string, unknown>,
    join: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
  };
}

function makeGateway(estado: EstadoUsuario | null = EstadoUsuario.ACTIVO) {
  const prisma = {
    usuario: { findUnique: vi.fn().mockResolvedValue(estado ? { estado } : null) },
  } as unknown as PrismaService;
  return new NotificationsGateway(new WsAuthService(new JwtService({ secret: SYNTHETIC_JWT_SECRET }), prisma));
}

function expectRejected(socket: ReturnType<typeof makeSocket>) {
  expect(socket.disconnect).toHaveBeenCalledTimes(1);
  expect(socket.join).not.toHaveBeenCalled();
  expect(socket.emit).not.toHaveBeenCalled();
  expect(socket.data.userId).toBeUndefined();
}

describe('G07-C02: el gateway de notificaciones exige la política de acceso', () => {
  it('T09: access token de una cuenta ACTIVO entra a su room user:{id} y recibe connected', async () => {
    const socket = makeSocket(sign({ sub: 7, correo: 'n@uvg.edu.gt', tipo: 'access' }));

    await makeGateway().handleConnection(socket as never);

    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(socket.data.userId).toBe(7);
    expect(socket.join).toHaveBeenCalledWith('user:7');
    expect(socket.emit).toHaveBeenCalledWith('connected', { userId: 7 });
  });

  it.each([
    ['reset', { sub: 7, correo: 'n@uvg.edu.gt', tipo: 'reset', idSolicitud: 1 }],
    ['refresh', { sub: 7, correo: 'n@uvg.edu.gt', tipo: 'refresh', jti: 'j' }],
    ['sin tipo', { sub: 7, correo: 'n@uvg.edu.gt' }],
  ])('T10: un token de %s firmado con el secreto de acceso no conecta', async (_tipo, payload) => {
    const socket = makeSocket(sign(payload));

    await makeGateway().handleConnection(socket as never);

    expectRejected(socket);
  });

  it.each([EstadoUsuario.BLOQUEADO, EstadoUsuario.INACTIVO])('T11: una cuenta %s no conecta con su access token vigente', async (estado) => {
    const socket = makeSocket(sign({ sub: 7, correo: 'n@uvg.edu.gt', tipo: 'access' }));

    await makeGateway(estado).handleConnection(socket as never);

    expectRejected(socket);
  });

  it.each([
    ['sin token', undefined],
    ['token inválido', 'no-es-un-jwt'],
  ])('%s no conecta', async (_caso, token) => {
    const socket = makeSocket(token);

    await makeGateway().handleConnection(socket as never);

    expectRejected(socket);
  });

  it('si la política falla (p. ej. base caída) el socket se desconecta', async () => {
    const prisma = { usuario: { findUnique: vi.fn().mockRejectedValue(new Error('db')) } } as unknown as PrismaService;
    const gateway = new NotificationsGateway(new WsAuthService(new JwtService({ secret: SYNTHETIC_JWT_SECRET }), prisma));
    const socket = makeSocket(sign({ sub: 7, correo: 'n@uvg.edu.gt', tipo: 'access' }));

    await gateway.handleConnection(socket as never);

    expectRejected(socket);
  });
});
