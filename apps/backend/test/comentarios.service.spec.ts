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
    asignacionTarea: { findFirst: vi.fn() },
  } as any;
}

describe('ComentariosService', () => {
  it('create requiere solo una entidad destino', async () => {
    const service = new ComentariosService(makePrisma(), { notifyProjectActiveParticipants: vi.fn() } as any);
    await expect(service.create(1, { idProyecto: 1, idTarea: 2, contenido: 'x' } as any)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('create con idTarea: BadRequestException inmediata, sin consultar nada (Tarea 28: creación de comentarios de tarea migrada a createForTask)', async () => {
    const prisma = makePrisma();
    const service = new ComentariosService(prisma, { notifyProjectActiveParticipants: vi.fn() } as any);

    await expect(service.create(2, { idTarea: 7, contenido: 'Hola' } as any)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(prisma.tarea.findFirst).not.toHaveBeenCalled();
    expect(prisma.tarea.findUnique).not.toHaveBeenCalled();
    expect(prisma.comentario.create).not.toHaveBeenCalled();
  });

  it('createForTask consulta la tarea con eliminadoEn: null y proyecto.eliminadoEn: null (Tarea 28, reemplaza la validación que create() hacía para idTarea)', async () => {
    const prisma = makePrisma();
    prisma.tarea.findFirst.mockResolvedValue({ idTarea: 7, idProyecto: 1, creadaPor: 2 });
    prisma.proyecto.findUnique.mockResolvedValueOnce({
      estadoProyecto: EstadoProyecto.PUBLICADO,
      creadoPor: 2,
    });
    prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
    prisma.asignacionTarea.findFirst.mockResolvedValue(null);
    prisma.comentario.create.mockResolvedValue({ idComentario: 9 });
    const service = new ComentariosService(prisma, { notifyUsers: vi.fn() } as any);

    await service.createForTask(1, 7, 2, 'Hola');

    expect(prisma.tarea.findFirst).toHaveBeenCalledWith({
      where: { idTarea: 7, idProyecto: 1, eliminadoEn: null, proyecto: { eliminadoEn: null } },
      select: { idTarea: true, idProyecto: true, creadaPor: true },
    });
  });

  it('createForTask con tarea eliminada (o de otro proyecto): NotFoundException, no crea el comentario (Tarea 28)', async () => {
    const prisma = makePrisma();
    // findFirst con eliminadoEn: null no encuentra nada porque la tarea está eliminada lógicamente
    // o no pertenece al proyecto indicado.
    prisma.tarea.findFirst.mockResolvedValue(null);
    const service = new ComentariosService(prisma, { notifyUsers: vi.fn() } as any);

    await expect(
      service.createForTask(1, 7, 2, 'no debería crearse'),
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

  it('findByProyecto/findByHito delegan en comentario.findMany tras autorizar al líder', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findUnique.mockResolvedValue({ creadoPor: 1 });
    prisma.hito.findUnique.mockResolvedValue({ idProyecto: 1 });
    prisma.comentario.findMany.mockResolvedValue([]);
    const service = new ComentariosService(prisma, {} as any);
    await service.findByProyecto(1, 1);
    await service.findByHito(1, 1);
    expect(prisma.comentario.findMany).toHaveBeenCalledTimes(2);
  });

  it('Tarea 28.C: findByTarea y findByTareaDesc ya no existen en el service (retirados con la ruta genérica)', () => {
    const prisma = makePrisma();
    const service = new ComentariosService(prisma, {} as any);
    expect((service as any).findByTarea).toBeUndefined();
    expect((service as any).findByTareaDesc).toBeUndefined();
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
      idTarea: null,
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
      idTarea: null,
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

  describe('Tarea 28.B: rutas genéricas ya no operan sobre comentarios de tarea', () => {
    it('update de un comentario de tarea vía ruta genérica: NotFoundException aunque el actor sea el autor', async () => {
      const prisma = makePrisma();
      prisma.comentario.findUnique.mockResolvedValue({
        idComentario: 1,
        idAutor: 2,
        eliminadoEn: null,
        idProyecto: null,
        idTarea: 7,
        hito: null,
      });
      const service = new ComentariosService(prisma, {} as any);

      await expect(service.update(1, 2, { contenido: 'x' })).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.proyecto.findUnique).not.toHaveBeenCalled();
      expect(prisma.comentario.update).not.toHaveBeenCalled();
    });

    it('update de un comentario de tarea vía ruta genérica: NotFoundException aunque el actor sea el líder del proyecto (nunca llega a evaluar liderazgo)', async () => {
      const prisma = makePrisma();
      prisma.comentario.findUnique.mockResolvedValue({
        idComentario: 1,
        idAutor: 99,
        eliminadoEn: null,
        idProyecto: null,
        idTarea: 7,
        hito: null,
      });
      const service = new ComentariosService(prisma, {} as any);

      await expect(service.update(1, 1, { contenido: 'x' })).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.proyecto.findUnique).not.toHaveBeenCalled();
      expect(prisma.comentario.update).not.toHaveBeenCalled();
    });

    it('remove de un comentario de tarea vía ruta genérica: NotFoundException aunque el actor sea el autor, sin soft delete ni borrado físico', async () => {
      const prisma = makePrisma();
      prisma.comentario.findUnique.mockResolvedValue({
        idComentario: 1,
        idAutor: 2,
        eliminadoEn: null,
        idProyecto: null,
        idTarea: 7,
        hito: null,
      });
      const service = new ComentariosService(prisma, {} as any);

      await expect(service.remove(1, 2)).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.proyecto.findUnique).not.toHaveBeenCalled();
      expect(prisma.comentario.update).not.toHaveBeenCalled();
      expect((prisma.comentario as any).delete).toBeUndefined();
      expect((prisma.comentario as any).deleteMany).toBeUndefined();
    });

    it('remove de un comentario de tarea vía ruta genérica: NotFoundException aunque el actor sea el líder del proyecto (nunca llega a evaluar liderazgo)', async () => {
      const prisma = makePrisma();
      prisma.comentario.findUnique.mockResolvedValue({
        idComentario: 1,
        idAutor: 99,
        eliminadoEn: null,
        idProyecto: null,
        idTarea: 7,
        hito: null,
      });
      const service = new ComentariosService(prisma, {} as any);

      await expect(service.remove(1, 1)).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.proyecto.findUnique).not.toHaveBeenCalled();
      expect(prisma.comentario.update).not.toHaveBeenCalled();
    });

    it('update de comentario de proyecto sigue funcionando sin cambios', async () => {
      const prisma = makePrisma();
      prisma.comentario.findUnique.mockResolvedValue({
        idComentario: 1,
        idAutor: 2,
        eliminadoEn: null,
        idProyecto: 1,
        idTarea: null,
        hito: null,
      });
      prisma.proyecto.findUnique.mockResolvedValue({
        estadoProyecto: EstadoProyecto.BORRADOR,
        creadoPor: 2,
      });
      prisma.comentario.update.mockResolvedValue({ idComentario: 1, contenido: 'editado' });
      const service = new ComentariosService(prisma, {} as any);

      const result = await service.update(1, 2, { contenido: 'editado' });

      expect(result.idComentario).toBe(1);
      expect(prisma.comentario.update).toHaveBeenCalled();
    });

    it('update de comentario de hito sigue funcionando sin cambios', async () => {
      const prisma = makePrisma();
      prisma.comentario.findUnique.mockResolvedValue({
        idComentario: 1,
        idAutor: 2,
        eliminadoEn: null,
        idProyecto: null,
        idTarea: null,
        hito: { idProyecto: 3 },
      });
      prisma.proyecto.findUnique.mockResolvedValue({
        estadoProyecto: EstadoProyecto.BORRADOR,
        creadoPor: 2,
      });
      prisma.comentario.update.mockResolvedValue({ idComentario: 1, contenido: 'editado' });
      const service = new ComentariosService(prisma, {} as any);

      const result = await service.update(1, 2, { contenido: 'editado' });

      expect(result.idComentario).toBe(1);
      expect(prisma.comentario.update).toHaveBeenCalled();
    });

    it('remove de comentario de hito sigue funcionando sin cambios', async () => {
      const prisma = makePrisma();
      prisma.comentario.findUnique.mockResolvedValue({
        idComentario: 1,
        idAutor: 2,
        eliminadoEn: null,
        idProyecto: null,
        idTarea: null,
        hito: { idProyecto: 3 },
      });
      prisma.proyecto.findUnique.mockResolvedValue({
        estadoProyecto: EstadoProyecto.BORRADOR,
        creadoPor: 2,
      });
      prisma.comentario.update.mockResolvedValue({ idComentario: 1, eliminadoEn: new Date() });
      const service = new ComentariosService(prisma, {} as any);

      const result = await service.remove(1, 2);

      expect(result.idComentario).toBe(1);
      expect(prisma.comentario.update).toHaveBeenCalled();
    });

    it('comparativa: el mismo comentario de tarea es rechazado por update() genérico pero aceptado por updateForTask()', async () => {
      const prisma = makePrisma();
      prisma.comentario.findFirst = vi.fn();
      const PROJECT_ID = 5;
      const TASK_ID = 42;
      const COMMENT_ID = 9;
      const AUTHOR_ID = 2;

      // Vía genérica: idComentario global expone idTarea → 404, no se toca.
      prisma.comentario.findUnique.mockResolvedValue({
        idComentario: COMMENT_ID,
        idAutor: AUTHOR_ID,
        eliminadoEn: null,
        idProyecto: null,
        idTarea: TASK_ID,
        hito: null,
      });
      const service = new ComentariosService(prisma, { notifyProjectActiveParticipants: vi.fn() } as any);
      await expect(service.update(COMMENT_ID, AUTHOR_ID, { contenido: 'y' } as any)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.comentario.update).not.toHaveBeenCalled();

      // Vía anidada, con projectId+taskId correctos: el mismo autor sí puede operarlo.
      prisma.tarea.findFirst.mockResolvedValue({ idTarea: TASK_ID, idProyecto: PROJECT_ID });
      (prisma.comentario.findFirst as any).mockResolvedValue({ idComentario: COMMENT_ID, idAutor: AUTHOR_ID });
      prisma.proyecto.findUnique.mockResolvedValue({ estadoProyecto: EstadoProyecto.PUBLICADO, creadoPor: 1 });
      prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
      prisma.comentario.update.mockResolvedValue({ idComentario: COMMENT_ID, contenido: 'y' });

      const result = await service.updateForTask(PROJECT_ID, TASK_ID, COMMENT_ID, AUTHOR_ID, {
        contenido: 'y',
      } as any);
      expect(result.idComentario).toBe(COMMENT_ID);
      expect(prisma.comentario.update).toHaveBeenCalled();
    });
  });
});
