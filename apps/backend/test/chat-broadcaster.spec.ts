import { describe, expect, it, vi } from 'vitest';
import { ChatBroadcaster } from '../src/chat/chat-broadcaster';

function makeBroadcaster() {
  const emit = vi.fn();
  const to = vi.fn((_room: string) => ({ emit }));
  return { broadcaster: new ChatBroadcaster(() => ({ to }) as any), to, emit };
}

describe('ChatBroadcaster', () => {
  it('broadcastMessage: newMessage a la room de la conversacion y conversationUpdated a cada destinatario', () => {
    const { broadcaster, to, emit } = makeBroadcaster();

    broadcaster.broadcastMessage(3, [5, 6], { contenido: 'hola' });

    expect(to.mock.calls.map(([room]) => room)).toEqual(['conversation:3', 'user:5', 'user:6']);
    expect(emit).toHaveBeenCalledWith('newMessage', { idConversacion: 3, mensaje: { contenido: 'hola' } });
    expect(emit).toHaveBeenCalledWith('conversationUpdated', { idConversacion: 3 });
  });

  it('notifyConversationCreated: solo conversationUpdated a cada destinatario', () => {
    const { broadcaster, to, emit } = makeBroadcaster();

    broadcaster.notifyConversationCreated(8, [1, 2]);

    expect(to.mock.calls.map(([room]) => room)).toEqual(['user:1', 'user:2']);
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenCalledWith('conversationUpdated', { idConversacion: 8 });
  });
});

describe('ChatBroadcaster.messagesRead', () => {
  it('emite messagesRead solo a la room de la conversacion', () => {
    const { broadcaster, to, emit } = makeBroadcaster();
    const fecha = new Date('2026-10-16T12:00:00Z');

    broadcaster.messagesRead(3, 7, fecha);

    expect(to.mock.calls.map(([room]) => room)).toEqual(['conversation:3']);
    expect(emit).toHaveBeenCalledWith('messagesRead', { idConversacion: 3, idUsuario: 7, ultimaLecturaEn: fecha });
  });
});