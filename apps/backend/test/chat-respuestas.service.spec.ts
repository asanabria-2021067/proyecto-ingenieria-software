import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { ChatService } from '../src/chat/chat.service';

const USUARIO = { idUsuario: 2, nombre: 'Luis', apellido: 'Gomez', fotoUrl: null };

function makeService() {
  const prisma = {
    conversacion: {
      findFirst: vi.fn().mockResolvedValue({
        idConversacion: 5,
        participantes: [{ idUsuario: 1 }, { idUsuario: 2 }],
        proyecto: { estadoProyecto: 'EN_PROGRESO' },
      }),
    },
    conversacionParticipante: { update: vi.fn() },
    mensajeChat: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  };
  const gateway = { broadcastMessage: vi.fn() };
  return { prisma, gateway, service: new ChatService(prisma as any, gateway as any) };
}

function fila(citado: unknown) {
  return { idMensaje: 9, idConversacion: 5, contenido: 'ok', enviadoEn: new Date(), remitente: USUARIO, citado, reacciones: [] };
}

describe('ChatService - respuestas citando un mensaje', () => {
  let ctx: ReturnType<typeof makeService>;

  beforeEach(() => {
    ctx = makeService();
  });

  it('rechaza citar un mensaje de otra conversacion o inexistente (se busca acotado a la conversacion)', async () => {
    ctx.prisma.mensajeChat.findFirst.mockResolvedValue(null);

    await expect(ctx.service.createMessage(10, 5, 1, 'ok', undefined, 77)).rejects.toThrow(BadRequestException);

    expect(ctx.prisma.mensajeChat.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { idMensaje: 77, idConversacion: 5 } }),
    );
    expect(ctx.prisma.mensajeChat.create).not.toHaveBeenCalled();
    expect(ctx.gateway.broadcastMessage).not.toHaveBeenCalled();
  });

  it('persiste idMensajeCitado y devuelve el resumen del citado', async () => {
    ctx.prisma.mensajeChat.findFirst.mockResolvedValue({ idMensaje: 3 });
    ctx.prisma.mensajeChat.create.mockResolvedValue(fila({ idMensaje: 3, contenido: 'texto original', remitente: USUARIO }));

    const res = await ctx.service.createMessage(10, 5, 1, 'ok', undefined, 3);

    expect(ctx.prisma.mensajeChat.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ idMensajeCitado: 3 }) }),
    );
    expect(res.citado).toEqual({ idMensaje: 3, remitente: USUARIO, extracto: 'texto original' });
    expect(ctx.gateway.broadcastMessage).toHaveBeenCalledWith(5, [2], res);
  });

  it('sin idMensajeCitado no consulta el citado y devuelve citado null', async () => {
    ctx.prisma.mensajeChat.create.mockResolvedValue(fila(null));

    const res = await ctx.service.createMessage(10, 5, 1, 'ok');

    expect(ctx.prisma.mensajeChat.findFirst).not.toHaveBeenCalled();
    expect(res.citado).toBeNull();
  });

  it('recorta el extracto a 120 caracteres y colapsa espacios', async () => {
    ctx.prisma.mensajeChat.findMany.mockResolvedValue([
      fila({ idMensaje: 3, contenido: `${'a'.repeat(150)}\n\nfin`, remitente: USUARIO }),
    ]);

    const [m] = await ctx.service.getMessages(10, 5, 1);

    expect(m.citado?.extracto).toBe(`${'a'.repeat(120)}…`);
  });

  it('el historial devuelve citado null cuando el original ya no existe (FK SET NULL)', async () => {
    ctx.prisma.mensajeChat.findMany.mockResolvedValue([fila(null)]);

    const [m] = await ctx.service.getMessages(10, 5, 1);

    expect(m.citado).toBeNull();
  });
});
