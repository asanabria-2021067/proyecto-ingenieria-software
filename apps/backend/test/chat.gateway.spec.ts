import { describe, expect, it, vi } from 'vitest';
import { ChatGateway } from '../src/chat/chat.gateway';

function makeSocket(overrides: Partial<{ auth: Record<string, unknown>; headers: Record<string, unknown> }> = {}) {
  return {
    id: 'socket-1',
    handshake: {
      auth: overrides.auth ?? {},
      headers: overrides.headers ?? {},
    },
    data: {} as Record<string, unknown>,
    join: vi.fn(),
    leave: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
  };
}

function makeGateway(prismaOverrides: { findUnique?: ReturnType<typeof vi.fn> } = {}) {
  const jwtService = { verifyAsync: vi.fn() };
  const prisma = {
    conversacionParticipante: {
      findUnique: prismaOverrides.findUnique ?? vi.fn(),
    },
  };
  const gateway = new ChatGateway(jwtService as any, prisma as any);
  return { gateway, jwtService, prisma };
}

describe('ChatGateway', () => {
  describe('handleConnection', () => {
    it('rechaza (desconecta) un cliente sin token', async () => {
      const { gateway } = makeGateway();
      const socket = makeSocket();

      await gateway.handleConnection(socket as any);

      expect(socket.disconnect).toHaveBeenCalled();
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('rechaza (desconecta) un cliente con token inválido', async () => {
      const { gateway, jwtService } = makeGateway();
      jwtService.verifyAsync.mockRejectedValue(new Error('invalid'));
      const socket = makeSocket({ auth: { token: 'token-invalido' } });

      await gateway.handleConnection(socket as any);

      expect(socket.disconnect).toHaveBeenCalled();
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('con token válido, une al cliente a su room user:{id} y confirma la conexión', async () => {
      const { gateway, jwtService } = makeGateway();
      jwtService.verifyAsync.mockResolvedValue({ sub: 7, correo: 'x@uvg.edu.gt', tipo: 'access' });
      const socket = makeSocket({ auth: { token: 'token-valido' } });

      await gateway.handleConnection(socket as any);

      expect(socket.disconnect).not.toHaveBeenCalled();
      expect(socket.join).toHaveBeenCalledWith('user:7');
      expect(socket.data.userId).toBe(7);
      expect(socket.emit).toHaveBeenCalledWith('connected', { userId: 7 });
    });
  });

  describe('joinConversation — un usuario ajeno al proyecto no puede unirse a la sala ni leer mensajes', () => {
    it('sin fila en ConversacionParticipante, no une al cliente a la room de la conversación', async () => {
      const findUnique = vi.fn().mockResolvedValue(null);
      const { gateway } = makeGateway({ findUnique });
      const socket = makeSocket();
      socket.data.userId = 99;

      await gateway.joinConversation(socket as any, { idConversacion: 1 });

      expect(findUnique).toHaveBeenCalledWith({
        where: { idConversacion_idUsuario: { idConversacion: 1, idUsuario: 99 } },
        select: { idUsuario: true },
      });
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('sin userId autenticado en el socket, ni siquiera consulta la participación', async () => {
      const findUnique = vi.fn();
      const { gateway } = makeGateway({ findUnique });
      const socket = makeSocket();

      await gateway.joinConversation(socket as any, { idConversacion: 1 });

      expect(findUnique).not.toHaveBeenCalled();
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('con fila en ConversacionParticipante, sí une al cliente a la room conversation:{id}', async () => {
      const findUnique = vi.fn().mockResolvedValue({ idUsuario: 5 });
      const { gateway } = makeGateway({ findUnique });
      const socket = makeSocket();
      socket.data.userId = 5;

      await gateway.joinConversation(socket as any, { idConversacion: 3 });

      expect(socket.join).toHaveBeenCalledWith('conversation:3');
    });
  });

  describe('broadcastMessage — solo llega a quien está en la room de la conversación', () => {
    it('emite newMessage únicamente a la room conversation:{id}, nunca a los destinatarios directamente', () => {
      const { gateway } = makeGateway();
      const emit = vi.fn();
      const to = vi.fn(() => ({ emit }));
      Reflect.set(gateway, 'server', { to });

      gateway.broadcastMessage(3, [5, 6], { contenido: 'hola' });

      expect(to).toHaveBeenCalledWith('conversation:3');
      expect(emit).toHaveBeenCalledWith('newMessage', { idConversacion: 3, mensaje: { contenido: 'hola' } });
    });
  });

  describe('leaveConversation', () => {
    it('saca al cliente de la room de la conversación', () => {
      const { gateway } = makeGateway();
      const socket = makeSocket();

      gateway.leaveConversation(socket as any, { idConversacion: 3 });

      expect(socket.leave).toHaveBeenCalledWith('conversation:3');
    });
  });
});
