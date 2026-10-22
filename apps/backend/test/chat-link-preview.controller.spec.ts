import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChatController } from '../src/chat/chat.controller';
import { LinkPreviewDto } from '../src/chat/dto/link-preview.dto';
import { ChatService } from '../src/chat/chat.service';

describe('POST vista-previa', () => {
  it('exige ser participante antes de consultar la URL', async () => {
    const chat = { assertConversationParticipant: vi.fn().mockRejectedValue(new ForbiddenException('No participas')) };
    const preview = { preview: vi.fn() };
    const controller = new ChatController(chat as never, preview as never);
    await expect(controller.linkPreview(1, 2, { userId: 9 }, { url: 'https://example.com' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(preview.preview).not.toHaveBeenCalled();
  });

  it('participante: delega en el servicio', async () => {
    const chat = { assertConversationParticipant: vi.fn().mockResolvedValue(undefined) };
    const preview = { preview: vi.fn().mockResolvedValue({ url: 'https://example.com' }) };
    const controller = new ChatController(chat as never, preview as never);
    await expect(controller.linkPreview(1, 2, { userId: 9 }, { url: 'https://example.com' })).resolves.toEqual({ url: 'https://example.com' });
    expect(chat.assertConversationParticipant).toHaveBeenCalledWith(1, 2, 9);
  });

  it('ChatService.assertConversationParticipant rechaza a quien no participa', async () => {
    const prisma = {
      conversacion: { findFirst: vi.fn().mockResolvedValue({ participantes: [{ idUsuario: 1 }], proyecto: {} }) },
    };
    const service = new ChatService(prisma as never, {} as never);
    await expect(service.assertConversationParticipant(1, 2, 7)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.assertConversationParticipant(1, 2, 1)).resolves.toBeUndefined();
  });
});

describe('LinkPreviewDto', () => {
  const errors = (url: unknown) => validate(plainToInstance(LinkPreviewDto, { url }));

  it('acepta una URL y recorta espacios', async () => {
    expect(await errors('https://example.com')).toHaveLength(0);
    expect(plainToInstance(LinkPreviewDto, { url: '  https://a.com ' }).url).toBe('https://a.com');
  });

  it('rechaza vacio, no string y mas de 2048 caracteres', async () => {
    expect(await errors('')).not.toHaveLength(0);
    expect(await errors(42)).not.toHaveLength(0);
    expect(await errors(undefined)).not.toHaveLength(0);
    expect(await errors(`https://a.com/${'a'.repeat(2048)}`)).not.toHaveLength(0);
    expect(await errors(`https://a.com/${'a'.repeat(2030)}`)).toHaveLength(0);
  });
});
