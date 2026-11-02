import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChatTarjetasService } from '../src/chat/chat-tarjetas.service';
import { RecordatoriosMensajeService } from '../src/chat/recordatorios-mensaje.service';

const AHORA = new Date('2026-11-20T12:00:00.000Z');
const en = (ms: number) => new Date(AHORA.getTime() + ms);
const MIN = 60_000;

describe('ChatTarjetasService (MEJ-45)', () => {
  let prisma: any;
  let chat: { assertConversationParticipant: ReturnType<typeof vi.fn> };
  let service: ChatTarjetasService;

  beforeEach(() => {
    prisma = {
      proyecto: { findFirst: vi.fn() },
      tarea: { findFirst: vi.fn() },
      participacionProyecto: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    chat = { assertConversationParticipant: vi.fn().mockResolvedValue(undefined) };
    service = new ChatTarjetasService(prisma, chat as any);
  });

  it('exige ser participante de la conversacion', async () => {
    chat.assertConversationParticipant.mockRejectedValue(new ForbiddenException());
    await expect(service.resolver(1, 2, 3, ['/dashboard/proyectos/5'])).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ignora rutas que no son enlaces internos', async () => {
    expect(await service.resolver(1, 2, 3, ['/dashboard/mensajes/1', 'hola'])).toEqual([]);
  });

  it('tarea: miembro ve la tarjeta; quien no es miembro recibe solo accesible=false', async () => {
    prisma.tarea.findFirst.mockResolvedValue({
      tituloTarea: 'Diseñar logo',
      estadoTarea: 'EN_PROGRESO',
      fechaLimite: new Date('2026-12-01T00:00:00Z'),
      proyecto: { tituloProyecto: 'Feria', creadoPor: 9, eliminadoEn: null },
    });
    prisma.participacionProyecto.findFirst.mockResolvedValueOnce({ idParticipacion: 1 });
    const ruta = '/dashboard/projects/4/kanban/tasks/8';
    const [visible] = await service.resolver(1, 2, 3, [ruta]);
    expect(visible).toMatchObject({ accesible: true, titulo: 'Diseñar logo', proyecto: 'Feria', fechaLimite: '2026-12-01' });

    const [oculta] = await service.resolver(1, 2, 3, [ruta]);
    expect(oculta).toEqual({ ruta, tipo: 'TAREA', accesible: false });
  });

  it('tarea inexistente o de otro proyecto no revela nada', async () => {
    prisma.tarea.findFirst.mockResolvedValue(null);
    const [t] = await service.resolver(1, 2, 3, ['/dashboard/projects/4/tareas/8']);
    expect(t.accesible).toBe(false);
    expect(prisma.tarea.findFirst.mock.calls[0][0].where).toMatchObject({ idTarea: 8, idProyecto: 4, eliminadoEn: null });
  });

  it('proyecto: visible por estado publico o por ser el lider; si no, oculto', async () => {
    prisma.proyecto.findFirst.mockResolvedValue({ tituloProyecto: 'Borrador', estadoProyecto: 'BORRADOR', creadoPor: 3 });
    expect((await service.resolver(1, 2, 3, ['/dashboard/proyectos/4']))[0]).toMatchObject({ accesible: true, titulo: 'Borrador' });
    expect((await service.resolver(1, 2, 77, ['/dashboard/proyectos/4']))[0].accesible).toBe(false);
  });
});

describe('RecordatoriosMensajeService (MEJ-46)', () => {
  let prisma: any;
  let chat: { assertConversationParticipant: ReturnType<typeof vi.fn> };
  let notifications: { notifyFromTemplate: ReturnType<typeof vi.fn> };
  let service: RecordatoriosMensajeService;

  beforeEach(() => {
    prisma = {
      mensajeChat: { findFirst: vi.fn().mockResolvedValue({ idMensaje: 7 }) },
      recordatorioMensaje: {
        findFirst: vi.fn().mockResolvedValue(null),
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockResolvedValue({ idRecordatorio: 1 }),
        update: vi.fn().mockResolvedValue({ idRecordatorio: 1 }),
        findMany: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    chat = { assertConversationParticipant: vi.fn().mockResolvedValue(undefined) };
    notifications = { notifyFromTemplate: vi.fn().mockResolvedValue(undefined) };
    service = new RecordatoriosMensajeService(prisma, chat as any, notifications as any);
  });

  describe('crear', () => {
    it('acepta exactamente 1 minuto y 90 dias; rechaza menos y mas', async () => {
      await service.crear(1, 2, 7, 3, en(MIN), AHORA);
      await service.crear(1, 2, 7, 3, en(90 * 24 * 60 * MIN), AHORA);
      expect(prisma.recordatorioMensaje.create).toHaveBeenCalledTimes(2);
      for (const ms of [MIN - 1, 0, -MIN, 90 * 24 * 60 * MIN + 1]) {
        await expect(service.crear(1, 2, 7, 3, en(ms), AHORA)).rejects.toBeInstanceOf(BadRequestException);
      }
    });

    it('exige participar y que el mensaje exista en la conversacion', async () => {
      chat.assertConversationParticipant.mockRejectedValue(new ForbiddenException());
      await expect(service.crear(1, 2, 7, 3, en(5 * MIN), AHORA)).rejects.toBeInstanceOf(ForbiddenException);
      chat.assertConversationParticipant.mockResolvedValue(undefined);
      prisma.mensajeChat.findFirst.mockResolvedValue(null);
      await expect(service.crear(1, 2, 7, 3, en(5 * MIN), AHORA)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.mensajeChat.findFirst.mock.calls[0][0].where).toMatchObject({ idMensaje: 7, idConversacion: 2, eliminadoEn: null });
    });

    it('volver a pedirlo cambia la hora del pendiente en vez de duplicarlo', async () => {
      prisma.recordatorioMensaje.findFirst.mockResolvedValue({ idRecordatorio: 4 });
      await service.crear(1, 2, 7, 3, en(5 * MIN), AHORA);
      expect(prisma.recordatorioMensaje.update).toHaveBeenCalledWith(expect.objectContaining({ where: { idRecordatorio: 4 } }));
      expect(prisma.recordatorioMensaje.create).not.toHaveBeenCalled();
    });

    it('limita a 50 pendientes por usuario', async () => {
      prisma.recordatorioMensaje.count.mockResolvedValue(50);
      await expect(service.crear(1, 2, 7, 3, en(5 * MIN), AHORA)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('procesarVencidos', () => {
    const fila = (over: Record<string, unknown> = {}, conv: Record<string, unknown> = {}) => ({
      idRecordatorio: 1,
      idUsuario: 3,
      mensaje: {
        idMensaje: 7,
        idConversacion: 2,
        contenido: 'revisa @[Ana Perez](5) el informe',
        eliminadoEn: null,
        remitente: { nombre: 'Luis', apellido: 'Gomez' },
        conversacion: { idProyecto: 1, eliminadaEn: null, participantes: [{ idUsuario: 3 }], ...conv },
        ...over,
      },
    });

    it('reclama, notifica con enlace a la conversacion y limpia el token de mencion del extracto', async () => {
      prisma.recordatorioMensaje.findMany.mockResolvedValue([fila()]);
      await service.procesarVencidos(AHORA);
      expect(prisma.recordatorioMensaje.updateMany.mock.calls[0][0].data).toEqual({ estado: 'ENVIADO' });
      expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([3], 'RECORDATORIO_MENSAJE', {
        autorNombre: 'Luis Gomez',
        extracto: 'revisa @Ana Perez el informe',
        idProyecto: 1,
        idConversacion: 2,
        idMensaje: 7,
      });
    });

    it('si otra ejecucion lo reclamo primero no notifica', async () => {
      prisma.recordatorioMensaje.findMany.mockResolvedValue([fila()]);
      prisma.recordatorioMensaje.updateMany.mockResolvedValue({ count: 0 });
      await service.procesarVencidos(AHORA);
      expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    });

    it('mensaje eliminado o usuario fuera de la conversacion: FALLIDO sin notificar', async () => {
      prisma.recordatorioMensaje.findMany.mockResolvedValue([
        fila({ eliminadoEn: new Date() }),
        fila({}, { participantes: [{ idUsuario: 99 }] }),
      ]);
      await service.procesarVencidos(AHORA);
      expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
      expect(prisma.recordatorioMensaje.update).toHaveBeenCalledTimes(2);
      expect(prisma.recordatorioMensaje.update.mock.calls[0][0].data).toEqual({ estado: 'FALLIDO' });
    });

    it('un fallo al notificar no detiene el resto del lote', async () => {
      prisma.recordatorioMensaje.findMany.mockResolvedValue([fila(), { ...fila(), idRecordatorio: 2 }]);
      notifications.notifyFromTemplate.mockRejectedValueOnce(new Error('boom'));
      await service.procesarVencidos(AHORA);
      expect(notifications.notifyFromTemplate).toHaveBeenCalledTimes(2);
    });
  });
});
