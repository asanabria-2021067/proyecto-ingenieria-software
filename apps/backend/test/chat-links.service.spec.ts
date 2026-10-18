import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChatService } from '../src/chat/chat.service';

const USUARIO = { idUsuario: 1, nombre: 'Ana', apellido: 'Perez', fotoUrl: null };

function conversacionRow(participantes = [{ idUsuario: 1 }, { idUsuario: 2 }]) {
  return { idConversacion: 5, idProyecto: 10, participantes, proyecto: { estadoProyecto: 'EN_PROGRESO' } };
}

describe('ChatService - getLinks', () => {
  let prisma: { conversacion: { findFirst: ReturnType<typeof vi.fn> }; mensajeChat: { findMany: ReturnType<typeof vi.fn> } };
  let service: ChatService;

  beforeEach(() => {
    prisma = { conversacion: { findFirst: vi.fn() }, mensajeChat: { findMany: vi.fn() } };
    service = new ChatService(prisma as any, {} as any, {} as any);
  });

  it('rechaza a quien no participa sin consultar mensajes', async () => {
    prisma.conversacion.findFirst.mockResolvedValue(conversacionRow());
    await expect(service.getLinks(10, 5, 99)).rejects.toThrow(ForbiddenException);
    expect(prisma.mensajeChat.findMany).not.toHaveBeenCalled();
  });

  it('404 si la conversacion no existe', async () => {
    prisma.conversacion.findFirst.mockResolvedValue(null);
    await expect(service.getLinks(10, 5, 1)).rejects.toThrow(NotFoundException);
  });

  it('extrae enlaces, dominio y pagina por cursor', async () => {
    prisma.conversacion.findFirst.mockResolvedValue(conversacionRow());
    const enviadoEn = new Date();
    prisma.mensajeChat.findMany.mockResolvedValue([
      { idMensaje: 9, contenido: 'a https://x.com/p b https://x.com/p', enviadoEn, remitente: USUARIO },
      { idMensaje: 8, contenido: 'https://x.com/p otra vez', enviadoEn, remitente: USUARIO },
      { idMensaje: 7, contenido: 'HTTP://y.org/z', enviadoEn, remitente: USUARIO },
    ]);

    const res = await service.getLinks(10, 5, 1, { cursor: 12, limite: 3 });

    expect(res.items.map((i) => [i.url, i.dominio, i.idMensaje])).toEqual([
      ['https://x.com/p', 'x.com', 9],
      ['http://y.org/z', 'y.org', 7],
    ]);
    expect(res.nextCursor).toBe(7);
    const args = prisma.mensajeChat.findMany.mock.calls[0][0];
    expect(args.where.idMensaje).toEqual({ lt: 12 });
    expect(args.take).toBe(3);
  });

  it('sin cursor siguiente cuando la pagina no se llena', async () => {
    prisma.conversacion.findFirst.mockResolvedValue(conversacionRow());
    prisma.mensajeChat.findMany.mockResolvedValue([]);
    const res = await service.getLinks(10, 5, 1);
    expect(res).toEqual({ items: [], nextCursor: null });
    const args = prisma.mensajeChat.findMany.mock.calls[0][0];
    expect(args.take).toBe(20);
    expect(args.where.idMensaje).toBeUndefined();
  });
});
