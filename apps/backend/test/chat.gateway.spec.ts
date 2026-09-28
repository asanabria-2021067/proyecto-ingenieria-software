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
      const findUnique = vi.fn().mockResolvedValue(null);
      const { gateway } = makeGateway({ findUnique });
      const socket = makeSocket();
      socket.data.userId = 99;

      const ack = await gateway.joinConversation(socket as any, { idConversacion: 1 });

      expect(findUnique).toHaveBeenCalledWith({
        where: { idConversacion_idUsuario: { idConversacion: 1, idUsuario: 99 } },
        select: { idUsuario: true },
      });
      expect(socket.join).not.toHaveBeenCalled();
      expect(ack).toEqual({ joined: false });
    });

    it('sin userId autenticado en el socket, ni siquiera consulta la participación', async () => {
      const findUnique = vi.fn();
      const { gateway } = makeGateway({ findUnique });
      const socket = makeSocket();

      const ack = await gateway.joinConversation(socket as any, { idConversacion: 1 });

      expect(findUnique).not.toHaveBeenCalled();
      expect(socket.join).not.toHaveBeenCalled();
      expect(ack).toEqual({ joined: false });
    });

    it('con fila en ConversacionParticipante, sí une al cliente a la room conversation:{id} y confirma con { joined: true }', async () => {
      const findUnique = vi.fn().mockResolvedValue({ idUsuario: 5 });
      const { gateway } = makeGateway({ findUnique });
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

  describe('T-237: un chat archivado no recibe mensajes por socket', () => {
    // El rechazo de mensajes en un chat archivado vive en
    // ChatService.createMessage (cubierto en chat.service.spec.ts). Eso solo
    // alcanza si el socket no tiene un camino propio para crear mensajes que
    // se salte ese chequeo: estas pruebas fijan que el gateway únicamente
    // escucha unirse/salir de una sala, así que un cliente que emita
    // directamente un evento de envío no tiene handler que lo procese.
    // Claves de metadata que registra @SubscribeMessage en @nestjs/websockets.
    // Si Nest las cambiara, la primera prueba falla (lista vacía) en vez de
    // pasar en falso.
    const MESSAGE_MAPPING_METADATA = 'websockets:message_mapping';
    const MESSAGE_METADATA = 'message';

    function eventosEscuchados(): string[] {
      const prototipo = ChatGateway.prototype as unknown as Record<string, unknown>;
      return Object.getOwnPropertyNames(prototipo)
        .map((nombre) => prototipo[nombre])
        .filter((metodo): metodo is (...args: unknown[]) => unknown => typeof metodo === 'function')
        .filter((metodo) => Reflect.getMetadata(MESSAGE_MAPPING_METADATA, metodo) === true)
        .map((metodo) => Reflect.getMetadata(MESSAGE_METADATA, metodo) as string)
        .sort();
    }

    it('el gateway solo escucha joinConversation y leaveConversation', () => {
      expect(eventosEscuchados()).toEqual(['joinConversation', 'leaveConversation']);
    });

    it('no escucha ningún evento de envío de mensajes (sendMessage, newMessage, mensaje)', () => {
      const eventos = eventosEscuchados();
      for (const evento of ['sendMessage', 'newMessage', 'mensaje', 'message']) {
        expect(eventos).not.toContain(evento);
      }
    });
  });
});
