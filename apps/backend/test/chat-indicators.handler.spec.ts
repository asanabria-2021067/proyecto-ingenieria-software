import { describe, expect, it, vi } from 'vitest';
import { ChatIndicatorsHandler } from '../src/chat/chat-indicators.handler';
import type { PrismaService } from '../src/prisma/prisma.service';

function makeHandler(findUnique = vi.fn()) {
  const prisma = { conversacionParticipante: { findUnique } };
  return { handler: new ChatIndicatorsHandler(prisma as unknown as PrismaService), findUnique };
}

function makeSocket(userId?: number) {
  const emit = vi.fn();
  const to = vi.fn((_room: string) => ({ emit }));
  return { socket: { data: { userId }, to }, to, emit };
}

describe('ChatIndicatorsHandler.typing', () => {
  it('participante: emite typing al resto de la room y no persiste nada', async () => {
    const { handler, findUnique } = makeHandler(vi.fn().mockResolvedValue({ idUsuario: 5 }));
    const { socket, to, emit } = makeSocket(5);

    await expect(handler.typing(socket as any, { idConversacion: 3 })).resolves.toEqual({ ok: true });

    expect(findUnique).toHaveBeenCalledWith({
      where: { idConversacion_idUsuario: { idConversacion: 3, idUsuario: 5 } },
      select: { idUsuario: true },
    });
    expect(to).toHaveBeenCalledWith('conversation:3');
    expect(emit).toHaveBeenCalledWith('typing', { idConversacion: 3, idUsuario: 5 });
  });

  it('no participante: no emite nada', async () => {
    const { handler } = makeHandler(vi.fn().mockResolvedValue(null));
    const { socket, to } = makeSocket(99);

    await expect(handler.typing(socket as any, { idConversacion: 3 })).resolves.toEqual({ ok: false });
    expect(to).not.toHaveBeenCalled();
  });

  it.each([
    ['sin userId', undefined, { idConversacion: 3 }],
    ['sin payload', 5, undefined],
    ['idConversacion no numerico', 5, { idConversacion: '3' }],
    ['idConversacion decimal', 5, { idConversacion: 3.5 }],
  ])('%s: ni consulta la BD ni emite', async (_nombre, userId, data) => {
    const { handler, findUnique } = makeHandler();
    const { socket, to } = makeSocket(userId);

    await expect(handler.typing(socket as any, data as any)).resolves.toEqual({ ok: false });
    expect(findUnique).not.toHaveBeenCalled();
    expect(to).not.toHaveBeenCalled();
  });
});
