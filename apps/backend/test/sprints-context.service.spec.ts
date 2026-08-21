import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import { SprintsContextService } from '../src/sprints/sprints-context.service';

function makeClient() {
  return {
    proyecto: { findFirst: vi.fn() },
    sprint: { findFirst: vi.fn() },
  };
}

describe('SprintsContextService', () => {
  describe('getProjectOrThrow', () => {
    it('devuelve el proyecto cuando existe y no está eliminado', async () => {
      const prisma = makeClient();
      const proyecto = { idProyecto: 1, creadoPor: 5, eliminadoEn: null };
      prisma.proyecto.findFirst.mockResolvedValue(proyecto);
      const service = new SprintsContextService(prisma as unknown as PrismaService);

      const result = await service.getProjectOrThrow(1);

      expect(result).toBe(proyecto);
      expect(prisma.proyecto.findFirst).toHaveBeenCalledWith({
        where: { idProyecto: 1, eliminadoEn: null },
      });
    });

    it('lanza NotFoundException si el proyecto no existe', async () => {
      const prisma = makeClient();
      prisma.proyecto.findFirst.mockResolvedValue(null);
      const service = new SprintsContextService(prisma as unknown as PrismaService);

      await expect(service.getProjectOrThrow(99)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('usa el cliente transaccional proporcionado en vez del PrismaService principal', async () => {
      const prisma = makeClient();
      const tx = makeClient();
      const proyecto = { idProyecto: 1, creadoPor: 5 };
      tx.proyecto.findFirst.mockResolvedValue(proyecto);
      const service = new SprintsContextService(prisma as unknown as PrismaService);

      const result = await service.getProjectOrThrow(1, tx as unknown as Prisma.TransactionClient);

      expect(result).toBe(proyecto);
      expect(tx.proyecto.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.proyecto.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('assertProjectLeader', () => {
    it('completa sin error cuando el usuario es el líder (creadoPor) vigente', async () => {
      const prisma = makeClient();
      prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 5 });
      const service = new SprintsContextService(prisma as unknown as PrismaService);

      await expect(service.assertProjectLeader(1, 5)).resolves.toBeUndefined();
    });

    it('lanza ForbiddenException cuando el proyecto existe pero el usuario no es líder', async () => {
      const prisma = makeClient();
      prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 5 });
      const service = new SprintsContextService(prisma as unknown as PrismaService);

      await expect(service.assertProjectLeader(1, 999)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('propaga NotFoundException si el proyecto no existe', async () => {
      const prisma = makeClient();
      prisma.proyecto.findFirst.mockResolvedValue(null);
      const service = new SprintsContextService(prisma as unknown as PrismaService);

      await expect(service.assertProjectLeader(1, 5)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getCurrentSprint', () => {
    it('devuelve el Sprint ACTIVO del proyecto', async () => {
      const prisma = makeClient();
      const sprint = { idSprint: 1, idProyecto: 1, estado: 'ACTIVO' };
      prisma.sprint.findFirst.mockResolvedValue(sprint);
      const service = new SprintsContextService(prisma as unknown as PrismaService);

      const result = await service.getCurrentSprint(1);

      expect(result).toBe(sprint);
      expect(prisma.sprint.findFirst).toHaveBeenCalledWith({
        where: { idProyecto: 1, estado: { in: ['ACTIVO', 'EN_FINALIZACION'] } },
      });
    });

    it('devuelve el Sprint EN_FINALIZACION del proyecto', async () => {
      const prisma = makeClient();
      const sprint = { idSprint: 2, idProyecto: 1, estado: 'EN_FINALIZACION' };
      prisma.sprint.findFirst.mockResolvedValue(sprint);
      const service = new SprintsContextService(prisma as unknown as PrismaService);

      const result = await service.getCurrentSprint(1);

      expect(result).toBe(sprint);
    });

    it('no considera un Sprint CERRADO como actual operable (filtrado en la propia consulta)', async () => {
      // El where envía estado: { in: ['ACTIVO', 'EN_FINALIZACION'] }, por lo
      // que un Sprint CERRADO nunca es devuelto por Prisma.
      const prisma = makeClient();
      prisma.sprint.findFirst.mockResolvedValue(null);
      const service = new SprintsContextService(prisma as unknown as PrismaService);

      const result = await service.getCurrentSprint(1);

      expect(result).toBeNull();
      expect(prisma.sprint.findFirst).toHaveBeenCalledWith({
        where: { idProyecto: 1, estado: { in: ['ACTIVO', 'EN_FINALIZACION'] } },
      });
    });

    it('devuelve null (sin lanzar excepción) cuando el proyecto no tiene Sprint operable', async () => {
      const prisma = makeClient();
      prisma.sprint.findFirst.mockResolvedValue(null);
      const service = new SprintsContextService(prisma as unknown as PrismaService);

      await expect(service.getCurrentSprint(1)).resolves.toBeNull();
    });

    it('aísla por idProyecto: no devuelve el Sprint operable de otro proyecto', async () => {
      const prisma = makeClient();
      prisma.sprint.findFirst.mockResolvedValue(null);
      const service = new SprintsContextService(prisma as unknown as PrismaService);

      await service.getCurrentSprint(1);

      expect(prisma.sprint.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ idProyecto: 1 }) }),
      );
    });

    it('usa el cliente transaccional proporcionado en vez del PrismaService principal', async () => {
      const prisma = makeClient();
      const tx = makeClient();
      const sprint = { idSprint: 1, idProyecto: 1, estado: 'ACTIVO' };
      tx.sprint.findFirst.mockResolvedValue(sprint);
      const service = new SprintsContextService(prisma as unknown as PrismaService);

      const result = await service.getCurrentSprint(1, tx as unknown as Prisma.TransactionClient);

      expect(result).toBe(sprint);
      expect(tx.sprint.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.sprint.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('getSprintInProjectOrThrow', () => {
    it('devuelve el Sprint cuando pertenece al proyecto', async () => {
      const prisma = makeClient();
      const sprint = { idSprint: 10, idProyecto: 1, estado: 'ACTIVO' };
      prisma.sprint.findFirst.mockResolvedValue(sprint);
      const service = new SprintsContextService(prisma as unknown as PrismaService);

      const result = await service.getSprintInProjectOrThrow(1, 10);

      expect(result).toBe(sprint);
      expect(prisma.sprint.findFirst).toHaveBeenCalledWith({
        where: { idSprint: 10, idProyecto: 1 },
      });
      expect(prisma.sprint.findFirst).toHaveBeenCalledTimes(1);
    });

    it('lanza NotFoundException si el Sprint no existe', async () => {
      const prisma = makeClient();
      prisma.sprint.findFirst.mockResolvedValue(null);
      const service = new SprintsContextService(prisma as unknown as PrismaService);

      await expect(service.getSprintInProjectOrThrow(1, 999)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lanza NotFoundException si el sprintId existe pero pertenece a otro proyecto (aislamiento cross-project)', async () => {
      // La combinación idSprint+idProyecto en una sola consulta hace que
      // Prisma devuelva null cuando el Sprint existe pero en otro proyecto,
      // exactamente igual que si no existiera: un idSprint válido de otro
      // proyecto nunca es accesible a través de este idProyecto.
      const prisma = makeClient();
      prisma.sprint.findFirst.mockResolvedValue(null);
      const service = new SprintsContextService(prisma as unknown as PrismaService);

      await expect(service.getSprintInProjectOrThrow(1, 10)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.sprint.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.sprint.findFirst).toHaveBeenCalledWith({
        where: { idSprint: 10, idProyecto: 1 },
      });
    });

    it('la query demuestra aislamiento expresado directamente en el where (idSprint + idProyecto)', async () => {
      const prisma = makeClient();
      const sprint = { idSprint: 10, idProyecto: 1 };
      prisma.sprint.findFirst.mockResolvedValue(sprint);
      const service = new SprintsContextService(prisma as unknown as PrismaService);

      await service.getSprintInProjectOrThrow(1, 10);

      const callArgs = prisma.sprint.findFirst.mock.calls[0][0];
      expect(callArgs.where).toEqual({ idSprint: 10, idProyecto: 1 });
    });

    it('usa el cliente transaccional proporcionado en vez del PrismaService principal', async () => {
      const prisma = makeClient();
      const tx = makeClient();
      const sprint = { idSprint: 10, idProyecto: 1 };
      tx.sprint.findFirst.mockResolvedValue(sprint);
      const service = new SprintsContextService(prisma as unknown as PrismaService);

      const result = await service.getSprintInProjectOrThrow(1, 10, tx as unknown as Prisma.TransactionClient);

      expect(result).toBe(sprint);
      expect(tx.sprint.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.sprint.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('getSprintWithProjectOrThrow (A8)', () => {
    it('devuelve el Sprint con proyecto.creadoPor resuelto en la MISMA consulta (una sola llamada a sprint.findFirst)', async () => {
      const prisma = makeClient();
      const sprint = {
        idSprint: 10,
        idProyecto: 1,
        proyecto: { creadoPor: 5, eliminadoEn: null },
      };
      prisma.sprint.findFirst.mockResolvedValue(sprint);
      const service = new SprintsContextService(prisma as unknown as PrismaService);

      const result = await service.getSprintWithProjectOrThrow(1, 10);

      expect(result).toBe(sprint);
      expect(prisma.sprint.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.sprint.findFirst).toHaveBeenCalledWith({
        where: { idSprint: 10, idProyecto: 1 },
        include: { proyecto: { select: { creadoPor: true, eliminadoEn: true } } },
      });
    });

    it('lanza NotFoundException si el Sprint no existe en el proyecto', async () => {
      const prisma = makeClient();
      prisma.sprint.findFirst.mockResolvedValue(null);
      const service = new SprintsContextService(prisma as unknown as PrismaService);

      await expect(service.getSprintWithProjectOrThrow(1, 999)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lanza NotFoundException si el proyecto del Sprint está soft-deleted (mismo criterio que getProjectOrThrow)', async () => {
      const prisma = makeClient();
      prisma.sprint.findFirst.mockResolvedValue({
        idSprint: 10,
        idProyecto: 1,
        proyecto: { creadoPor: 5, eliminadoEn: new Date('2026-01-01') },
      });
      const service = new SprintsContextService(prisma as unknown as PrismaService);

      await expect(service.getSprintWithProjectOrThrow(1, 10)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('usa el cliente transaccional proporcionado en vez del PrismaService principal', async () => {
      const prisma = makeClient();
      const tx = makeClient();
      const sprint = { idSprint: 10, idProyecto: 1, proyecto: { creadoPor: 5, eliminadoEn: null } };
      tx.sprint.findFirst.mockResolvedValue(sprint);
      const service = new SprintsContextService(prisma as unknown as PrismaService);

      const result = await service.getSprintWithProjectOrThrow(1, 10, tx as unknown as Prisma.TransactionClient);

      expect(result).toBe(sprint);
      expect(tx.sprint.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.sprint.findFirst).not.toHaveBeenCalled();
    });
  });
});
