import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChatService } from '../src/chat/chat.service';
import { ChatGateway } from '../src/chat/chat.gateway';
import { EditMessageDto } from '../src/chat/dto/edit-message.dto';

const USUARIO = { idUsuario: 1, nombre: 'Ana', apellido: 'Perez', fotoUrl: null };

function mensajeRow(overrides: Record<string, unknown> = {}) {
  return {
    idMensaje: 7,
    idConversacion: 5,
    contenido: 'hola',
    enviadoEn: new Date('2026-10-16T10:00:00Z'),
    editadoEn: null,
    eliminadoEn: null,
    remitente: USUARIO,
    citado: null,
    reacciones: [],
    guardadoPor: [],
    ...overrides,
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

describe('ChatService - editar y eliminar mensajes propios', () => {
  let prisma: any;
  let gateway: { broadcastMessageChange: ReturnType<typeof vi.fn> };
  let service: ChatService;

  beforeEach(() => {
    prisma = {
      conversacion: { findFirst: vi.fn().mockResolvedValue(conversacionRow()) },
      mensajeChat: {
        findFirst: vi.fn().mockResolvedValue({ idRemitente: 1, eliminadoEn: null }),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      apodoConversacion: { findMany: vi.fn().mockResolvedValue([]) },
    };
    gateway = { broadcastMessageChange: vi.fn() };
    service = new ChatService(prisma, gateway as unknown as ChatGateway, {} as never);
  });

  describe('editMessage', () => {
    it('guarda contenido recortado con editadoEn y emite messageUpdated a los demas participantes', async () => {
      const editado = mensajeRow({ contenido: 'nuevo', editadoEn: new Date() });
      prisma.mensajeChat.update.mockResolvedValue(editado);

      const resultado = await service.editMessage(10, 5, 7, 1, '  nuevo  ');

      const { data } = prisma.mensajeChat.update.mock.calls[0][0];
      expect(data.contenido).toBe('nuevo');
      expect(data.editadoEn).toBeInstanceOf(Date);
      expect(resultado).toEqual({ ...editado, citado: null });
      expect(gateway.broadcastMessageChange).toHaveBeenCalledWith('messageUpdated', 5, [2], resultado);
    });

    it('rechaza si quien edita no es el remitente', async () => {
      prisma.mensajeChat.findFirst.mockResolvedValue({ idRemitente: 2, eliminadoEn: null });

      await expect(service.editMessage(10, 5, 7, 1, 'x')).rejects.toThrow(ForbiddenException);
      expect(prisma.mensajeChat.update).not.toHaveBeenCalled();
      expect(gateway.broadcastMessageChange).not.toHaveBeenCalled();
    });

    it('rechaza editar un mensaje ya eliminado', async () => {
      prisma.mensajeChat.findFirst.mockResolvedValue({ idRemitente: 1, eliminadoEn: new Date() });

      await expect(service.editMessage(10, 5, 7, 1, 'x')).rejects.toThrow(BadRequestException);
      expect(prisma.mensajeChat.update).not.toHaveBeenCalled();
    });

    it('rechaza si el mensaje no existe en la conversacion', async () => {
      prisma.mensajeChat.findFirst.mockResolvedValue(null);

      await expect(service.editMessage(10, 5, 99, 1, 'x')).rejects.toThrow(NotFoundException);
    });

    it('rechaza si quien edita no participa en la conversacion', async () => {
      await expect(service.editMessage(10, 5, 7, 3, 'x')).rejects.toThrow(ForbiddenException);
      expect(prisma.mensajeChat.findFirst).not.toHaveBeenCalled();
    });

    it('rechaza editar en un chat archivado (proyecto CERRADO)', async () => {
      prisma.conversacion.findFirst.mockResolvedValue(conversacionRow('CERRADO'));

      await expect(service.editMessage(10, 5, 7, 1, 'x')).rejects.toThrow(ForbiddenException);
      expect(prisma.mensajeChat.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteMessage', () => {
    it('marca eliminadoEn, oculta el contenido y emite messageDeleted', async () => {
      prisma.mensajeChat.update.mockResolvedValue(mensajeRow({ eliminadoEn: new Date() }));

      const resultado = await service.deleteMessage(10, 5, 7, 1);

      expect(prisma.mensajeChat.update.mock.calls[0][0].data.eliminadoEn).toBeInstanceOf(Date);
      expect(resultado.contenido).toBe('');
      expect(gateway.broadcastMessageChange).toHaveBeenCalledWith('messageDeleted', 5, [2], resultado);
      expect(gateway.broadcastMessageChange.mock.calls[0][3].contenido).toBe('');
    });

    it('al eliminar, quien lo citaba deja de ver su contenido: la cita lleva eliminado y extracto vacio', async () => {
      const citado = { idMensaje: 3, contenido: 'secreto', eliminadoEn: new Date(), remitente: USUARIO };
      prisma.mensajeChat.update.mockResolvedValue(mensajeRow({ eliminadoEn: new Date(), citado }));

      const resultado = await service.deleteMessage(10, 5, 7, 1);

      expect(resultado.citado).toEqual({ idMensaje: 3, remitente: USUARIO, extracto: '', eliminado: true });
    });

    it('rechaza si quien elimina no es el remitente', async () => {
      prisma.mensajeChat.findFirst.mockResolvedValue({ idRemitente: 2, eliminadoEn: null });

      await expect(service.deleteMessage(10, 5, 7, 1)).rejects.toThrow(ForbiddenException);
      expect(gateway.broadcastMessageChange).not.toHaveBeenCalled();
    });

    it('rechaza eliminar un mensaje ya eliminado', async () => {
      prisma.mensajeChat.findFirst.mockResolvedValue({ idRemitente: 1, eliminadoEn: new Date() });

      await expect(service.deleteMessage(10, 5, 7, 1)).rejects.toThrow(BadRequestException);
      expect(prisma.mensajeChat.update).not.toHaveBeenCalled();
    });
  });

  describe('getMessages', () => {
    it('oculta el contenido de los mensajes eliminados y conserva los demas', async () => {
      prisma.mensajeChat.findMany.mockResolvedValue([
        mensajeRow({ idMensaje: 8, contenido: 'secreto', eliminadoEn: new Date() }),
        mensajeRow({ idMensaje: 7, contenido: 'visible' }),
      ]);

      const resultado = await service.getMessages(10, 5, 1);

      expect(resultado.map((m) => m.contenido)).toEqual(['visible', '']);
    });

    it('si el mensaje citado fue eliminado, la cita no trae su contenido y se marca eliminado', async () => {
      const citadoEliminado = { idMensaje: 3, contenido: 'secreto', eliminadoEn: new Date(), remitente: USUARIO };
      const citadoVisible = { idMensaje: 4, contenido: 'visible', eliminadoEn: null, remitente: USUARIO };
      prisma.mensajeChat.findMany.mockResolvedValue([
        mensajeRow({ idMensaje: 9, citado: citadoVisible }),
        mensajeRow({ idMensaje: 8, citado: citadoEliminado }),
      ]);

      const [eliminado, visible] = await service.getMessages(10, 5, 1);

      expect(eliminado.citado).toEqual({ idMensaje: 3, remitente: USUARIO, extracto: '', eliminado: true });
      expect(JSON.stringify(eliminado)).not.toContain('secreto');
      expect(visible.citado).toEqual({ idMensaje: 4, remitente: USUARIO, extracto: 'visible' });
    });
  });
});

describe('ChatGateway.broadcastMessageChange', () => {
  it('emite el evento a la room de la conversacion y conversationUpdated a cada destinatario', () => {
    const emit = vi.fn();
    const to = vi.fn().mockReturnValue({ emit });
    const gateway = new ChatGateway({} as any, {} as any);
    gateway.server = { to } as any;

    gateway.broadcastMessageChange('messageDeleted', 5, [2, 3], { idMensaje: 7 });

    expect(to).toHaveBeenCalledWith('conversation:5');
    expect(emit).toHaveBeenCalledWith('messageDeleted', { idConversacion: 5, mensaje: { idMensaje: 7 } });
    expect(to).toHaveBeenCalledWith('user:2');
    expect(to).toHaveBeenCalledWith('user:3');
    expect(emit).toHaveBeenCalledWith('conversationUpdated', { idConversacion: 5 });
  });
});

describe('EditMessageDto', () => {
  const errores = (contenido: unknown) =>
    validate(plainToInstance(EditMessageDto, { contenido })).then((e) => e.length);

  it('acepta un contenido valido y recorta espacios', async () => {
    const dto = plainToInstance(EditMessageDto, { contenido: '  hola  ' });
    expect(dto.contenido).toBe('hola');
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza vacio, solo espacios, no string y mas de 4000 caracteres', async () => {
    expect(await errores('')).toBe(1);
    expect(await errores('   ')).toBe(1);
    expect(await errores(5)).toBe(1);
    expect(await errores('a'.repeat(4001))).toBe(1);
    expect(await errores('a'.repeat(4000))).toBe(0);
  });
});
