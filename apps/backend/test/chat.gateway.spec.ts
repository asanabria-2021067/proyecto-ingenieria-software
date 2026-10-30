import { describe, expect, it, vi } from 'vitest';
import { ChatGateway } from '../src/chat/chat.gateway';
import { WsAuthService } from '../src/ws-auth/ws-auth.service';
import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../src/prisma/prisma.service';

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

const CANAL = { esCanal: true, idProyecto: 10, proyecto: { creadoPor: 1, eliminadoEn: null } };

function makeGateway(prismaOverrides: { findFirst?: ReturnType<typeof vi.fn>; participacion?: ReturnType<typeof vi.fn> } = {}) {
  const jwtService = { verifyAsync: vi.fn() };
  const prisma = {
    conversacion: { findFirst: prismaOverrides.findFirst ?? vi.fn() },
    participacionProyecto: { findFirst: prismaOverrides.participacion ?? vi.fn().mockResolvedValue(null) },
    // G07-C03: la política del handshake consulta el estado de la cuenta.
    usuario: { findUnique: vi.fn().mockResolvedValue({ estado: 'ACTIVO', sesionVersion: 0 }) },
  };
  const gateway = new ChatGateway(
    new WsAuthService(jwtService as unknown as JwtService, prisma as unknown as PrismaService),
    prisma as unknown as PrismaService,
  );
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

    /**
     * T-210 (revisión cruzada): el token de recuperación de contraseña
     * (`tipo: 'reset'`) se firma con el mismo JWT_SECRET que el access token
     * y verifica igual con `verifyAsync` — sin este chequeo, quien tuviera
     * un enlace de recuperación abría un socket autenticado como esa
     * persona y recibía sus mensajes de chat.
     */
    it('rechaza (desconecta) un token que no es de tipo "access" (p. ej. el de recuperación de contraseña)', async () => {
      const { gateway, jwtService } = makeGateway();
      jwtService.verifyAsync.mockResolvedValue({ sub: 7, correo: 'x@uvg.edu.gt', tipo: 'reset' });
      const socket = makeSocket({ auth: { token: 'token-de-reset' } });

      await gateway.handleConnection(socket as any);

      expect(socket.disconnect).toHaveBeenCalled();
      expect(socket.join).not.toHaveBeenCalled();
    });
  });

  describe('joinConversation — un usuario ajeno al proyecto no puede unirse a la sala ni leer mensajes', () => {
    it('sin fila en ConversacionParticipante, no une al cliente a la room de la conversación', async () => {
      const findFirst = vi.fn().mockResolvedValue(null);
      const { gateway } = makeGateway({ findFirst });
      const socket = makeSocket();
      socket.data.userId = 99;

      const ack = await gateway.joinConversation(socket as any, { idConversacion: 1 });

      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { idConversacion: 1, eliminadaEn: null, participantes: { some: { idUsuario: 99 } } },
        }),
      );
      expect(socket.join).not.toHaveBeenCalled();
      expect(ack).toEqual({ joined: false });
    });

    it('ex lider sin participacion activa en #general no entra a la room', async () => {
      const { gateway } = makeGateway({ findFirst: vi.fn().mockResolvedValue(CANAL) });
      const socket = makeSocket();
      socket.data.userId = 5;

      await expect(gateway.joinConversation(socket as any, { idConversacion: 3 })).resolves.toEqual({ joined: false });
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('miembro activo en #general entra a la room', async () => {
      const { gateway } = makeGateway({
        findFirst: vi.fn().mockResolvedValue(CANAL),
        participacion: vi.fn().mockResolvedValue({ idParticipacion: 1 }),
      });
      const socket = makeSocket();
      socket.data.userId = 5;

      await expect(gateway.joinConversation(socket as any, { idConversacion: 3 })).resolves.toEqual({ joined: true });
      expect(socket.join).toHaveBeenCalledWith('conversation:3');
    });

    it('lider vigente en #general entra a la room', async () => {
      const { gateway } = makeGateway({ findFirst: vi.fn().mockResolvedValue(CANAL) });
      const socket = makeSocket();
      socket.data.userId = 1;

      await expect(gateway.joinConversation(socket as any, { idConversacion: 3 })).resolves.toEqual({ joined: true });
    });

    it('conversacion eliminada: joined false', async () => {
      const { gateway } = makeGateway({ findFirst: vi.fn().mockResolvedValue(null) });
      const socket = makeSocket();
      socket.data.userId = 5;

      await expect(gateway.joinConversation(socket as any, { idConversacion: 3 })).resolves.toEqual({ joined: false });
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('sin userId autenticado en el socket, ni siquiera consulta la participación', async () => {
      const findFirst = vi.fn();
      const { gateway } = makeGateway({ findFirst });
      const socket = makeSocket();

      const ack = await gateway.joinConversation(socket as any, { idConversacion: 1 });

      expect(findFirst).not.toHaveBeenCalled();
      expect(socket.join).not.toHaveBeenCalled();
      expect(ack).toEqual({ joined: false });
    });

    it('con fila en ConversacionParticipante, sí une al cliente a la room conversation:{id} y confirma con { joined: true }', async () => {
      const findFirst = vi.fn().mockResolvedValue({ idUsuario: 5 });
      const { gateway } = makeGateway({ findFirst });
      const socket = makeSocket();
      socket.data.userId = 5;

      const ack = await gateway.joinConversation(socket as any, { idConversacion: 3 });

      expect(socket.join).toHaveBeenCalledWith('conversation:3');
      expect(ack).toEqual({ joined: true });
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

    it('además emite conversationUpdated a la room user:{id} de CADA destinatario, sin depender de que estén en la room de la conversación', () => {
      const { gateway } = makeGateway();
      const emit = vi.fn();
      const to = vi.fn(() => ({ emit }));
      Reflect.set(gateway, 'server', { to });

      gateway.broadcastMessage(3, [5, 6], { contenido: 'hola' });

      expect(to).toHaveBeenCalledWith('user:5');
      expect(to).toHaveBeenCalledWith('user:6');
      expect(emit).toHaveBeenCalledWith('conversationUpdated', { idConversacion: 3 });
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

  describe('typing', () => {
    it('un participante emite typing al resto de la room (sin incluirse)', async () => {
      const findFirst = vi.fn().mockResolvedValue({ idUsuario: 5 });
      const { gateway } = makeGateway({ findFirst });
      const emit = vi.fn();
      const socket = { ...makeSocket(), to: vi.fn(() => ({ emit })) };
      socket.data.userId = 5;

      const ack = await gateway.typing(socket as any, { idConversacion: 3 });

      expect(socket.to).toHaveBeenCalledWith('conversation:3');
      expect(emit).toHaveBeenCalledWith('typing', { idConversacion: 3, idUsuario: 5 });
      expect(ack).toEqual({ ok: true });
    });

    it('ex lider sin participacion activa en #general: ok false', async () => {
      const { gateway } = makeGateway({ findFirst: vi.fn().mockResolvedValue(CANAL) });
      const socket = { ...makeSocket(), to: vi.fn() };
      socket.data.userId = 5;

      await expect(gateway.typing(socket as any, { idConversacion: 3 })).resolves.toEqual({ ok: false });
      expect(socket.to).not.toHaveBeenCalled();
    });

    it('un ajeno a la conversacion no emite nada', async () => {
      const { gateway } = makeGateway({ findFirst: vi.fn().mockResolvedValue(null) });
      const socket = { ...makeSocket(), to: vi.fn() };
      socket.data.userId = 99;

      await expect(gateway.typing(socket as any, { idConversacion: 3 })).resolves.toEqual({ ok: false });
      expect(socket.to).not.toHaveBeenCalled();
    });
  });

  describe('notifyMessagesRead', () => {
    it('emite messagesRead a la room de la conversacion', () => {
      const { gateway } = makeGateway();
      const emit = vi.fn();
      const to = vi.fn(() => ({ emit }));
      Reflect.set(gateway, 'server', { to });
      const fecha = new Date();

      gateway.notifyMessagesRead(3, 7, fecha);

      expect(to).toHaveBeenCalledWith('conversation:3');
      expect(emit).toHaveBeenCalledWith('messagesRead', { idConversacion: 3, idUsuario: 7, ultimaLecturaEn: fecha });
    });
  });

  describe('removeFromConversation', () => {
    it('saca los sockets del usuario de la room y le refresca la lista', () => {
      const { gateway } = makeGateway();
      const emit = vi.fn();
      const to = vi.fn(() => ({ emit }));
      const socketsLeave = vi.fn();
      const inRoom = vi.fn(() => ({ socketsLeave }));
      Reflect.set(gateway, 'server', { to, in: inRoom });

      gateway.removeFromConversation(3, [5]);

      expect(inRoom).toHaveBeenCalledWith('user:5');
      expect(socketsLeave).toHaveBeenCalledWith('conversation:3');
      expect(to).toHaveBeenCalledWith('user:5');
      expect(emit).toHaveBeenCalledWith('conversationUpdated', { idConversacion: 3 });
    });
  });
});
