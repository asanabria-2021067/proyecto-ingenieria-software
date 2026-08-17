import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SprintsAuthorizationService } from '../src/sprints/sprints-authorization.service';

function makeContext() {
  return {
    getProjectOrThrow: vi.fn(),
    assertProjectLeader: vi.fn(),
    assertActiveProjectParticipant: vi.fn(),
    getCurrentSprint: vi.fn(),
    getSprintInProjectOrThrow: vi.fn(),
    getSprintWithProjectOrThrow: vi.fn(),
  } as any;
}

const LIDER_ID = 1;
const PARTICIPANTE_ID = 2;
const EXTERNO_ID = 4;

const SPRINT = { idSprint: 10, idProyecto: 1, estado: 'ACTIVO' };

const NOT_FOUND_PROYECTO = () => new NotFoundException('Proyecto con id 1 no encontrado');
const NOT_FOUND_SPRINT = () =>
  new NotFoundException('Sprint con id 10 no encontrado en el proyecto 1');
const FORBIDDEN_LEADER = () => new ForbiddenException('No eres el líder de este proyecto');

describe('SprintsAuthorizationService', () => {
  describe('assertCanStartSprint', () => {
    it('permite al líder del proyecto', async () => {
      const ctx = makeContext();
      ctx.assertProjectLeader.mockResolvedValue(undefined);
      const service = new SprintsAuthorizationService(ctx);

      await expect(service.assertCanStartSprint(1, LIDER_ID)).resolves.toBeUndefined();
    });

    it('rechaza a un usuario que no es líder', async () => {
      const ctx = makeContext();
      ctx.assertProjectLeader.mockRejectedValue(FORBIDDEN_LEADER());
      const service = new SprintsAuthorizationService(ctx);

      await expect(service.assertCanStartSprint(1, PARTICIPANTE_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('propaga NotFoundException si el proyecto no existe', async () => {
      const ctx = makeContext();
      ctx.assertProjectLeader.mockRejectedValue(NOT_FOUND_PROYECTO());
      const service = new SprintsAuthorizationService(ctx);

      await expect(service.assertCanStartSprint(99, LIDER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('traslada el cliente transaccional recibido', async () => {
      const ctx = makeContext();
      ctx.assertProjectLeader.mockResolvedValue(undefined);
      const tx = { marker: 'tx' } as any;
      const service = new SprintsAuthorizationService(ctx);

      await service.assertCanStartSprint(1, LIDER_ID, tx);

      expect(ctx.assertProjectLeader).toHaveBeenCalledWith(1, LIDER_ID, tx);
    });
  });

  describe('assertCanListSprintHistory (A10)', () => {
    it('permite al líder del proyecto', async () => {
      const ctx = makeContext();
      ctx.assertActiveProjectParticipant.mockResolvedValue(undefined);
      const service = new SprintsAuthorizationService(ctx);

      await expect(service.assertCanListSprintHistory(1, LIDER_ID)).resolves.toBeUndefined();
    });

    it('permite a un participante con rol activo (lo necesita el tablero Kanban)', async () => {
      const ctx = makeContext();
      ctx.assertActiveProjectParticipant.mockResolvedValue(undefined);
      const service = new SprintsAuthorizationService(ctx);

      await expect(
        service.assertCanListSprintHistory(1, PARTICIPANTE_ID),
      ).resolves.toBeUndefined();
    });

    it('rechaza a un usuario sin participación activa ni liderazgo', async () => {
      const ctx = makeContext();
      ctx.assertActiveProjectParticipant.mockRejectedValue(
        new ForbiddenException('No tienes una participación activa en este proyecto'),
      );
      const service = new SprintsAuthorizationService(ctx);

      await expect(service.assertCanListSprintHistory(1, EXTERNO_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('propaga NotFoundException si el proyecto no existe', async () => {
      const ctx = makeContext();
      ctx.assertActiveProjectParticipant.mockRejectedValue(NOT_FOUND_PROYECTO());
      const service = new SprintsAuthorizationService(ctx);

      await expect(service.assertCanListSprintHistory(99, LIDER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('traslada el cliente transaccional recibido', async () => {
      const ctx = makeContext();
      ctx.assertActiveProjectParticipant.mockResolvedValue(undefined);
      const tx = { marker: 'tx' } as any;
      const service = new SprintsAuthorizationService(ctx);

      await service.assertCanListSprintHistory(1, LIDER_ID, tx);

      expect(ctx.assertActiveProjectParticipant).toHaveBeenCalledWith(1, LIDER_ID, tx);
    });
  });

  describe.each([
    ['assertCanFinalizeSprint' as const, 'finalizar'],
    ['assertCanCloseSprint' as const, 'cerrar'],
    ['assertCanAdjustRecognizedHours' as const, 'ajustar horas'],
    ['assertCanViewSprintHistory' as const, 'ver detalle histórico (A10)'],
  ])('%s (%s)', (method, _accion) => {
    it('permite al líder y devuelve el Sprint validado', async () => {
      const ctx = makeContext();
      ctx.getSprintInProjectOrThrow.mockResolvedValue(SPRINT);
      ctx.assertProjectLeader.mockResolvedValue(undefined);
      const service = new SprintsAuthorizationService(ctx);

      const result = await service[method](1, 10, LIDER_ID);

      expect(result).toBe(SPRINT);
    });

    it('rechaza a un usuario que no es líder', async () => {
      const ctx = makeContext();
      ctx.getSprintInProjectOrThrow.mockResolvedValue(SPRINT);
      ctx.assertProjectLeader.mockRejectedValue(FORBIDDEN_LEADER());
      const service = new SprintsAuthorizationService(ctx);

      await expect(service[method](1, 10, PARTICIPANTE_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rechaza a un usuario externo al proyecto', async () => {
      const ctx = makeContext();
      ctx.getSprintInProjectOrThrow.mockResolvedValue(SPRINT);
      ctx.assertProjectLeader.mockRejectedValue(FORBIDDEN_LEADER());
      const service = new SprintsAuthorizationService(ctx);

      await expect(service[method](1, 10, EXTERNO_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('propaga NotFoundException si el Sprint no existe, sin evaluar liderazgo', async () => {
      const ctx = makeContext();
      ctx.getSprintInProjectOrThrow.mockRejectedValue(NOT_FOUND_SPRINT());
      const service = new SprintsAuthorizationService(ctx);

      await expect(service[method](1, 999, LIDER_ID)).rejects.toBeInstanceOf(NotFoundException);
      expect(ctx.assertProjectLeader).not.toHaveBeenCalled();
    });

    it('propaga NotFoundException si el sprintId pertenece a otro proyecto (sin filtrar datos de otro proyecto)', async () => {
      const ctx = makeContext();
      ctx.getSprintInProjectOrThrow.mockRejectedValue(NOT_FOUND_SPRINT());
      const service = new SprintsAuthorizationService(ctx);

      await expect(service[method](1, 10, LIDER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('valida el Sprint dentro del proyecto antes de comprobar liderazgo', async () => {
      const ctx = makeContext();
      const orden: string[] = [];
      ctx.getSprintInProjectOrThrow.mockImplementation(async () => {
        orden.push('sprint');
        return SPRINT;
      });
      ctx.assertProjectLeader.mockImplementation(async () => {
        orden.push('liderazgo');
      });
      const service = new SprintsAuthorizationService(ctx);

      await service[method](1, 10, LIDER_ID);

      expect(orden).toEqual(['sprint', 'liderazgo']);
    });

    it('traslada el mismo cliente transaccional a todas las llamadas de contexto', async () => {
      const ctx = makeContext();
      ctx.getSprintInProjectOrThrow.mockResolvedValue(SPRINT);
      ctx.assertProjectLeader.mockResolvedValue(undefined);
      const tx = { marker: 'tx' } as any;
      const service = new SprintsAuthorizationService(ctx);

      await service[method](1, 10, LIDER_ID, tx);

      expect(ctx.getSprintInProjectOrThrow).toHaveBeenCalledWith(1, 10, tx);
      expect(ctx.assertProjectLeader).toHaveBeenCalledWith(1, LIDER_ID, tx);
    });
  });

  describe('assertCanViewClosingSummary (A8)', () => {
    const SPRINT_CON_PROYECTO = { idSprint: 10, idProyecto: 1, proyecto: { creadoPor: LIDER_ID } };

    it('permite al líder y devuelve el Sprint validado, en UNA sola consulta de contexto (getSprintWithProjectOrThrow)', async () => {
      const ctx = makeContext();
      ctx.getSprintWithProjectOrThrow.mockResolvedValue(SPRINT_CON_PROYECTO);
      const service = new SprintsAuthorizationService(ctx);

      const result = await service.assertCanViewClosingSummary(1, 10, LIDER_ID);

      expect(result).toBe(SPRINT_CON_PROYECTO);
      expect(ctx.getSprintWithProjectOrThrow).toHaveBeenCalledTimes(1);
      // A diferencia de assertCanFinalizeSprint/assertCanCloseSprint/
      // assertCanAdjustRecognizedHours, esta variante NUNCA llama a
      // assertProjectLeader por separado: el liderazgo ya viaja en la
      // misma fila (proyecto.creadoPor) resuelta por
      // getSprintWithProjectOrThrow — ese es el ahorro de query de A8.
      expect(ctx.assertProjectLeader).not.toHaveBeenCalled();
    });

    it('rechaza a un usuario que no es líder con ForbiddenException', async () => {
      const ctx = makeContext();
      ctx.getSprintWithProjectOrThrow.mockResolvedValue(SPRINT_CON_PROYECTO);
      const service = new SprintsAuthorizationService(ctx);

      await expect(
        service.assertCanViewClosingSummary(1, 10, PARTICIPANTE_ID),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rechaza a un usuario externo al proyecto con ForbiddenException', async () => {
      const ctx = makeContext();
      ctx.getSprintWithProjectOrThrow.mockResolvedValue(SPRINT_CON_PROYECTO);
      const service = new SprintsAuthorizationService(ctx);

      await expect(
        service.assertCanViewClosingSummary(1, 10, EXTERNO_ID),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('propaga NotFoundException si el Sprint no existe en el proyecto (sin evaluar liderazgo)', async () => {
      const ctx = makeContext();
      ctx.getSprintWithProjectOrThrow.mockRejectedValue(NOT_FOUND_SPRINT());
      const service = new SprintsAuthorizationService(ctx);

      await expect(service.assertCanViewClosingSummary(1, 999, LIDER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('traslada el cliente transaccional recibido', async () => {
      const ctx = makeContext();
      ctx.getSprintWithProjectOrThrow.mockResolvedValue(SPRINT_CON_PROYECTO);
      const tx = { marker: 'tx' } as any;
      const service = new SprintsAuthorizationService(ctx);

      await service.assertCanViewClosingSummary(1, 10, LIDER_ID, tx);

      expect(ctx.getSprintWithProjectOrThrow).toHaveBeenCalledWith(1, 10, tx);
    });
  });

  describe('ningún permiso depende de datos de otro proyecto', () => {
    it('assertCanFinalizeSprint no consulta ningún dato fuera de idProyecto/idSprint recibidos', async () => {
      const ctx = makeContext();
      ctx.getSprintInProjectOrThrow.mockResolvedValue(SPRINT);
      ctx.assertProjectLeader.mockResolvedValue(undefined);
      const service = new SprintsAuthorizationService(ctx);

      await service.assertCanFinalizeSprint(1, 10, LIDER_ID);

      expect(ctx.getSprintInProjectOrThrow).toHaveBeenCalledWith(1, 10, undefined);
      expect(ctx.assertProjectLeader).toHaveBeenCalledWith(1, LIDER_ID, undefined);
    });

    it('assertCanCloseSprint no consulta ningún dato fuera de idProyecto/idSprint recibidos', async () => {
      const ctx = makeContext();
      ctx.getSprintInProjectOrThrow.mockResolvedValue(SPRINT);
      ctx.assertProjectLeader.mockResolvedValue(undefined);
      const service = new SprintsAuthorizationService(ctx);

      await service.assertCanCloseSprint(1, 10, LIDER_ID);

      expect(ctx.getSprintInProjectOrThrow).toHaveBeenCalledWith(1, 10, undefined);
      expect(ctx.assertProjectLeader).toHaveBeenCalledWith(1, LIDER_ID, undefined);
    });
  });
});
