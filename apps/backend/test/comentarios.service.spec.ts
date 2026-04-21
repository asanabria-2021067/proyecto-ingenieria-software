import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EstadoProyecto } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ComentariosService } from '../src/comentarios/comentarios.service';

function makePrisma() {
  return {
    comentario: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    proyecto: { findUnique: vi.fn() },
    tarea: { findUnique: vi.fn() },
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

  it('findByProyecto/findByTarea/findByHito delegan', async () => {
    const prisma = makePrisma();
    prisma.comentario.findMany.mockResolvedValue([]);
    const service = new ComentariosService(prisma, {} as any);
    await service.findByProyecto(1);
    await service.findByTarea(1);
    await service.findByHito(1);
    expect(prisma.comentario.findMany).toHaveBeenCalledTimes(3);
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
