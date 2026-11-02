import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrganizationChatService } from '../src/organizations/organization-chat.service';

const ORG = { idOrganizacion: 1, nombreOrganizacion: 'Robotica', estadoOrganizacion: 'ACTIVA', visibilidad: 'PRIVADA' };

describe('OrganizationChatService', () => {
  let prisma: Record<string, any>;
  let gateway: { notifyConversationCreated: ReturnType<typeof vi.fn>; removeFromConversation: ReturnType<typeof vi.fn>; broadcastMessage: ReturnType<typeof vi.fn> };
  let chat: { mensajesDe: ReturnType<typeof vi.fn> };
  let service: OrganizationChatService;

  function actuar(rol: string | null, org: Partial<typeof ORG> = {}) {
    prisma.organizacion.findUnique.mockResolvedValue({ ...ORG, ...org });
    prisma.usuarioOrganizacion.findUnique.mockResolvedValue(rol ? { rolOrganizacion: rol, estadoMembresia: 'ACTIVA' } : null);
  }

  beforeEach(() => {
    prisma = {
      organizacion: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn().mockResolvedValue({ creadaPor: 10 }) },
      usuarioOrganizacion: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([{ idUsuario: 10 }, { idUsuario: 11 }]) },
      conversacion: { findFirst: vi.fn().mockResolvedValue({ idConversacion: 9 }), create: vi.fn(), findFirstOrThrow: vi.fn(), findUniqueOrThrow: vi.fn() },
      conversacionParticipante: {
        findMany: vi.fn().mockResolvedValue([{ idUsuario: 10 }, { idUsuario: 11 }]),
        createMany: vi.fn(),
        deleteMany: vi.fn(),
        update: vi.fn(),
      },
      mensajeChat: { create: vi.fn() },
    };
    prisma.$transaction = vi.fn(async (cb: (tx: unknown) => unknown) => cb(prisma));
    gateway = { notifyConversationCreated: vi.fn(), removeFromConversation: vi.fn(), broadcastMessage: vi.fn() };
    chat = { mensajesDe: vi.fn().mockResolvedValue({ data: [] }) };
    service = new OrganizationChatService(prisma as never, gateway as never, chat as never);
  });

  describe('sincronizar', () => {
    it('sin cambios no crea ni quita a nadie', async () => {
      expect(await service.sincronizar(1)).toBe(9);
      expect(prisma.conversacion.create).not.toHaveBeenCalled();
      expect(prisma.conversacionParticipante.createMany).not.toHaveBeenCalled();
      expect(prisma.conversacionParticipante.deleteMany).not.toHaveBeenCalled();
    });

    it('crea #general si falta, con el creador de la organización', async () => {
      prisma.conversacion.findFirst.mockResolvedValue(null);
      prisma.conversacion.create.mockResolvedValue({ idConversacion: 12 });
      expect(await service.sincronizar(1)).toBe(12);
      expect(prisma.conversacion.create.mock.calls[0][0].data).toMatchObject({ idOrganizacion: 1, esCanal: true, nombreCanal: 'general', creadaPor: 10 });
    });

    it('si dos accesos crean #general a la vez (P2002) usa el que ganó', async () => {
      prisma.conversacion.findFirst.mockResolvedValue(null);
      prisma.conversacion.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
      prisma.conversacion.findFirstOrThrow.mockResolvedValue({ idConversacion: 13 });
      expect(await service.sincronizar(1)).toBe(13);
    });

    it('agrega a los miembros nuevos y saca a quien ya no lo es', async () => {
      prisma.usuarioOrganizacion.findMany.mockResolvedValue([{ idUsuario: 10 }, { idUsuario: 12 }]);
      await service.sincronizar(1);
      expect(prisma.conversacionParticipante.createMany.mock.calls[0][0].data).toEqual([{ idConversacion: 9, idUsuario: 12 }]);
      expect(gateway.notifyConversationCreated).toHaveBeenCalledWith(9, [12]);
      expect(prisma.conversacionParticipante.deleteMany.mock.calls[0][0].where).toEqual({ idConversacion: 9, idUsuario: { in: [11] } });
      expect(gateway.removeFromConversation).toHaveBeenCalledWith(9, [11]);
    });
  });

  describe('sincronizarSinFallar', () => {
    it('un fallo del chat no rompe la operación principal', async () => {
      prisma.organizacion.findUniqueOrThrow.mockRejectedValue(new Error('boom'));
      await expect(service.sincronizarSinFallar(1)).resolves.toBeUndefined();
    });
  });

  describe('acceso', () => {
    it('quien no es miembro no usa el chat de una pública', async () => {
      actuar(null, { visibilidad: 'PUBLICA' });
      await expect(service.obtenerCanal(10, 1)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.mensajes(10, 1)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.enviar(10, 1, 'hola')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('una privada no revela su existencia', async () => {
      actuar(null);
      await expect(service.mensajes(10, 1)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('Lectura lee y escribe', async () => {
      actuar('LECTURA');
      await service.mensajes(10, 1, 5);
      expect(chat.mensajesDe).toHaveBeenCalledWith(9, 10, 5);
      prisma.mensajeChat.create.mockResolvedValue({ idMensaje: 1, enviadoEn: new Date(), mensajeCitado: null });
      await service.enviar(10, 1, 'hola');
      expect(prisma.mensajeChat.create.mock.calls[0][0].data).toEqual({ idConversacion: 9, idRemitente: 10, contenido: 'hola' });
      expect(gateway.broadcastMessage).toHaveBeenCalledWith(9, [11], expect.anything());
    });

    it('una organización archivada se puede leer pero no escribir', async () => {
      actuar('PROPIETARIO', { estadoOrganizacion: 'INACTIVA' });
      await expect(service.mensajes(10, 1)).resolves.toBeDefined();
      await expect(service.enviar(10, 1, 'hola')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.mensajeChat.create).not.toHaveBeenCalled();
    });
  });

  describe('obtenerCanal', () => {
    it('devuelve el canal con sus miembros y si está archivado', async () => {
      actuar('EDITOR');
      prisma.conversacion.findUniqueOrThrow.mockResolvedValue({
        idConversacion: 9,
        nombreCanal: 'general',
        participantes: [{ usuario: { idUsuario: 10 } }],
      });
      expect(await service.obtenerCanal(10, 1)).toEqual({
        idConversacion: 9,
        idOrganizacion: 1,
        nombre: 'general',
        archivada: false,
        miembros: [{ idUsuario: 10 }],
      });
    });
  });
});
