import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EstadoProyecto } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ComentariosService } from '../src/comentarios/comentarios.service';

function makePrisma() {
  return {
    comentario: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    proyecto: { findUnique: vi.fn() },
    tarea: { findUnique: vi.fn(), findFirst: vi.fn() },
    hito: { findUnique: vi.fn() },
    participacionProyecto: { findFirst: vi.fn() },
  } as any;
}

describe('ComentariosService', () => {
  it('create requiere solo una entidad destino', async () => {
    const service = new ComentariosService(makePrisma(), { notifyProjectActiveParticipants: vi.fn() } as any);
    await expect(service.create(1, { idProyecto: 1, idTarea: 2, contenido: 'x' } as any)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('create con idTarea consulta la tarea con eliminadoEn: null (Tarea 22: soft delete de tareas)', async () => {
    const prisma = makePrisma();
    prisma.tarea.findFirst.mockResolvedValue({ idProyecto: 1 });
    prisma.proyecto.findUnique.mockResolvedValueOnce({
      estadoProyecto: EstadoProyecto.PUBLICADO,
      creadoPor: 2,
    });
    prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
    prisma.comentario.create.mockResolvedValue({ idComentario: 9 });
    const service = new ComentariosService(prisma, { notifyProjectActiveParticipants: vi.fn() } as any);

    await service.create(2, { idTarea: 7, contenido: 'Hola' } as any);

    expect(prisma.tarea.findFirst).toHaveBeenCalledWith({
      where: { idTarea: 7, eliminadoEn: null },
      select: { idProyecto: true },
    });
    expect(prisma.tarea.findUnique).not.toHaveBeenCalled();
  });

  it('create con idTarea de una tarea con soft delete: NotFoundException, no crea el comentario (Tarea 22)', async () => {
    const prisma = makePrisma();
    // findFirst con eliminadoEn: null no encuentra nada porque la tarea está eliminada lógicamente.
    prisma.tarea.findFirst.mockResolvedValue(null);
    const service = new ComentariosService(prisma, { notifyProjectActiveParticipants: vi.fn() } as any);

    await expect(
      service.create(2, { idTarea: 7, contenido: 'no debería crearse' } as any),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.comentario.create).not.toHaveBeenCalled();
  });

  it('create comenta proyecto y notifica', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findUnique
      .mockResolvedValueOnce({ idProyecto: 1 })
      .mockResolvedValueOnce({ estadoProyecto: EstadoProyecto.PUBLICADO, creadoPor: 2 });
    prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
    prisma.comentario.create.mockResolvedValue({ idComentario: 5 });
    const notifications = { notifyProjectActiveParticipants: vi.fn() } as any;
    const service = new ComentariosService(prisma, notifications);

    const result = await service.create(2, { idProyecto: 1, contenido: 'Hola' } as any);

    expect(result.idComentario).toBe(5);
    expect(notifications.notifyProjectActiveParticipants).toHaveBeenCalled();
  });

  it('findByProyecto/findByTarea/findByHito delegan en comentario.findMany tras autorizar al líder', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findUnique.mockResolvedValue({ creadoPor: 1 });
    prisma.tarea.findUnique.mockResolvedValue({ idProyecto: 1 });
    prisma.hito.findUnique.mockResolvedValue({ idProyecto: 1 });
    prisma.comentario.findMany.mockResolvedValue([]);
    const service = new ComentariosService(prisma, {} as any);
    await service.findByProyecto(1, 1);
    await service.findByTarea(1, 1);
    await service.findByHito(1, 1);
    expect(prisma.comentario.findMany).toHaveBeenCalledTimes(3);
  });

  it('findByTareaDesc ordena del más reciente al más viejo tras autorizar al líder', async () => {
    const prisma = makePrisma();
    prisma.tarea.findUnique.mockResolvedValue({ idProyecto: 1 });
    prisma.proyecto.findUnique.mockResolvedValue({ creadoPor: 7 });
    prisma.comentario.findMany.mockResolvedValue([]);
    const service = new ComentariosService(prisma, {} as any);

    await service.findByTareaDesc(7, 7);

    expect(prisma.comentario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idTarea: 7, eliminadoEn: null },
        orderBy: { creadoEn: 'desc' },
      }),
    );
  });

  it('update falla si comentario no existe', async () => {
    const prisma = makePrisma();
    prisma.comentario.findUnique.mockResolvedValue(null);
    const service = new ComentariosService(prisma, {} as any);
    await expect(service.update(1, 1, { contenido: 'x' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update valida autor', async () => {
    const prisma = makePrisma();
    prisma.comentario.findUnique.mockResolvedValue({
      idComentario: 1,
      idAutor: 2,
      eliminadoEn: null,
      idProyecto: 1,
    });
    const service = new ComentariosService(prisma, {} as any);
    await expect(service.update(1, 1, { contenido: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('remove marca eliminado cuando válido', async () => {
    const prisma = makePrisma();
    prisma.comentario.findUnique.mockResolvedValue({
      idComentario: 1,
      idAutor: 2,
      eliminadoEn: null,
      idProyecto: 1,
      tarea: null,
      hito: null,
    });
    prisma.proyecto.findUnique.mockResolvedValue({
      estadoProyecto: EstadoProyecto.BORRADOR,
      creadoPor: 2,
    });
    prisma.comentario.update.mockResolvedValue({ idComentario: 1 });
    const service = new ComentariosService(prisma, {} as any);
    const result = await service.remove(1, 2);
    expect(result.idComentario).toBe(1);
  });
});
