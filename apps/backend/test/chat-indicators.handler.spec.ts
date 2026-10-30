import { describe, expect, it, vi } from 'vitest';
import { ChatIndicatorsHandler } from '../src/chat/chat-indicators.handler';
import type { PrismaService } from '../src/prisma/prisma.service';

function makeHandler(findFirst = vi.fn(), participacion = vi.fn().mockResolvedValue(null)) {
  const prisma = { conversacion: { findFirst }, participacionProyecto: { findFirst: participacion } };
  return { handler: new ChatIndicatorsHandler(prisma as unknown as PrismaService), findFirst };
}

const CANAL = { esCanal: true, idProyecto: 10, proyecto: { creadoPor: 1, eliminadoEn: null } };
const DIRECTA = { esCanal: false, idProyecto: null, proyecto: null };

function makeSocket(userId?: number) {
  const emit = vi.fn();
  const to = vi.fn((_room: string) => ({ emit }));
  return { socket: { data: { userId }, to }, to, emit };
}

describe('ChatIndicatorsHandler.typing', () => {
  it('participante: emite typing al resto de la room y no persiste nada', async () => {
    const { handler, findFirst } = makeHandler(vi.fn().mockResolvedValue(DIRECTA));
    const { socket, to, emit } = makeSocket(5);

    await expect(handler.typing(socket as any, { idConversacion: 3 })).resolves.toEqual({ ok: true });

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idConversacion: 3, eliminadaEn: null, participantes: { some: { idUsuario: 5 } } },
      }),
    );
    expect(to).toHaveBeenCalledWith('conversation:3');
    expect(emit).toHaveBeenCalledWith('typing', { idConversacion: 3, idUsuario: 5 });
  });

  it('no participante: no emite nada', async () => {
    const { handler } = makeHandler(vi.fn().mockResolvedValue(null));
    const { socket, to } = makeSocket(99);

    await expect(handler.typing(socket as any, { idConversacion: 3 })).resolves.toEqual({ ok: false });
    expect(to).not.toHaveBeenCalled();
  });

  it('conversacion eliminada: no emite', async () => {
    const { handler } = makeHandler(vi.fn().mockResolvedValue(null));
    const { socket, to } = makeSocket(5);

    await expect(handler.typing(socket as any, { idConversacion: 3 })).resolves.toEqual({ ok: false });
    expect(to).not.toHaveBeenCalled();
  });

  it('ex lider sin participacion activa en #general: ok:false y no emite', async () => {
    const { handler } = makeHandler(vi.fn().mockResolvedValue(CANAL));
    const { socket, to } = makeSocket(5);

    await expect(handler.typing(socket as any, { idConversacion: 3 })).resolves.toEqual({ ok: false });
    expect(to).not.toHaveBeenCalled();
  });

  it('miembro activo en #general: emite', async () => {
    const { handler } = makeHandler(vi.fn().mockResolvedValue(CANAL), vi.fn().mockResolvedValue({ idParticipacion: 1 }));
    const { socket, to } = makeSocket(5);

    await expect(handler.typing(socket as any, { idConversacion: 3 })).resolves.toEqual({ ok: true });
    expect(to).toHaveBeenCalledWith('conversation:3');
  });

  it.each([
    ['sin userId', undefined, { idConversacion: 3 }],
    ['sin payload', 5, undefined],
    ['idConversacion no numerico', 5, { idConversacion: '3' }],
    ['idConversacion decimal', 5, { idConversacion: 3.5 }],
  ])('%s: ni consulta la BD ni emite', async (_nombre, userId, data) => {
    const { handler, findFirst } = makeHandler();
    const { socket, to } = makeSocket(userId);

    await expect(handler.typing(socket as any, data as any)).resolves.toEqual({ ok: false });
    expect(findFirst).not.toHaveBeenCalled();
    expect(to).not.toHaveBeenCalled();
  });
});
