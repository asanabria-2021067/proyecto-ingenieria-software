import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatService } from '../src/chat/chat.service';

const USUARIO = { idUsuario: 1, nombre: 'Ana', apellido: 'Perez', fotoUrl: null };

function setup(contenidoActual = 'hola') {
  const prisma: any = {
    conversacion: {
      findFirst: vi.fn().mockResolvedValue({
        idConversacion: 5,
        idProyecto: 10,
        esCanal: false,
        participantes: [{ idUsuario: 1 }, { idUsuario: 2 }, { idUsuario: 3 }],
        proyecto: { estadoProyecto: 'EN_PROGRESO', creadoPor: 1 },
      }),
    },
    mensajeChat: {
      findFirst: vi.fn().mockResolvedValue({ idRemitente: 1, eliminadoEn: null, contenido: contenidoActual }),
      create: vi.fn(),
      update: vi.fn(),
    },
    conversacionParticipante: { update: vi.fn().mockResolvedValue({}) },
    usuario: { findUnique: vi.fn().mockResolvedValue({ nombre: 'Ana', apellido: 'Perez' }) },
    proyecto: { findUnique: vi.fn().mockResolvedValue({ tituloProyecto: 'Feria' }) },
  };
  prisma.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  const gateway = { broadcastMessage: vi.fn(), broadcastMessageChange: vi.fn() };
  const notifications = { notifyFromTemplate: vi.fn().mockResolvedValue(undefined) };
  const service = new ChatService(prisma, gateway as any, {} as never, notifications as any);
  return { prisma, notifications, service };
}

const fila = (contenido: string) => ({
  idMensaje: 99,
  idConversacion: 5,
  contenido,
  enviadoEn: new Date(),
  remitente: USUARIO,
  citado: null,
  reacciones: [],
  guardadoPor: [],
});

describe('ChatService - menciones @ (MEJ-44)', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('al enviar notifica a los mencionados participantes (no al autor ni a ajenos) con MENCION_CHAT', async () => {
    ctx.prisma.mensajeChat.create.mockResolvedValue(fila('x'));
    await ctx.service.createMessage(10, 5, 1, 'hola @[Luis](2) @[Yo](1) @[Ajeno](77)');

    expect(ctx.prisma.mensajeChat.create.mock.calls[0][0].data.contenido).toBe('hola @[Luis](2) @[Yo](1) @Ajeno');
    // El autor queda excluido de los avisos; el id ajeno ya no es mencion.
    expect(ctx.notifications.notifyFromTemplate).toHaveBeenCalledWith([2], 'MENCION_CHAT', {
      autorNombre: 'Ana Perez',
      tituloProyecto: 'Feria',
      idProyecto: 10,
      idConversacion: 5,
      idMensaje: 99,
    });
  });

  it('un mensaje sin menciones no consulta ni notifica', async () => {
    ctx.prisma.mensajeChat.create.mockResolvedValue(fila('hola'));
    await ctx.service.createMessage(10, 5, 1, 'hola');
    expect(ctx.notifications.notifyFromTemplate).not.toHaveBeenCalled();
    expect(ctx.prisma.usuario.findUnique).not.toHaveBeenCalled();
  });

  it('si la notificacion falla el mensaje igual se devuelve', async () => {
    ctx.prisma.mensajeChat.create.mockResolvedValue(fila('x'));
    ctx.notifications.notifyFromTemplate.mockRejectedValue(new Error('boom'));
    await expect(ctx.service.createMessage(10, 5, 1, '@[Luis](2)')).resolves.toMatchObject({ idMensaje: 99 });
  });

  it('al editar solo avisa a quienes no estaban mencionados antes', async () => {
    ctx = setup('hola @[Luis](2)');
    ctx.prisma.mensajeChat.update.mockResolvedValue(fila('x'));
    await ctx.service.editMessage(10, 5, 99, 1, 'hola @[Luis](2) y @[Eva](3)');
    expect(ctx.notifications.notifyFromTemplate).toHaveBeenCalledTimes(1);
    expect(ctx.notifications.notifyFromTemplate.mock.calls[0][0]).toEqual([3]);
  });
});
