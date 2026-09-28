import { describe, expect, it, vi } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { EstadoUsuario } from '@prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import { ChatGateway } from '../src/chat/chat.gateway';
import { WsAuthService } from '../src/ws-auth/ws-auth.service';
import { SYNTHETIC_JWT_SECRET } from './helpers/synthetic-jwt-secret';

/**
 * G07-C03 · OWASP25-C025 + C005 (T09–T11 · HU-159). El handshake del
 * namespace /chat usa la misma política que notificaciones; la autorización
 * por participación (ConversacionParticipante) no cambia. Tokens reales
 * firmados; solo Prisma es un doble.
 */

const jwt = new JwtService({ secret: SYNTHETIC_JWT_SECRET });
const sign = (payload: Record<string, unknown>) => jwt.sign(payload, { secret: SYNTHETIC_JWT_SECRET, expiresIn: 3600 });
const access = (sub = 7) => sign({ sub, correo: 'c@uvg.edu.gt', tipo: 'access' });

function makeSocket(token?: string) {
  return {
    id: 'socket-c1',
    handshake: { auth: {}, headers: token ? { cookie: `access_token=${token}` } : {} },
    data: {} as Record<string, unknown>,
    join: vi.fn(),
    leave: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
  };
}

function makeGateway(options: { estado?: EstadoUsuario | null; participa?: boolean } = {}) {
  const estado = options.estado === undefined ? EstadoUsuario.ACTIVO : options.estado;
  const participante = vi.fn().mockResolvedValue(options.participa ? { idUsuario: 7 } : null);
  const prisma = {
    usuario: { findUnique: vi.fn().mockResolvedValue(estado ? { estado } : null) },
    conversacionParticipante: { findUnique: participante },
  } as unknown as PrismaService;
  const gateway = new ChatGateway(new WsAuthService(new JwtService({ secret: SYNTHETIC_JWT_SECRET }), prisma), prisma);
  return { gateway, participante };
}

function expectRejected(socket: ReturnType<typeof makeSocket>) {
  expect(socket.disconnect).toHaveBeenCalledTimes(1);
  expect(socket.join).not.toHaveBeenCalled();
  expect(socket.emit).not.toHaveBeenCalled();
  expect(socket.data.userId).toBeUndefined();
}

describe('G07-C03: el gateway de chat exige la política de acceso', () => {
  it('T09: access token de una cuenta ACTIVO entra a su room user:{id}', async () => {
    const { gateway } = makeGateway();
    const socket = makeSocket(access());

    await gateway.handleConnection(socket as never);

    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(socket.data.userId).toBe(7);
    expect(socket.join).toHaveBeenCalledWith('user:7');
    expect(socket.emit).toHaveBeenCalledWith('connected', { userId: 7 });
  });

  it.each([
    ['reset', { sub: 7, correo: 'c@uvg.edu.gt', tipo: 'reset', idSolicitud: 1 }],
    ['refresh', { sub: 7, correo: 'c@uvg.edu.gt', tipo: 'refresh', jti: 'j' }],
  ])('T10: un token de %s no conecta', async (_tipo, payload) => {
    const { gateway } = makeGateway();
    const socket = makeSocket(sign(payload));

    await gateway.handleConnection(socket as never);

    expectRejected(socket);
  });

  it.each([EstadoUsuario.BLOQUEADO, EstadoUsuario.INACTIVO])('T11: una cuenta %s no conecta', async (estado) => {
    const { gateway } = makeGateway({ estado });
    const socket = makeSocket(access());

    await gateway.handleConnection(socket as never);

    expectRejected(socket);
  });

  it('un socket rechazado no puede unirse a ninguna conversación (ni siquiera se consulta la participación)', async () => {
    const { gateway, participante } = makeGateway({ estado: EstadoUsuario.BLOQUEADO, participa: true });
    const socket = makeSocket(access());

    await gateway.handleConnection(socket as never);
    const ack = await gateway.joinConversation(socket as never, { idConversacion: 3 });

    expect(ack).toEqual({ joined: false });
    expect(participante).not.toHaveBeenCalled();
  });

  describe('la autorización por participación no cambia', () => {
    it('autenticado y participante → se une a conversation:{id}', async () => {
      const { gateway, participante } = makeGateway({ participa: true });
      const socket = makeSocket(access());

      await gateway.handleConnection(socket as never);
      const ack = await gateway.joinConversation(socket as never, { idConversacion: 3 });

      expect(participante).toHaveBeenCalledWith({
        where: { idConversacion_idUsuario: { idConversacion: 3, idUsuario: 7 } },
        select: { idUsuario: true },
      });
      expect(socket.join).toHaveBeenCalledWith('conversation:3');
      expect(ack).toEqual({ joined: true });
    });

    it('autenticado pero ajeno a la conversación → no se une', async () => {
      const { gateway } = makeGateway({ participa: false });
      const socket = makeSocket(access());

      await gateway.handleConnection(socket as never);
      const ack = await gateway.joinConversation(socket as never, { idConversacion: 3 });

      expect(ack).toEqual({ joined: false });
      expect(socket.join).not.toHaveBeenCalledWith('conversation:3');
    });
  });
});
