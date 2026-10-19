import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChatService } from '../src/chat/chat.service';
import { SetApodoDto } from '../src/chat/dto/set-apodo.dto';

function makePrisma() {
  return {
    proyecto: { findFirst: vi.fn() },
    conversacion: { findFirst: vi.fn(), findMany: vi.fn() },
    mensajeChat: { findMany: vi.fn(), count: vi.fn() },
    apodoConversacion: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  };
}

const u = (idUsuario: number, nombre: string) => ({ idUsuario, nombre, apellido: 'X', fotoUrl: null });

describe('ChatService - apodos por chat', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: ChatService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new ChatService(prisma as any, {} as any);
    prisma.conversacion.findFirst.mockResolvedValue({
      idConversacion: 5,
      participantes: [{ idUsuario: 1 }, { idUsuario: 2 }],
      proyecto: { estadoProyecto: 'EN_PROGRESO' },
    });
  });

  describe('setApodo / removeApodo', () => {
    it('hace upsert por el trio conversacion-define-objetivo', async () => {
      await service.setApodo(10, 5, 1, 2, 'Rosita');

      expect(prisma.apodoConversacion.upsert).toHaveBeenCalledWith({
        where: {
          idConversacion_idUsuarioDefine_idUsuarioObjetivo: {
            idConversacion: 5,
            idUsuarioDefine: 1,
            idUsuarioObjetivo: 2,
          },
        },
        create: { idConversacion: 5, idUsuarioDefine: 1, idUsuarioObjetivo: 2, apodo: 'Rosita' },
        update: { apodo: 'Rosita' },
      });
    });

    it('rechaza a quien no participa en la conversacion', async () => {
      await expect(service.setApodo(10, 5, 9, 2, 'x')).rejects.toThrow(ForbiddenException);
      await expect(service.removeApodo(10, 5, 9, 2)).rejects.toThrow(ForbiddenException);
      expect(prisma.apodoConversacion.upsert).not.toHaveBeenCalled();
      expect(prisma.apodoConversacion.deleteMany).not.toHaveBeenCalled();
    });

    it('rechaza un objetivo que no participa', async () => {
      await expect(service.setApodo(10, 5, 1, 9, 'x')).rejects.toThrow(BadRequestException);
      await expect(service.removeApodo(10, 5, 1, 9)).rejects.toThrow(BadRequestException);
      expect(prisma.apodoConversacion.upsert).not.toHaveBeenCalled();
    });

    it('rechaza una conversacion inexistente', async () => {
      prisma.conversacion.findFirst.mockResolvedValue(null);
      await expect(service.setApodo(10, 5, 1, 2, 'x')).rejects.toThrow(NotFoundException);
    });

    it('borra solo el apodo propio del usuario autenticado', async () => {
      await service.removeApodo(10, 5, 1, 2);

      expect(prisma.apodoConversacion.deleteMany).toHaveBeenCalledWith({
        where: { idConversacion: 5, idUsuarioDefine: 1, idUsuarioObjetivo: 2 },
      });
    });
  });

  describe('privacidad por usuario', () => {
    it('getMessages solo consulta los apodos definidos por el usuario autenticado y los aplica', async () => {
      prisma.mensajeChat.findMany.mockResolvedValue([
        { idMensaje: 2, remitente: u(2, 'Rosa'), reacciones: [] },
        { idMensaje: 1, remitente: u(1, 'Yo'), reacciones: [] },
      ]);
      prisma.apodoConversacion.findMany.mockResolvedValue([{ idUsuarioObjetivo: 2, apodo: 'Rosita' }]);

      const mensajes = await service.getMessages(10, 5, 1);

      expect(prisma.apodoConversacion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { idConversacion: 5, idUsuarioDefine: 1 } }),
      );
      expect(mensajes.map((m) => m.apodoRemitente)).toEqual([null, 'Rosita']);
    });

    it('listConversations pide solo los apodos propios y los pone en cada participante', async () => {
      prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 10, creadoPor: 1, estadoProyecto: 'EN_PROGRESO' });
      prisma.mensajeChat.count.mockResolvedValue(0);
      prisma.conversacion.findMany.mockResolvedValue([
        {
          idConversacion: 5,
          tipo: 'INDIVIDUAL',
          mensajes: [],
          apodos: [{ idUsuarioObjetivo: 2, apodo: 'Rosita' }],
          participantes: [
            { idUsuario: 1, ultimaLecturaEn: null, usuario: u(1, 'Yo') },
            { idUsuario: 2, ultimaLecturaEn: null, usuario: u(2, 'Rosa') },
          ],
        },
      ]);

      const [conv] = await service.listConversations(10, 1);

      const include = prisma.conversacion.findMany.mock.calls[0][0].include;
      expect(include.apodos.where).toEqual({ idUsuarioDefine: 1 });
      expect(conv.participantes.map((p) => p.apodo)).toEqual([null, 'Rosita']);
    });

    it('listAllConversations tambien limita los apodos al usuario autenticado', async () => {
      prisma.mensajeChat.count.mockResolvedValue(0);
      prisma.conversacion.findMany.mockResolvedValue([
        {
          idConversacion: 5,
          idProyecto: 10,
          tipo: 'INDIVIDUAL',
          mensajes: [],
          apodos: [{ idUsuarioObjetivo: 2, apodo: 'Rosita' }],
          participantes: [
            { idUsuario: 1, ultimaLecturaEn: null, usuario: u(1, 'Yo') },
            { idUsuario: 2, ultimaLecturaEn: null, usuario: u(2, 'Rosa') },
          ],
        },
      ]);

      const [conv] = await service.listAllConversations(1);

      expect(prisma.conversacion.findMany.mock.calls[0][0].include.apodos.where).toEqual({ idUsuarioDefine: 1 });
      expect(conv.participantes[1].apodo).toBe('Rosita');
    });
  });
});

describe('SetApodoDto', () => {
  const check = (apodo: unknown) => validate(plainToInstance(SetApodoDto, { apodo }));

  it('recorta espacios y acepta 1..40 caracteres', async () => {
    const dto = plainToInstance(SetApodoDto, { apodo: '  Rosita  ' });
    expect(dto.apodo).toBe('Rosita');
    expect(await validate(dto)).toHaveLength(0);
    expect(await check('a'.repeat(40))).toHaveLength(0);
  });

  it('rechaza vacio, solo espacios, mas de 40, no texto y caracteres de control', async () => {
    expect(await check('')).not.toHaveLength(0);
    expect(await check('   ')).not.toHaveLength(0);
    expect(await check('a'.repeat(41))).not.toHaveLength(0);
    expect(await check(123)).not.toHaveLength(0);
    expect(await check('ro\u0000sa')).not.toHaveLength(0);
    expect(await check('ro\nsa')).not.toHaveLength(0);
  });
});
