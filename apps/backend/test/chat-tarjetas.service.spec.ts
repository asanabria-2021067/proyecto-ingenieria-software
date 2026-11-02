import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { ChatTarjetasService } from '../src/chat/chat-tarjetas.service';

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
      proyecto: { tituloProyecto: 'Feria', creadoPor: 9, eliminadoEn: null },
    });
    prisma.participacionProyecto.findFirst.mockResolvedValueOnce({ idParticipacion: 1 });
    const ruta = '/dashboard/projects/4/kanban/tasks/8';
    const [visible] = await service.resolver(1, 2, 3, [ruta]);
    expect(visible).toMatchObject({ accesible: true, titulo: 'Diseñar logo', proyecto: 'Feria' });

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
