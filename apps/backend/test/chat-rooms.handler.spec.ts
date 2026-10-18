import { describe, expect, it, vi } from 'vitest';
import { ChatRoomsHandler } from '../src/chat/chat-rooms.handler';
import type { PrismaService } from '../src/prisma/prisma.service';

function makeHandler(findUnique = vi.fn()) {
  const prisma = { conversacionParticipante: { findUnique } };
  return { handler: new ChatRoomsHandler(prisma as unknown as PrismaService), findUnique };
}

function makeSocket(userId?: number) {
  return { data: { userId }, join: vi.fn(), leave: vi.fn() };
}

describe('ChatRoomsHandler', () => {
  it('join: sin participacion no entra a la room', async () => {
    const { handler, findUnique } = makeHandler(vi.fn().mockResolvedValue(null));
    const socket = makeSocket(99);

    await expect(handler.join(socket as any, { idConversacion: 1 })).resolves.toEqual({ joined: false });
    expect(findUnique).toHaveBeenCalledWith({
      where: { idConversacion_idUsuario: { idConversacion: 1, idUsuario: 99 } },
      select: { idUsuario: true },
    });
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('join: sin userId o sin idConversacion no consulta la BD', async () => {
    const { handler, findUnique } = makeHandler();

    await expect(handler.join(makeSocket() as any, { idConversacion: 1 })).resolves.toEqual({ joined: false });
    await expect(handler.join(makeSocket(5) as any, {} as any)).resolves.toEqual({ joined: false });
    await expect(handler.join(makeSocket(5) as any, undefined as any)).resolves.toEqual({ joined: false });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('join: con participacion entra a conversation:{id}', async () => {
    const { handler } = makeHandler(vi.fn().mockResolvedValue({ idUsuario: 5 }));
    const socket = makeSocket(5);

    await expect(handler.join(socket as any, { idConversacion: 3 })).resolves.toEqual({ joined: true });
    expect(socket.join).toHaveBeenCalledWith('conversation:3');
  });

  it('leave: sale de la room y no hace nada sin idConversacion', () => {
    const { handler } = makeHandler();
    const socket = makeSocket(5);

    handler.leave(socket as any, { idConversacion: 3 });
    handler.leave(socket as any, undefined as any);

    expect(socket.leave).toHaveBeenCalledTimes(1);
    expect(socket.leave).toHaveBeenCalledWith('conversation:3');
  });
});
