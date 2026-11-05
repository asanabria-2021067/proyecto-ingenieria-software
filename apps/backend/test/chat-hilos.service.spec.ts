import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { ChatHilosService } from '../src/chat/chat-hilos.service';
import { ChatService } from '../src/chat/chat.service';
import { ChatEstadoService } from '../src/chat/chat-estado.service';

function makeHilos(remitenteOriginal = 2) {
  const prisma = {
    mensajeChat: { findUnique: vi.fn().mockResolvedValue({ idRemitente: remitenteOriginal }) },
    usuario: { findUnique: vi.fn().mockResolvedValue({ nombre: 'Ana', apellido: 'Ruiz' }) },
    proyecto: { findUnique: vi.fn().mockResolvedValue({ tituloProyecto: 'Proyecto X' }) },
  };
  const chat = {
    assertConversationParticipant: vi.fn().mockResolvedValue(undefined),
    mensajesDe: vi.fn().mockResolvedValue([]),
    createMessage: vi.fn().mockResolvedValue({ idMensaje: 50 }),
  };
  const notifications = { notifyFromTemplate: vi.fn().mockResolvedValue(undefined) };
  return { prisma, chat, notifications, service: new ChatHilosService(prisma as any, chat as any, notifications as any) };
}

describe('ChatHilosService', () => {
  it('listar exige ser participante y pide solo las respuestas de ese mensaje', async () => {
    const ctx = makeHilos();
    await ctx.service.listar(10, 5, 33, 1, 40);
    expect(ctx.chat.assertConversationParticipant).toHaveBeenCalledWith(10, 5, 1);
    expect(ctx.chat.mensajesDe).toHaveBeenCalledWith(5, 1, 40, 33);
  });

  it('IDOR: un ajeno a la conversacion no lee el hilo', async () => {
    const ctx = makeHilos();
    ctx.chat.assertConversationParticipant.mockRejectedValue(new ForbiddenException());
    await expect(ctx.service.listar(10, 5, 33, 99)).rejects.toThrow(ForbiddenException);
    expect(ctx.chat.mensajesDe).not.toHaveBeenCalled();
  });

  it('responder usa el mismo camino que un mensaje normal con idMensajePadre y avisa al autor original', async () => {
    const ctx = makeHilos(2);
    const r = await ctx.service.responder(10, 5, 33, 1, 'hola');
    expect(ctx.chat.createMessage).toHaveBeenCalledWith(10, 5, 1, 'hola', undefined, undefined, { idMensajePadre: 33 });
    expect(r).toEqual({ idMensaje: 50 });
    expect(ctx.notifications.notifyFromTemplate).toHaveBeenCalledWith([2], 'RESPUESTA_HILO_CHAT', {
      autorNombre: 'Ana Ruiz',
      tituloProyecto: 'Proyecto X',
      idProyecto: 10,
      idConversacion: 5,
      idMensaje: 33,
    });
  });

  it('no se avisa a uno mismo ni si el envio falla', async () => {
    const propio = makeHilos(1);
    await propio.service.responder(10, 5, 33, 1, 'hola');
    expect(propio.notifications.notifyFromTemplate).not.toHaveBeenCalled();

    const fallido = makeHilos();
    fallido.chat.createMessage.mockRejectedValue(new BadRequestException());
    await expect(fallido.service.responder(10, 5, 33, 1, 'hola')).rejects.toThrow(BadRequestException);
    expect(fallido.notifications.notifyFromTemplate).not.toHaveBeenCalled();
  });
});

function makeChat() {
  const prisma = {
    conversacion: {
      findFirst: vi.fn().mockResolvedValue({
        idConversacion: 5,
        participantes: [{ idUsuario: 1 }, { idUsuario: 2 }],
        proyecto: { estadoProyecto: 'EN_PROGRESO' },
      }),
    },
    conversacionParticipante: { update: vi.fn() },
    mensajeChat: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    adjuntoMensajeChat: { findMany: vi.fn().mockResolvedValue([]) },
    apodoConversacion: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
  const gateway = { broadcastMessage: vi.fn() };
  return { prisma, gateway, service: new ChatService(prisma as any, gateway as any, {} as any) };
}

describe('ChatService - hilos y archivos', () => {
  it('el hilo solo cuelga de un mensaje vivo, del canal y de la misma conversacion', async () => {
    const ctx = makeChat();
    ctx.prisma.mensajeChat.findFirst.mockResolvedValue(null);
    await expect(
      ctx.service.createMessage(10, 5, 1, 'x', undefined, undefined, { idMensajePadre: 77 }),
    ).rejects.toThrow(BadRequestException);
    expect(ctx.prisma.mensajeChat.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { idMensaje: 77, idConversacion: 5, idMensajePadre: null, eliminadoEn: null } }),
    );
    expect(ctx.prisma.mensajeChat.create).not.toHaveBeenCalled();
  });

  it('la lista del canal excluye respuestas y la del hilo solo trae las suyas', async () => {
    const ctx = makeChat();
    await ctx.service.mensajesDe(5, 1);
    expect(ctx.prisma.mensajeChat.findMany.mock.calls[0][0].where).toEqual({ idConversacion: 5, idMensajePadre: null });
    await ctx.service.mensajesDe(5, 1, 20, 33);
    expect(ctx.prisma.mensajeChat.findMany.mock.calls[1][0].where).toEqual({
      idConversacion: 5,
      idMensajePadre: 33,
      idMensaje: { lt: 20 },
    });
  });

  it('el canal expone el conteo de respuestas de cada mensaje', async () => {
    const ctx = makeChat();
    ctx.prisma.mensajeChat.findMany.mockResolvedValue([
      {
        idMensaje: 3,
        idConversacion: 5,
        contenido: 'hola',
        eliminadoEn: null,
        remitente: { idUsuario: 2 },
        citado: null,
        reacciones: [],
        guardadoPor: [],
        _count: { hilo: 3 },
      },
    ]);
    const [m] = await ctx.service.mensajesDe(5, 1);
    expect(m.respuestas).toBe(3);
  });

  it('la galeria de archivos filtra por tipo, incluye notas de voz y exige ser participante', async () => {
    const ctx = makeChat();
    await ctx.service.getArchivos(10, 5, 1, { tipo: 'imagen' });
    expect(ctx.prisma.adjuntoMensajeChat.findMany.mock.calls[0][0].where).toMatchObject({
      idConversacion: 5,
      mime: { startsWith: 'image/' },
    });
    await ctx.service.getArchivos(10, 5, 1, { tipo: 'documento' });
    expect(ctx.prisma.adjuntoMensajeChat.findMany.mock.calls[1][0].where.NOT).toEqual([
      { mime: { startsWith: 'image/' } },
      { mime: { startsWith: 'audio/' } },
    ]);
    await ctx.service.getArchivos(10, 5, 1, { tipo: 'audio' });
    const where = ctx.prisma.adjuntoMensajeChat.findMany.mock.calls[2][0].where;
    expect(where.mime).toEqual({ startsWith: 'audio/' });
    expect(where.duracionSegundos).toBeUndefined();

    ctx.prisma.conversacion.findFirst.mockResolvedValue(null);
    await expect(ctx.service.getArchivos(10, 5, 99)).rejects.toThrow();
  });
});

describe('ChatEstadoService.obtenerDe (MEJ-132)', () => {
  const futuro = new Date(Date.now() + 3_600_000);
  const make = (comparten: boolean) => {
    const prisma = {
      estadoChatUsuario: { findUnique: vi.fn().mockResolvedValue({ tipo: 'EN_REUNION', texto: null, venceEn: futuro }) },
      conversacionParticipante: { findFirst: vi.fn().mockResolvedValue(comparten ? { idConversacion: 1 } : null) },
    };
    return { prisma, service: new ChatEstadoService(prisma as any, {} as any) };
  };

  it('lo ve uno mismo o quien comparte una conversacion; un ajeno no', async () => {
    expect(await make(false).service.obtenerDe(3, 3)).toMatchObject({ tipo: 'EN_REUNION' });
    expect(await make(true).service.obtenerDe(3, 4)).toMatchObject({ tipo: 'EN_REUNION' });
    const ajeno = make(false);
    expect(await ajeno.service.obtenerDe(3, 4)).toBeNull();
    expect(ajeno.prisma.estadoChatUsuario.findUnique).not.toHaveBeenCalled();
  });
});
