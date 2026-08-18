import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, type ExecutionContext } from '@nestjs/common';
import type { SprintsContextService } from '../src/sprints/sprints-context.service';
import {
  ProjectWriteGuard,
  NO_ACTIVE_SPRINT_MESSAGE,
  FINALIZING_SPRINT_MESSAGE,
} from '../src/common/guards/project-write.guard';

function makeSprintsContext() {
  return { getCurrentSprint: vi.fn() } as unknown as SprintsContextService & {
    getCurrentSprint: ReturnType<typeof vi.fn>;
  };
}

function makeContext(params: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ params }),
    }),
  } as unknown as ExecutionContext;
}

describe('ProjectWriteGuard', () => {
  describe('sin Sprint operable', () => {
    it('lanza ConflictException con el mensaje congelado de "sin Sprint activo"', async () => {
      const sprintsContext = makeSprintsContext();
      sprintsContext.getCurrentSprint.mockResolvedValue(null);
      const guard = new ProjectWriteGuard(sprintsContext);
      const context = makeContext({ projectId: '1' });

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ConflictException);
      await expect(guard.canActivate(context)).rejects.toThrow(NO_ACTIVE_SPRINT_MESSAGE);
    });
  });

  describe('Sprint ACTIVO', () => {
    it('devuelve true y permite continuar', async () => {
      const sprintsContext = makeSprintsContext();
      sprintsContext.getCurrentSprint.mockResolvedValue({
        idSprint: 1,
        idProyecto: 1,
        estado: 'ACTIVO',
      });
      const guard = new ProjectWriteGuard(sprintsContext);
      const context = makeContext({ projectId: '1' });

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });
  });

  describe('Sprint EN_FINALIZACION', () => {
    it('lanza ConflictException con el mensaje congelado de finalización', async () => {
      const sprintsContext = makeSprintsContext();
      sprintsContext.getCurrentSprint.mockResolvedValue({
        idSprint: 1,
        idProyecto: 1,
        estado: 'EN_FINALIZACION',
      });
      const guard = new ProjectWriteGuard(sprintsContext);
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

  describe('resolución de projectId', () => {
    it('lee el parámetro projectId de la request y lo convierte a number antes de llamar a getCurrentSprint', async () => {
      const sprintsContext = makeSprintsContext();
      sprintsContext.getCurrentSprint.mockResolvedValue({ idSprint: 1, estado: 'ACTIVO' });
      const guard = new ProjectWriteGuard(sprintsContext);
      const context = makeContext({ projectId: '42' });

      await guard.canActivate(context);

      expect(sprintsContext.getCurrentSprint).toHaveBeenCalledWith(42);
      expect(sprintsContext.getCurrentSprint).toHaveBeenCalledTimes(1);
    });

    it('pasa exactamente el projectId numérico resuelto, no el string crudo', async () => {
      const sprintsContext = makeSprintsContext();
      sprintsContext.getCurrentSprint.mockResolvedValue({ idSprint: 1, estado: 'ACTIVO' });
      const guard = new ProjectWriteGuard(sprintsContext);
      const context = makeContext({ projectId: '7' });

      await guard.canActivate(context);

      const calledWith = sprintsContext.getCurrentSprint.mock.calls[0][0];
      expect(calledWith).toBe(7);
      expect(typeof calledWith).toBe('number');
    });
  });

  describe('parámetro inválido', () => {
    it('lanza BadRequestException si projectId falta en los params, sin consultar Sprint', async () => {
      const sprintsContext = makeSprintsContext();
      const guard = new ProjectWriteGuard(sprintsContext);
      const context = makeContext({});

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(BadRequestException);
      expect(sprintsContext.getCurrentSprint).not.toHaveBeenCalled();
    });

    it('lanza BadRequestException si projectId no es un entero válido ("abc"), sin consultar Sprint', async () => {
      const sprintsContext = makeSprintsContext();
      const guard = new ProjectWriteGuard(sprintsContext);
      const context = makeContext({ projectId: 'abc' });

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(BadRequestException);
      expect(sprintsContext.getCurrentSprint).not.toHaveBeenCalled();
    });

    it('lanza BadRequestException si projectId es un número no entero ("1.5")', async () => {
      const sprintsContext = makeSprintsContext();
      const guard = new ProjectWriteGuard(sprintsContext);
      const context = makeContext({ projectId: '1.5' });

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
