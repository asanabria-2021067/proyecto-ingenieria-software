import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MensajesProgramadosService } from '../src/chat/mensajes-programados.service';

const AHORA = new Date('2026-10-16T12:00:00.000Z');
const enMs = (ms: number) => new Date(AHORA.getTime() + ms).toISOString();
const MIN = 60_000;
const DIAS_30 = 30 * 24 * 60 * 60 * 1000;

function makePrisma() {
  return {
    conversacion: { findFirst: vi.fn() },
    mensajeProgramado: {
      create: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };
}

function conversacion(estadoProyecto = 'EN_PROGRESO', participantes = [1, 2]) {
  return {
    idConversacion: 5,
    participantes: participantes.map((idUsuario) => ({ idUsuario })),
    proyecto: { estadoProyecto },
  };
}

describe('MensajesProgramadosService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let chat: { createMessage: ReturnType<typeof vi.fn> };
  let service: MensajesProgramadosService;

  beforeEach(() => {
    prisma = makePrisma();
    chat = { createMessage: vi.fn() };
    service = new MensajesProgramadosService(prisma as any, chat as any);
    prisma.conversacion.findFirst.mockResolvedValue(conversacion());
  });

  describe('programar', () => {
    it('acepta exactamente 1 minuto y exactamente 30 dias', async () => {
      prisma.mensajeProgramado.create.mockResolvedValue({ idMensajeProgramado: 1 });
      await service.programar(10, 5, 1, { contenido: ' hola ', enviarEn: enMs(MIN) }, AHORA);
      await service.programar(10, 5, 1, { contenido: 'hola', enviarEn: enMs(DIAS_30) }, AHORA);
      expect(prisma.mensajeProgramado.create).toHaveBeenCalledTimes(2);
      expect(prisma.mensajeProgramado.create.mock.calls[0][0].data).toMatchObject({
        idConversacion: 5,
        idRemitente: 1,
        contenido: 'hola',
      });
    });

    it('rechaza menos de 1 minuto, el pasado y mas de 30 dias', async () => {
      for (const ms of [MIN - 1, 0, -MIN, DIAS_30 + 1]) {
        await expect(
          service.programar(10, 5, 1, { contenido: 'x', enviarEn: enMs(ms) }, AHORA),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
      expect(prisma.mensajeProgramado.create).not.toHaveBeenCalled();
    });

    it('rechaza con 20 pendientes propios y consulta PENDIENTE del remitente', async () => {
      prisma.mensajeProgramado.count.mockResolvedValue(20);
      await expect(
        service.programar(10, 5, 1, { contenido: 'x', enviarEn: enMs(MIN) }, AHORA),
      ).rejects.toThrow(/20 mensajes programados pendientes/);
      expect(prisma.mensajeProgramado.count.mock.calls[0][0].where).toMatchObject({
        idRemitente: 1,
        estado: 'PENDIENTE',
      });
      expect(prisma.mensajeProgramado.create).not.toHaveBeenCalled();
    });

    it('rechaza con 20 pendientes en la conversacion aunque los propios sean 5', async () => {
      prisma.mensajeProgramado.count.mockImplementation(async ({ where }: any) =>
        where.idConversacion === undefined ? 5 : 20,
      );
      await expect(
        service.programar(10, 5, 1, { contenido: 'x', enviarEn: enMs(MIN) }, AHORA),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.mensajeProgramado.count.mock.calls.some(([a]) => a.where.idConversacion === 5)).toBe(true);
      expect(prisma.mensajeProgramado.create).not.toHaveBeenCalled();
    });

    it('con 19 pendientes crea normalmente', async () => {
      prisma.mensajeProgramado.count.mockResolvedValue(19);
      prisma.mensajeProgramado.create.mockResolvedValue({ idMensajeProgramado: 1 });
      await service.programar(10, 5, 1, { contenido: 'x', enviarEn: enMs(MIN) }, AHORA);
      expect(prisma.mensajeProgramado.create).toHaveBeenCalledTimes(1);
    });

    it('rechaza a quien no participa', async () => {
      await expect(
        service.programar(10, 5, 9, { contenido: 'x', enviarEn: enMs(MIN) }, AHORA),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rechaza conversacion de proyecto CERRADO', async () => {
      prisma.conversacion.findFirst.mockResolvedValue(conversacion('CERRADO'));
      await expect(
        service.programar(10, 5, 1, { contenido: 'x', enviarEn: enMs(MIN) }, AHORA),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('404 si la conversacion no existe', async () => {
      prisma.conversacion.findFirst.mockResolvedValue(null);
      await expect(
        service.programar(10, 5, 1, { contenido: 'x', enviarEn: enMs(MIN) }, AHORA),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('listarPendientes', () => {
    it('solo trae los PENDIENTE propios', async () => {
      prisma.mensajeProgramado.findMany.mockResolvedValue([]);
      await service.listarPendientes(10, 5, 1);
      expect(prisma.mensajeProgramado.findMany.mock.calls[0][0].where).toEqual({
        idConversacion: 5,
        idRemitente: 1,
        estado: 'PENDIENTE',
      });
    });

    it('rechaza a quien no participa', async () => {
      await expect(service.listarPendientes(10, 5, 9)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('cancelar', () => {
    it('el autor cancela un PENDIENTE', async () => {
      prisma.mensajeProgramado.findFirst.mockResolvedValue({ idRemitente: 1 });
      prisma.mensajeProgramado.updateMany.mockResolvedValue({ count: 1 });
      await service.cancelar(10, 5, 7, 1);
      expect(prisma.mensajeProgramado.updateMany).toHaveBeenCalledWith({
        where: { idMensajeProgramado: 7, estado: 'PENDIENTE' },
        data: { estado: 'CANCELADO' },
      });
    });

    it('otro participante no puede cancelar', async () => {
      prisma.mensajeProgramado.findFirst.mockResolvedValue({ idRemitente: 1 });
      await expect(service.cancelar(10, 5, 7, 2)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.mensajeProgramado.updateMany).not.toHaveBeenCalled();
    });

    it('409 si ya no esta PENDIENTE', async () => {
      prisma.mensajeProgramado.findFirst.mockResolvedValue({ idRemitente: 1 });
      prisma.mensajeProgramado.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.cancelar(10, 5, 7, 1)).rejects.toBeInstanceOf(ConflictException);
    });

    it('404 si no existe en esa conversacion', async () => {
      prisma.mensajeProgramado.findFirst.mockResolvedValue(null);
      await expect(service.cancelar(10, 5, 7, 1)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('procesarVencidos', () => {
    const fila = (id: number) => ({
      idMensajeProgramado: id,
      idConversacion: 5,
      idRemitente: 1,
      contenido: `m${id}`,
      conversacion: { idProyecto: 10 },
    });

    it('consulta solo PENDIENTE con enviarEn <= ahora', async () => {
      prisma.mensajeProgramado.findMany.mockResolvedValue([]);
      await service.procesarVencidos(AHORA);
      expect(prisma.mensajeProgramado.findMany.mock.calls[0][0].where).toEqual({
        estado: 'PENDIENTE',
        enviarEn: { lte: AHORA },
      });
    });

    it('reclama, envia con ChatService y guarda idMensaje', async () => {
      prisma.mensajeProgramado.findMany.mockResolvedValue([fila(1)]);
      prisma.mensajeProgramado.updateMany.mockResolvedValue({ count: 1 });
      chat.createMessage.mockResolvedValue({ idMensaje: 99 });
      await service.procesarVencidos(AHORA);
      expect(prisma.mensajeProgramado.updateMany).toHaveBeenCalledWith({
        where: { idMensajeProgramado: 1, estado: 'PENDIENTE' },
        data: { estado: 'ENVIADO', enviadoEn: AHORA },
      });
      expect(chat.createMessage).toHaveBeenCalledWith(10, 5, 1, 'm1');
      expect(prisma.mensajeProgramado.update).toHaveBeenCalledWith({
        where: { idMensajeProgramado: 1 },
        data: { idMensaje: 99 },
      });
    });

    it('no reenvia si otra ejecucion ya lo reclamo (solapamiento)', async () => {
      prisma.mensajeProgramado.findMany.mockResolvedValue([fila(1)]);
      prisma.mensajeProgramado.updateMany.mockResolvedValue({ count: 0 });
      await service.procesarVencidos(AHORA);
      expect(chat.createMessage).not.toHaveBeenCalled();
    });

    it('dos ejecuciones simultaneas envian una sola vez', async () => {
      prisma.mensajeProgramado.findMany.mockResolvedValue([fila(1)]);
      let reclamado = false;
      prisma.mensajeProgramado.updateMany.mockImplementation(async () => {
        const count = reclamado ? 0 : 1;
        reclamado = true;
        return { count };
      });
      chat.createMessage.mockResolvedValue({ idMensaje: 1 });
      await Promise.all([service.procesarVencidos(AHORA), service.procesarVencidos(AHORA)]);
      expect(chat.createMessage).toHaveBeenCalledTimes(1);
    });

    it('marca FALLIDO si el remitente ya no participa y sigue con los demas', async () => {
      prisma.mensajeProgramado.findMany.mockResolvedValue([fila(1), fila(2)]);
      prisma.mensajeProgramado.updateMany.mockResolvedValue({ count: 1 });
      chat.createMessage
        .mockRejectedValueOnce(new ForbiddenException('No participas en esta conversación'))
        .mockResolvedValueOnce({ idMensaje: 5 });
      await service.procesarVencidos(AHORA);
      expect(prisma.mensajeProgramado.update).toHaveBeenCalledWith({
        where: { idMensajeProgramado: 1 },
        data: { estado: 'FALLIDO', enviadoEn: null },
      });
      expect(chat.createMessage).toHaveBeenCalledTimes(2);
    });

    it('no vuelve a procesar un ENVIADO: el siguiente barrido no lo encuentra', async () => {
      prisma.mensajeProgramado.findMany.mockResolvedValueOnce([fila(1)]).mockResolvedValueOnce([]);
      prisma.mensajeProgramado.updateMany.mockResolvedValue({ count: 1 });
      chat.createMessage.mockResolvedValue({ idMensaje: 1 });
      await service.procesarVencidos(AHORA);
      await service.procesarVencidos(AHORA);
      expect(chat.createMessage).toHaveBeenCalledTimes(1);
    });

    it('un error al marcar no detiene el barrido', async () => {
      prisma.mensajeProgramado.findMany.mockResolvedValue([fila(1), fila(2)]);
      prisma.mensajeProgramado.updateMany
        .mockRejectedValueOnce(new Error('db'))
        .mockResolvedValueOnce({ count: 1 });
      chat.createMessage.mockResolvedValue({ idMensaje: 2 });
      await service.procesarVencidos(AHORA);
      expect(chat.createMessage).toHaveBeenCalledTimes(1);
    });

    it('enviarVencidos (cron) usa el reloj actual', async () => {
      prisma.mensajeProgramado.findMany.mockResolvedValue([]);
      await service.enviarVencidos();
      expect(prisma.mensajeProgramado.findMany).toHaveBeenCalled();
    });
  });
});
