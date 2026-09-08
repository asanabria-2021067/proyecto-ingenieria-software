import { describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  type ExecutionContext,
} from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { PrismaService } from '../src/prisma/prisma.service';
import { ProjectIdResolverService } from '../src/common/project-policy/project-id-resolver.service';
import { ProjectPolicyService } from '../src/common/project-policy/project-policy.service';
import {
  ProjectWriteGuard,
  NO_ACTIVE_SPRINT_MESSAGE,
  FINALIZING_SPRINT_MESSAGE,
} from '../src/common/guards/project-write.guard';
import type { ProjectWriteMetadata } from '../src/common/guards/project-write.metadata';

/**
 * Sprint 7 (C027): el guard pasa a ser guiado por metadata explícita
 * (`@ProjectWrite`) resuelta por el resolutor enumerado; sin metadata aplica
 * el default restrictivo (P/E + Sprint ambiente ACTIVO). Estos casos
 * conservan exactamente los rechazos observables anteriores (sin Sprint
 * operable, EN_FINALIZACION, projectId inválido) sobre el nuevo contrato.
 */
interface SprintRow {
  idSprint: number;
  idProyecto: number;
  estado: string;
}

function makeGuard(options: {
  sprint: SprintRow | null;
  project?: { idProyecto: number; estadoProyecto: string; creadoPor: number; eliminadoEn: Date | null } | null;
  metadata?: ProjectWriteMetadata;
}) {
  const prisma = {
    proyecto: {
      // El doble devuelve la fila del proyecto consultado (mismo id que el resuelto), como la base real.
      findUnique: vi.fn().mockImplementation(async (args: { where: { idProyecto: number } }) =>
        options.project === undefined
          ? { idProyecto: args.where.idProyecto, estadoProyecto: 'EN_PROGRESO', creadoPor: 1, eliminadoEn: null }
          : options.project,
      ),
    },
    sprint: { findFirst: vi.fn().mockResolvedValue(options.sprint) },
  };
  const prismaService = prisma as unknown as PrismaService;
  const resolver = new ProjectIdResolverService(prismaService);
  const policy = new ProjectPolicyService(resolver);
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(options.metadata),
  } as unknown as Reflector;
  return { guard: new ProjectWriteGuard(reflector, resolver, policy, prismaService), prisma };
}

function makeContext(params: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ params, body: {} }),
    }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

describe('ProjectWriteGuard', () => {
  describe('sin Sprint operable', () => {
    it('lanza ConflictException con el mensaje congelado de "sin Sprint activo"', async () => {
      const { guard } = makeGuard({ sprint: null });
      const context = makeContext({ projectId: '1' });

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ConflictException);
      await expect(guard.canActivate(context)).rejects.toThrow(NO_ACTIVE_SPRINT_MESSAGE);
    });
  });

  describe('Sprint ACTIVO', () => {
    it('devuelve true y permite continuar', async () => {
      const { guard } = makeGuard({ sprint: { idSprint: 1, idProyecto: 1, estado: 'ACTIVO' } });
      const context = makeContext({ projectId: '1' });

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });
  });

  describe('Sprint EN_FINALIZACION', () => {
    it('lanza ConflictException con el mensaje congelado de finalización', async () => {
      const { guard } = makeGuard({ sprint: { idSprint: 1, idProyecto: 1, estado: 'EN_FINALIZACION' } });
      const context = makeContext({ projectId: '1' });

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ConflictException);
      await expect(guard.canActivate(context)).rejects.toThrow(FINALIZING_SPRINT_MESSAGE);
    });
  });

  describe('mensajes distintos', () => {
    it('el mensaje de "sin Sprint" y el de "EN_FINALIZACION" nunca coinciden', () => {
      expect(NO_ACTIVE_SPRINT_MESSAGE).not.toBe(FINALIZING_SPRINT_MESSAGE);
    });
  });

  describe('resolución de projectId (default: params.projectId)', () => {
    it('lee el parámetro projectId de la request y consulta el Sprint operable con el número resuelto', async () => {
      const { guard, prisma } = makeGuard({ sprint: { idSprint: 1, idProyecto: 42, estado: 'ACTIVO' } });
      const context = makeContext({ projectId: '42' });

      await guard.canActivate(context);

      expect(prisma.sprint.findFirst).toHaveBeenCalledTimes(1);
      const consulta = prisma.sprint.findFirst.mock.calls[0][0] as { where: { idProyecto: unknown } };
      expect(consulta.where.idProyecto).toBe(42);
      expect(prisma.proyecto.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { idProyecto: 42 } }),
      );
    });

    it('pasa exactamente el projectId numérico resuelto, no el string crudo', async () => {
      const { guard, prisma } = makeGuard({ sprint: { idSprint: 1, idProyecto: 7, estado: 'ACTIVO' } });
      const context = makeContext({ projectId: '7' });

      await guard.canActivate(context);

      const consulta = prisma.sprint.findFirst.mock.calls[0][0] as { where: { idProyecto: unknown } };
      expect(consulta.where.idProyecto).toBe(7);
      expect(typeof consulta.where.idProyecto).toBe('number');
    });
  });

  describe('parámetro inválido', () => {
    it('lanza BadRequestException si projectId falta en los params, sin consultar Sprint', async () => {
      const { guard, prisma } = makeGuard({ sprint: null });
      const context = makeContext({});

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.sprint.findFirst).not.toHaveBeenCalled();
    });

    it('lanza BadRequestException si projectId no es un entero válido ("abc"), sin consultar Sprint', async () => {
      const { guard, prisma } = makeGuard({ sprint: null });
      const context = makeContext({ projectId: 'abc' });

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.sprint.findFirst).not.toHaveBeenCalled();
    });

    it('lanza BadRequestException si projectId es un número no entero ("1.5")', async () => {
      const { guard } = makeGuard({ sprint: null });
      const context = makeContext({ projectId: '1.5' });

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('proyecto inexistente o eliminado', () => {
    it('lanza NotFoundException sin consultar Sprint', async () => {
      const { guard, prisma } = makeGuard({ sprint: null, project: null });
      const context = makeContext({ projectId: '9' });

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.sprint.findFirst).not.toHaveBeenCalled();
    });
  });
});
