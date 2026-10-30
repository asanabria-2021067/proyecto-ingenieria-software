import { describe, expect, it, vi } from 'vitest';
import { ChatRoomsHandler } from '../src/chat/chat-rooms.handler';
import type { PrismaService } from '../src/prisma/prisma.service';

function makeHandler(findFirst = vi.fn(), participacion = vi.fn().mockResolvedValue(null)) {
  const prisma = { conversacion: { findFirst }, participacionProyecto: { findFirst: participacion } };
  return { handler: new ChatRoomsHandler(prisma as unknown as PrismaService), findFirst, participacion };
}

const CANAL = { esCanal: true, idProyecto: 10, proyecto: { creadoPor: 1, eliminadoEn: null } };
const DIRECTA = { esCanal: false, idProyecto: null, proyecto: null };

function makeSocket(userId?: number) {
  return { data: { userId }, join: vi.fn(), leave: vi.fn() };
}

describe('ChatRoomsHandler', () => {
  it('join: sin participacion no entra a la room', async () => {
    const { handler, findFirst } = makeHandler(vi.fn().mockResolvedValue(null));
    const socket = makeSocket(99);

    await expect(handler.join(socket as any, { idConversacion: 1 })).resolves.toEqual({ joined: false });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idConversacion: 1, eliminadaEn: null, participantes: { some: { idUsuario: 99 } } },
      }),
    );
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('join: sin userId o sin idConversacion no consulta la BD', async () => {
    const { handler, findFirst } = makeHandler();

    await expect(handler.join(makeSocket() as any, { idConversacion: 1 })).resolves.toEqual({ joined: false });
    await expect(handler.join(makeSocket(5) as any, {} as any)).resolves.toEqual({ joined: false });
    await expect(handler.join(makeSocket(5) as any, undefined as any)).resolves.toEqual({ joined: false });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('join: con participacion entra a conversation:{id}', async () => {
    const { handler } = makeHandler(vi.fn().mockResolvedValue(DIRECTA));
    const socket = makeSocket(5);

    await expect(handler.join(socket as any, { idConversacion: 3 })).resolves.toEqual({ joined: true });
    expect(socket.join).toHaveBeenCalledWith('conversation:3');
  });

  it('join: conversacion eliminada (la consulta no la devuelve) -> joined:false', async () => {
    const { handler } = makeHandler(vi.fn().mockResolvedValue(null));
    const socket = makeSocket(5);

    await expect(handler.join(socket as any, { idConversacion: 3 })).resolves.toEqual({ joined: false });
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('join: ex lider sin participacion activa en #general -> joined:false', async () => {
    const participacion = vi.fn().mockResolvedValue(null);
    const { handler } = makeHandler(vi.fn().mockResolvedValue(CANAL), participacion);
    const socket = makeSocket(5);

    await expect(handler.join(socket as any, { idConversacion: 3 })).resolves.toEqual({ joined: false });
    expect(participacion).toHaveBeenCalled();
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('join: canal de proyecto eliminado -> joined:false', async () => {
    const canal = { ...CANAL, proyecto: { creadoPor: 5, eliminadoEn: new Date() } };
    const { handler } = makeHandler(vi.fn().mockResolvedValue(canal));
    const socket = makeSocket(5);

    await expect(handler.join(socket as any, { idConversacion: 3 })).resolves.toEqual({ joined: false });
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('join: miembro activo del proyecto en #general -> joined:true', async () => {
    const { handler } = makeHandler(vi.fn().mockResolvedValue(CANAL), vi.fn().mockResolvedValue({ idParticipacion: 1 }));
    const socket = makeSocket(5);

    await expect(handler.join(socket as any, { idConversacion: 3 })).resolves.toEqual({ joined: true });
    expect(socket.join).toHaveBeenCalledWith('conversation:3');
  });

  it('join: lider vigente (creadoPor) en #general -> joined:true', async () => {
    const { handler } = makeHandler(vi.fn().mockResolvedValue(CANAL));
    const socket = makeSocket(1);

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
