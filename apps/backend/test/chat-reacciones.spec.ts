import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChatService, agruparReacciones } from '../src/chat/chat.service';
import { EMOJIS_REACCION, ToggleReactionDto } from '../src/chat/dto/toggle-reaction.dto';

const THUMB = EMOJIS_REACCION[0];
const HEART = EMOJIS_REACCION[1];

function makePrisma() {
  return {
    conversacion: { findFirst: vi.fn() },
    mensajeChat: { findFirst: vi.fn(), findMany: vi.fn() },
    reaccionMensajeChat: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn(), findMany: vi.fn() },
    apodoConversacion: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

function conversacionRow(estadoProyecto = 'EN_PROGRESO') {
  return {
    idConversacion: 5,
    idProyecto: 10,
    participantes: [{ idUsuario: 1 }, { idUsuario: 2 }],
    proyecto: { estadoProyecto },
  };
}

describe('ChatService - reacciones', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let gateway: { broadcastReactionUpdated: ReturnType<typeof vi.fn> };
  let service: ChatService;

  beforeEach(() => {
    prisma = makePrisma();
    gateway = { broadcastReactionUpdated: vi.fn() };
    service = new ChatService(prisma as any, gateway as any);
    prisma.conversacion.findFirst.mockResolvedValue(conversacionRow());
    prisma.mensajeChat.findFirst.mockResolvedValue({ idMensaje: 7 });
  });

  it('agrega la reaccion si no existia, emite el estado agrupado y marca reaccionadoPorMi', async () => {
    prisma.reaccionMensajeChat.findUnique.mockResolvedValue(null);
    prisma.reaccionMensajeChat.findMany.mockResolvedValue([
      { emoji: THUMB, idUsuario: 2 },
      { emoji: THUMB, idUsuario: 1 },
    ]);

    const resultado = await service.toggleReaction(10, 5, 7, 1, THUMB);

    expect(prisma.reaccionMensajeChat.create).toHaveBeenCalledWith({
      data: { idMensaje: 7, idUsuario: 1, emoji: THUMB },
    });
    expect(prisma.reaccionMensajeChat.delete).not.toHaveBeenCalled();
    expect(resultado).toEqual([{ emoji: THUMB, count: 2, reaccionadoPorMi: true }]);
    expect(gateway.broadcastReactionUpdated).toHaveBeenCalledWith(5, 7, [
      { emoji: THUMB, count: 2, idsUsuarios: [2, 1] },
    ]);
  });

  it('quita la reaccion si ya existia', async () => {
    prisma.reaccionMensajeChat.findUnique.mockResolvedValue({ idReaccion: 33 });
    prisma.reaccionMensajeChat.findMany.mockResolvedValue([]);

    const resultado = await service.toggleReaction(10, 5, 7, 1, THUMB);

    expect(prisma.reaccionMensajeChat.delete).toHaveBeenCalledWith({ where: { idReaccion: 33 } });
    expect(prisma.reaccionMensajeChat.create).not.toHaveBeenCalled();
    expect(resultado).toEqual([]);
    expect(gateway.broadcastReactionUpdated).toHaveBeenCalledWith(5, 7, []);
  });

  it('rechaza a quien no participa en la conversacion y no persiste nada', async () => {
    await expect(service.toggleReaction(10, 5, 7, 99, THUMB)).rejects.toThrow(ForbiddenException);

    expect(prisma.reaccionMensajeChat.create).not.toHaveBeenCalled();
    expect(gateway.broadcastReactionUpdated).not.toHaveBeenCalled();
  });

  it('rechaza un mensaje que no es de esa conversacion', async () => {
    prisma.mensajeChat.findFirst.mockResolvedValue(null);

    await expect(service.toggleReaction(10, 5, 8, 1, THUMB)).rejects.toThrow(NotFoundException);
    expect(prisma.reaccionMensajeChat.create).not.toHaveBeenCalled();
  });

  it('no permite reaccionar en un chat archivado por cierre de proyecto', async () => {
    prisma.conversacion.findFirst.mockResolvedValue(conversacionRow('CERRADO'));

    await expect(service.toggleReaction(10, 5, 7, 1, THUMB)).rejects.toThrow(ForbiddenException);
    expect(prisma.reaccionMensajeChat.create).not.toHaveBeenCalled();
  });

  it('getMessages devuelve las reacciones agrupadas por emoji segun el usuario que consulta', async () => {
    const base = { idConversacion: 5, contenido: 'hola', enviadoEn: new Date(), remitente: {} };
    const filas = () => [
      {
        ...base,
        idMensaje: 2,
        reacciones: [
          { emoji: THUMB, idUsuario: 2 },
          { emoji: HEART, idUsuario: 1 },
          { emoji: THUMB, idUsuario: 1 },
        ],
      },
      { ...base, idMensaje: 1, reacciones: [] },
    ];
    prisma.mensajeChat.findMany.mockResolvedValue(filas());

    const [primero, segundo] = await service.getMessages(10, 5, 1);

    expect(primero.idMensaje).toBe(1);
    expect(primero.reacciones).toEqual([]);
    expect(segundo.reacciones).toEqual([
      { emoji: THUMB, count: 2, reaccionadoPorMi: true },
      { emoji: HEART, count: 1, reaccionadoPorMi: true },
    ]);

    prisma.mensajeChat.findMany.mockResolvedValue(filas());
    const [, otro] = await service.getMessages(10, 5, 2);
    expect(otro.reacciones.map((r) => r.reaccionadoPorMi)).toEqual([true, false]);
  });
});

describe('agruparReacciones', () => {
  it('cuenta por emoji conservando el orden de la primera reaccion', () => {
    expect(
      agruparReacciones([
        { emoji: HEART, idUsuario: 1 },
        { emoji: THUMB, idUsuario: 2 },
        { emoji: HEART, idUsuario: 3 },
      ]),
    ).toEqual([
      { emoji: HEART, count: 2, idsUsuarios: [1, 3] },
      { emoji: THUMB, count: 1, idsUsuarios: [2] },
    ]);
  });
});

describe('ToggleReactionDto', () => {
  const errores = (emoji: unknown) => validate(plainToInstance(ToggleReactionDto, { emoji }));

  it.each(EMOJIS_REACCION)('acepta el emoji permitido %s', async (emoji) => {
    expect(await errores(emoji)).toHaveLength(0);
  });

  it.each([['x'], [''], ['\u{1F4A9}'], [THUMB + THUMB], [123], [undefined]])('rechaza %s', async (emoji) => {
    expect(await errores(emoji)).not.toHaveLength(0);
  });
});
