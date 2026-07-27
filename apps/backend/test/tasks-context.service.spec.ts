import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TasksContextService } from '../src/tasks/tasks-context.service';

function makeClient() {
  return {
    proyecto: { findFirst: vi.fn() },
    tarea: { findFirst: vi.fn() },
    asignacionTarea: { findFirst: vi.fn() },
    participacionProyecto: { findFirst: vi.fn() },
    hito: { findUnique: vi.fn() },
    rolProyecto: { findUnique: vi.fn() },
    etiqueta: { findMany: vi.fn() },
  } as any;
}

describe('TasksContextService', () => {
  describe('getProjectOrThrow', () => {
    it('devuelve el proyecto cuando existe y no está eliminado', async () => {
      const prisma = makeClient();
      const proyecto = { idProyecto: 1, creadoPor: 5, eliminadoEn: null };
      prisma.proyecto.findFirst.mockResolvedValue(proyecto);
      const service = new TasksContextService(prisma);

      const result = await service.getProjectOrThrow(1);

      expect(result).toBe(proyecto);
      expect(prisma.proyecto.findFirst).toHaveBeenCalledWith({
        where: { idProyecto: 1, eliminadoEn: null },
      });
    });

    it('lanza NotFoundException si el proyecto no existe', async () => {
      const prisma = makeClient();
      prisma.proyecto.findFirst.mockResolvedValue(null);
      const service = new TasksContextService(prisma);

      await expect(service.getProjectOrThrow(99)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('trata un proyecto eliminado como no disponible (filtrado por eliminadoEn: null)', async () => {
      // Un proyecto con eliminadoEn distinto de null nunca coincide con el
      // where de la consulta, por lo que Prisma devuelve null igual que si
      // no existiera; se verifica que el filtro se envía en la consulta.
      const prisma = makeClient();
      prisma.proyecto.findFirst.mockResolvedValue(null);
      const service = new TasksContextService(prisma);

      await expect(service.getProjectOrThrow(7)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.proyecto.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ eliminadoEn: null }) }),
      );
    });

    it('usa el cliente transaccional proporcionado en vez del PrismaService principal', async () => {
      const prisma = makeClient();
      const tx = makeClient();
      const proyecto = { idProyecto: 1, creadoPor: 5 };
      tx.proyecto.findFirst.mockResolvedValue(proyecto);
      const service = new TasksContextService(prisma);

      const result = await service.getProjectOrThrow(1, tx);

      expect(result).toBe(proyecto);
      expect(tx.proyecto.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.proyecto.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('getTaskInProjectOrThrow', () => {
    it('devuelve la tarea cuando existe, pertenece al proyecto y no está eliminada', async () => {
      const prisma = makeClient();
      const tarea = { idTarea: 10, idProyecto: 1, eliminadoEn: null };
      prisma.tarea.findFirst.mockResolvedValue(tarea);
      const service = new TasksContextService(prisma);

      const result = await service.getTaskInProjectOrThrow(1, 10);

      expect(result).toBe(tarea);
      expect(prisma.tarea.findFirst).toHaveBeenCalledWith({
        where: { idTarea: 10, idProyecto: 1, eliminadoEn: null },
      });
      expect(prisma.tarea.findFirst).toHaveBeenCalledTimes(1);
    });

    it('lanza NotFoundException si la tarea no existe', async () => {
      const prisma = makeClient();
      prisma.tarea.findFirst.mockResolvedValue(null);
      const service = new TasksContextService(prisma);

      await expect(service.getTaskInProjectOrThrow(1, 999)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lanza NotFoundException si la tarea pertenece a otro proyecto (sin filtrar en dos pasos)', async () => {
      // La combinación idTarea+idProyecto+eliminadoEn en una sola consulta
      // hace que Prisma devuelva null cuando la tarea existe pero en otro
      // proyecto, exactamente igual que si no existiera.
      const prisma = makeClient();
      prisma.tarea.findFirst.mockResolvedValue(null);
      const service = new TasksContextService(prisma);

      await expect(service.getTaskInProjectOrThrow(1, 10)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.tarea.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.tarea.findFirst).toHaveBeenCalledWith({
        where: { idTarea: 10, idProyecto: 1, eliminadoEn: null },
      });
    });

    it('lanza NotFoundException si la tarea está eliminada', async () => {
      const prisma = makeClient();
      prisma.tarea.findFirst.mockResolvedValue(null);
      const service = new TasksContextService(prisma);

      await expect(service.getTaskInProjectOrThrow(1, 10)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('usa el cliente transaccional proporcionado en vez del PrismaService principal', async () => {
      const prisma = makeClient();
      const tx = makeClient();
      const tarea = { idTarea: 10, idProyecto: 1 };
      tx.tarea.findFirst.mockResolvedValue(tarea);
      const service = new TasksContextService(prisma);

      const result = await service.getTaskInProjectOrThrow(1, 10, tx);

      expect(result).toBe(tarea);
      expect(tx.tarea.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.tarea.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('getActiveAssignment', () => {
    it('devuelve la asignación activa cuando existe', async () => {
      const prisma = makeClient();
      const asignacion = { idAsignacion: 1, idTarea: 10, desasignadaEn: null };
      prisma.asignacionTarea.findFirst.mockResolvedValue(asignacion);
      const service = new TasksContextService(prisma);

      const result = await service.getActiveAssignment(10);

      expect(result).toBe(asignacion);
    });

    it('devuelve null cuando la tarea no tiene asignación activa (sin lanzar NotFoundException)', async () => {
      const prisma = makeClient();
      prisma.asignacionTarea.findFirst.mockResolvedValue(null);
      const service = new TasksContextService(prisma);

      const result = await service.getActiveAssignment(10);

      expect(result).toBeNull();
    });

    it('filtra exactamente por desasignadaEn: null, sin asumir la fila más reciente', async () => {
      const prisma = makeClient();
      prisma.asignacionTarea.findFirst.mockResolvedValue(null);
      const service = new TasksContextService(prisma);

      await service.getActiveAssignment(10);

      expect(prisma.asignacionTarea.findFirst).toHaveBeenCalledWith({
        where: { idTarea: 10, desasignadaEn: null },
      });
    });

    it('usa el cliente transaccional proporcionado en vez del PrismaService principal', async () => {
      const prisma = makeClient();
      const tx = makeClient();
      const asignacion = { idAsignacion: 1, idTarea: 10, desasignadaEn: null };
      tx.asignacionTarea.findFirst.mockResolvedValue(asignacion);
      const service = new TasksContextService(prisma);

      const result = await service.getActiveAssignment(10, tx);

      expect(result).toBe(asignacion);
      expect(tx.asignacionTarea.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.asignacionTarea.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('assertProjectLeader', () => {
    it('completa sin error cuando el usuario es el líder (creadoPor) vigente', async () => {
      const prisma = makeClient();
      prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 5 });
      const service = new TasksContextService(prisma);

      await expect(service.assertProjectLeader(1, 5)).resolves.toBeUndefined();
    });

    it('lanza ForbiddenException cuando el proyecto existe pero el usuario no es líder', async () => {
      const prisma = makeClient();
      prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 5 });
      const service = new TasksContextService(prisma);

      await expect(service.assertProjectLeader(1, 999)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('consulta el estado actual en la base de datos (no confía en un valor precomputado)', async () => {
      const prisma = makeClient();
      prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 5 });
      const service = new TasksContextService(prisma);

      await service.assertProjectLeader(1, 5);

      expect(prisma.proyecto.findFirst).toHaveBeenCalledTimes(1);
    });

    it('propaga NotFoundException si el proyecto no existe', async () => {
      const prisma = makeClient();
      prisma.proyecto.findFirst.mockResolvedValue(null);
      const service = new TasksContextService(prisma);

      await expect(service.assertProjectLeader(1, 5)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('assertActiveProjectParticipant', () => {
    it('completa sin error para un participante con estadoParticipacion ACTIVO', async () => {
      const prisma = makeClient();
      prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 999 });
      prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
      const service = new TasksContextService(prisma);

      await expect(service.assertActiveProjectParticipant(1, 5)).resolves.toBeUndefined();
      expect(prisma.participacionProyecto.findFirst).toHaveBeenCalledWith({
        where: {
          idUsuario: 5,
          estadoParticipacion: 'ACTIVO',
          rolProyecto: { idProyecto: 1 },
        },
        select: { idParticipacion: true },
      });
    });

    it('lanza ForbiddenException si el usuario no tiene ninguna participación', async () => {
      const prisma = makeClient();
      prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 999 });
      prisma.participacionProyecto.findFirst.mockResolvedValue(null);
      const service = new TasksContextService(prisma);

      await expect(service.assertActiveProjectParticipant(1, 5)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('lanza ForbiddenException si la participación existe pero no está ACTIVO (filtrada en la consulta)', async () => {
      // El filtro estadoParticipacion: 'ACTIVO' se aplica en la propia
      // consulta; una fila RETIRADO/COMPLETADO simplemente no es devuelta.
      const prisma = makeClient();
      prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 999 });
      prisma.participacionProyecto.findFirst.mockResolvedValue(null);
      const service = new TasksContextService(prisma);

      await expect(service.assertActiveProjectParticipant(1, 5)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.participacionProyecto.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ estadoParticipacion: 'ACTIVO' }),
        }),
      );
    });

    it('el líder (creadoPor) se considera participante sin necesitar una fila de participación', async () => {
      // Reproduce el comportamiento real de ComentariosService: el líder no
      // requiere ninguna fila en ParticipacionProyecto.
      const prisma = makeClient();
      prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 5 });
      const service = new TasksContextService(prisma);

      await expect(service.assertActiveProjectParticipant(1, 5)).resolves.toBeUndefined();
      expect(prisma.participacionProyecto.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('getMilestoneInProjectOrThrow', () => {
    it('devuelve el hito cuando pertenece al mismo proyecto', async () => {
      const prisma = makeClient();
      const hito = { idHito: 3, idProyecto: 1 };
      prisma.hito.findUnique.mockResolvedValue(hito);
      const service = new TasksContextService(prisma);

      const result = await service.getMilestoneInProjectOrThrow(1, 3);

      expect(result).toBe(hito);
    });

    it('lanza NotFoundException si el hito no existe', async () => {
      const prisma = makeClient();
      prisma.hito.findUnique.mockResolvedValue(null);
      const service = new TasksContextService(prisma);

      await expect(service.getMilestoneInProjectOrThrow(1, 999)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lanza BadRequestException si el hito pertenece a otro proyecto', async () => {
      const prisma = makeClient();
      prisma.hito.findUnique.mockResolvedValue({ idHito: 3, idProyecto: 2 });
      const service = new TasksContextService(prisma);

      await expect(service.getMilestoneInProjectOrThrow(1, 3)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('no aplica ningún filtro de eliminación (Hito no tiene soft delete en el schema actual)', async () => {
      const prisma = makeClient();
      prisma.hito.findUnique.mockResolvedValue({ idHito: 3, idProyecto: 1 });
      const service = new TasksContextService(prisma);

      await service.getMilestoneInProjectOrThrow(1, 3);

      const callArgs = prisma.hito.findUnique.mock.calls[0][0];
      expect(callArgs.where).not.toHaveProperty('eliminadoEn');
    });
  });

  describe('getRoleInProjectOrThrow', () => {
    it('devuelve el rol cuando pertenece al mismo proyecto', async () => {
      const prisma = makeClient();
      const rol = { idRolProyecto: 4, idProyecto: 1 };
      prisma.rolProyecto.findUnique.mockResolvedValue(rol);
      const service = new TasksContextService(prisma);

      const result = await service.getRoleInProjectOrThrow(1, 4);

      expect(result).toBe(rol);
    });

    it('lanza NotFoundException si el rol no existe', async () => {
      const prisma = makeClient();
      prisma.rolProyecto.findUnique.mockResolvedValue(null);
      const service = new TasksContextService(prisma);

      await expect(service.getRoleInProjectOrThrow(1, 999)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lanza BadRequestException si el rol pertenece a otro proyecto', async () => {
      const prisma = makeClient();
      prisma.rolProyecto.findUnique.mockResolvedValue({ idRolProyecto: 4, idProyecto: 2 });
      const service = new TasksContextService(prisma);

      await expect(service.getRoleInProjectOrThrow(1, 4)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('getLabelsInProjectOrThrow', () => {
    it('devuelve [] inmediatamente para un array vacío, sin consultar Prisma', async () => {
      const prisma = makeClient();
      const service = new TasksContextService(prisma);

      const result = await service.getLabelsInProjectOrThrow(1, []);

      expect(result).toEqual([]);
      expect(prisma.etiqueta.findMany).not.toHaveBeenCalled();
    });

    it('devuelve todas las etiquetas válidas de un proyecto', async () => {
      const prisma = makeClient();
      prisma.etiqueta.findMany.mockResolvedValue([
        { idEtiqueta: 1, idProyecto: 1 },
        { idEtiqueta: 2, idProyecto: 1 },
      ]);
      const service = new TasksContextService(prisma);

      const result = await service.getLabelsInProjectOrThrow(1, [1, 2]);

      expect(result).toEqual([
        { idEtiqueta: 1, idProyecto: 1 },
        { idEtiqueta: 2, idProyecto: 1 },
      ]);
    });

    it('conserva el orden de labelIds aunque findMany devuelva otro orden', async () => {
      const prisma = makeClient();
      prisma.etiqueta.findMany.mockResolvedValue([
        { idEtiqueta: 2, idProyecto: 1 },
        { idEtiqueta: 1, idProyecto: 1 },
        { idEtiqueta: 3, idProyecto: 1 },
      ]);
      const service = new TasksContextService(prisma);

      const result = await service.getLabelsInProjectOrThrow(1, [1, 2, 3]);

      expect(result.map((e: any) => e.idEtiqueta)).toEqual([1, 2, 3]);
    });

    it('lanza BadRequestException si labelIds contiene un ID duplicado, sin consultar Prisma', async () => {
      const prisma = makeClient();
      const service = new TasksContextService(prisma);

      await expect(service.getLabelsInProjectOrThrow(1, [1, 2, 1])).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.etiqueta.findMany).not.toHaveBeenCalled();
    });

    it('lanza NotFoundException si una etiqueta no existe', async () => {
      const prisma = makeClient();
      prisma.etiqueta.findMany.mockResolvedValue([{ idEtiqueta: 1, idProyecto: 1 }]);
      const service = new TasksContextService(prisma);

      await expect(service.getLabelsInProjectOrThrow(1, [1, 999])).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lanza BadRequestException si una etiqueta pertenece a otro proyecto', async () => {
      const prisma = makeClient();
      prisma.etiqueta.findMany.mockResolvedValue([
        { idEtiqueta: 1, idProyecto: 1 },
        { idEtiqueta: 2, idProyecto: 2 },
      ]);
      const service = new TasksContextService(prisma);

      await expect(service.getLabelsInProjectOrThrow(1, [1, 2])).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('ejecuta una sola consulta findMany para múltiples etiquetas', async () => {
      const prisma = makeClient();
      prisma.etiqueta.findMany.mockResolvedValue([
        { idEtiqueta: 1, idProyecto: 1 },
        { idEtiqueta: 2, idProyecto: 1 },
        { idEtiqueta: 3, idProyecto: 1 },
      ]);
      const service = new TasksContextService(prisma);

      await service.getLabelsInProjectOrThrow(1, [1, 2, 3]);

      expect(prisma.etiqueta.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.etiqueta.findMany).toHaveBeenCalledWith({
        where: { idEtiqueta: { in: [1, 2, 3] } },
      });
    });

    it('usa el cliente transaccional proporcionado en vez del PrismaService principal', async () => {
      const prisma = makeClient();
      const tx = makeClient();
      tx.etiqueta.findMany.mockResolvedValue([{ idEtiqueta: 1, idProyecto: 1 }]);
      const service = new TasksContextService(prisma);

      await service.getLabelsInProjectOrThrow(1, [1], tx);

      expect(tx.etiqueta.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.etiqueta.findMany).not.toHaveBeenCalled();
    });
  });
});
