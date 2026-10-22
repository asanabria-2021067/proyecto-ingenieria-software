import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ArgumentMetadata, BadRequestException, ForbiddenException, ValidationPipe } from '@nestjs/common';
import { ChatController } from '../src/chat/chat.controller';
import { ChatService } from '../src/chat/chat.service';
import { UpdateChatThemeDto, CHAT_TEMA_COLORES } from '../src/chat/dto/update-chat-theme.dto';

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

function parse(plain: unknown) {
  const metadata: ArgumentMetadata = { type: 'body', metatype: UpdateChatThemeDto };
  return pipe.transform(plain, metadata);
}

describe('UpdateChatThemeDto', () => {
  it.each(CHAT_TEMA_COLORES)('acepta el color %s', async (color) => {
    await expect(parse({ temaColor: color })).resolves.toMatchObject({ temaColor: color });
  });

  it('acepta null para limpiar el tema', async () => {
    await expect(parse({ temaColor: null })).resolves.toMatchObject({ temaColor: null });
  });

  it.each([['#ff0000'], ['rojo'], [''], [5]])('rechaza el valor libre %j', async (valor) => {
    await expect(parse({ temaColor: valor })).rejects.toThrow(BadRequestException);
  });

  it('rechaza el cuerpo sin temaColor', async () => {
    await expect(parse({})).rejects.toThrow(BadRequestException);
  });
});

describe('ChatService - tema de color por usuario', () => {
  let prisma: any;
  let service: ChatService;

  const conversacion = {
    idConversacion: 5,
    idProyecto: 10,
    participantes: [{ idUsuario: 1 }, { idUsuario: 2 }],
    proyecto: { estadoProyecto: 'EN_PROGRESO' },
  };

  beforeEach(() => {
    prisma = {
      proyecto: { findFirst: vi.fn().mockResolvedValue({ idProyecto: 10, creadoPor: 1, estadoProyecto: 'EN_PROGRESO' }) },
      conversacion: { findFirst: vi.fn().mockResolvedValue(conversacion), findMany: vi.fn() },
      participacionProyecto: { findFirst: vi.fn().mockResolvedValue({ idParticipacion: 1 }) },
      conversacionParticipante: { update: vi.fn().mockResolvedValue({}) },
      mensajeChat: { count: vi.fn().mockResolvedValue(0) },
    };
    service = new ChatService(prisma, {} as any);
  });

  it('updateTheme solo actualiza la fila del usuario autenticado', async () => {
    await service.updateTheme(10, 5, 1, { temaColor: 'verde' });

    expect(prisma.conversacionParticipante.update).toHaveBeenCalledTimes(1);
    expect(prisma.conversacionParticipante.update).toHaveBeenCalledWith({
      where: { idConversacion_idUsuario: { idConversacion: 5, idUsuario: 1 } },
      data: { temaColor: 'verde' },
    });
  });

  it('updateTheme con null limpia el tema', async () => {
    await service.updateTheme(10, 5, 2, { temaColor: null });

    expect(prisma.conversacionParticipante.update).toHaveBeenCalledWith({
      where: { idConversacion_idUsuario: { idConversacion: 5, idUsuario: 2 } },
      data: { temaColor: null },
    });
  });

  it('updateTheme rechaza a quien no participa en la conversacion', async () => {
    await expect(service.updateTheme(10, 5, 99, { temaColor: 'azul' })).rejects.toThrow(ForbiddenException);
    expect(prisma.conversacionParticipante.update).not.toHaveBeenCalled();
  });

  it('listConversations devuelve el tema del usuario autenticado y no el del otro participante', async () => {
    const usuario = (idUsuario: number) => ({ idUsuario, nombre: 'N', apellido: 'A', fotoUrl: null });
    prisma.conversacion.findMany.mockResolvedValue([
      {
        idConversacion: 5,
        tipo: 'INDIVIDUAL',
        nombre: null,
        nombrePersonalizado: null,
        participantes: [
          { idUsuario: 1, ultimaLecturaEn: null, temaColor: 'verde', usuario: usuario(1) },
          { idUsuario: 2, ultimaLecturaEn: null, temaColor: 'rosa', usuario: usuario(2) },
        ],
        mensajes: [],
        apodos: [],
        esFavorita: false,
        archivadaEn: null,
        silenciada: false,
        esPrioritaria: false,
      },
    ]);

    const comoUno = await service.listConversations(10, 1);
    const comoDos = await service.listConversations(10, 2);

    expect(comoUno[0].temaColor).toBe('verde');
    expect(comoDos[0].temaColor).toBe('rosa');
    expect(JSON.stringify(comoUno)).not.toContain('rosa');
  });

  it('listAllConversations devuelve null cuando el usuario no definio tema', async () => {
    prisma.conversacion.findMany.mockResolvedValue([
      {
        idConversacion: 5,
        idProyecto: 10,
        proyecto: { idProyecto: 10, tituloProyecto: 'P' },
        tipo: 'INDIVIDUAL',
        nombre: null,
        nombrePersonalizado: null,
        participantes: [
          { idUsuario: 1, ultimaLecturaEn: null, temaColor: null, usuario: { idUsuario: 1, nombre: 'N', apellido: 'A', fotoUrl: null } },
          { idUsuario: 2, ultimaLecturaEn: null, temaColor: 'azul', usuario: { idUsuario: 2, nombre: 'M', apellido: 'B', fotoUrl: null } },
        ],
        mensajes: [],
        apodos: [],
        esFavorita: false,
        archivadaEn: null,
        silenciada: false,
        esPrioritaria: false,
      },
    ]);

    const [conv] = await service.listAllConversations(1);

    expect(conv.temaColor).toBeNull();
  });
});

describe('PATCH :conversationId/tema', () => {
  // El cliente (apiFetch) solo tolera un cuerpo vacio con 204; con 200 vacio res.json() falla y la UI no se refresca.
  it('responde 204 porque no devuelve cuerpo', () => {
    expect(Reflect.getMetadata('__httpCode__', ChatController.prototype.updateTheme)).toBe(204);
  });
});
