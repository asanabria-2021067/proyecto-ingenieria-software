import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TasksAuthorizationService } from '../src/tasks/tasks-authorization.service';
import { TasksContextService } from '../src/tasks/tasks-context.service';

function makeContext() {
  const context = {
    getProjectOrThrow: vi.fn(),
    getTaskInProjectOrThrow: vi.fn(),
    getActiveAssignment: vi.fn(),
    getActiveParticipationInRole: vi.fn(),
    assertProjectLeader: vi.fn(),
    assertActiveProjectParticipant: vi.fn(),
  };
  return context as typeof context & TasksContextService;
}

const LIDER_ID = 1;
const PARTICIPANTE_ID = 2;
const ASIGNADO_ID = 3;
const EXTERNO_ID = 4;
const CREADOR_ID = 777;

const PROYECTO = { idProyecto: 1, creadoPor: LIDER_ID };
const TAREA = { idTarea: 10, idProyecto: 1, creadaPor: CREADOR_ID, eliminadoEn: null, idRolProyecto: null };
const ROL_TAREA = 55;
const TAREA_CON_ROL = { idTarea: 10, idProyecto: 1, creadaPor: CREADOR_ID, eliminadoEn: null, idRolProyecto: ROL_TAREA };

const NOT_FOUND = () => new NotFoundException('Tarea con id 10 no encontrada en el proyecto 1');
const FORBIDDEN_LEADER = () => new ForbiddenException('No eres el líder de este proyecto');
const FORBIDDEN_PARTICIPANT = () =>
  new ForbiddenException('No tienes una participación activa en este proyecto');

describe('TasksAuthorizationService', () => {
  describe('assertCanCreateTask', () => {
    it('permite al líder', async () => {
      const ctx = makeContext();
      ctx.assertActiveProjectParticipant.mockResolvedValue(undefined);
      const service = new TasksAuthorizationService(ctx);

      await expect(service.assertCanCreateTask(1, LIDER_ID)).resolves.toBeUndefined();
    });

    it('permite a un participante activo (no exclusivo del líder)', async () => {
      const ctx = makeContext();
      ctx.assertActiveProjectParticipant.mockResolvedValue(undefined);
      const service = new TasksAuthorizationService(ctx);

      await expect(service.assertCanCreateTask(1, PARTICIPANTE_ID)).resolves.toBeUndefined();
    });

    it('rechaza a un usuario sin participación activa', async () => {
      const ctx = makeContext();
      ctx.assertActiveProjectParticipant.mockRejectedValue(FORBIDDEN_PARTICIPANT());
      const service = new TasksAuthorizationService(ctx);

      await expect(service.assertCanCreateTask(1, EXTERNO_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('propaga NotFoundException si el proyecto no existe', async () => {
      const ctx = makeContext();
      ctx.assertActiveProjectParticipant.mockRejectedValue(
        new NotFoundException('Proyecto con id 1 no encontrado'),
      );
      const service = new TasksAuthorizationService(ctx);

      await expect(service.assertCanCreateTask(1, LIDER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('traslada el cliente transaccional recibido', async () => {
      const ctx = makeContext();
      ctx.assertActiveProjectParticipant.mockResolvedValue(undefined);
      const tx = { marker: 'tx' } as unknown as Prisma.TransactionClient;
      const service = new TasksAuthorizationService(ctx);

      await service.assertCanCreateTask(1, LIDER_ID, tx);

      expect(ctx.assertActiveProjectParticipant).toHaveBeenCalledWith(1, LIDER_ID, tx);
    });
  });

  describe('assertCanEditTask', () => {
    it('permite al líder y devuelve la tarea validada', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockResolvedValue(TAREA);
      ctx.getProjectOrThrow.mockResolvedValue(PROYECTO);
      const service = new TasksAuthorizationService(ctx);

      const result = await service.assertCanEditTask(1, 10, LIDER_ID);

      expect(result).toBe(TAREA);
    });

    it('rechaza a un participante activo que no es líder (tarea sin rol: sin vía de colaboración por rol)', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockResolvedValue(TAREA);
      ctx.getProjectOrThrow.mockResolvedValue(PROYECTO);
      const service = new TasksAuthorizationService(ctx);

      await expect(service.assertCanEditTask(1, 10, PARTICIPANTE_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(ctx.assertActiveProjectParticipant).not.toHaveBeenCalled();
      expect(ctx.getActiveParticipationInRole).not.toHaveBeenCalled();
    });

    it('rechaza al asignado activo que no es líder', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockResolvedValue(TAREA);
      ctx.getProjectOrThrow.mockResolvedValue(PROYECTO);
      const service = new TasksAuthorizationService(ctx);

      await expect(service.assertCanEditTask(1, 10, ASIGNADO_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(ctx.getActiveAssignment).not.toHaveBeenCalled();
    });

    it('rechaza al creador de la tarea si no es líder', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockResolvedValue(TAREA);
      ctx.getProjectOrThrow.mockResolvedValue(PROYECTO);
      const service = new TasksAuthorizationService(ctx);

      await expect(service.assertCanEditTask(1, 10, CREADOR_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('propaga NotFoundException si la tarea no existe', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockRejectedValue(NOT_FOUND());
      const service = new TasksAuthorizationService(ctx);

      await expect(service.assertCanEditTask(1, 999, LIDER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(ctx.getProjectOrThrow).not.toHaveBeenCalled();
    });

    it('propaga NotFoundException si la tarea pertenece a otro proyecto', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockRejectedValue(NOT_FOUND());
      const service = new TasksAuthorizationService(ctx);

      await expect(service.assertCanEditTask(1, 10, LIDER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('propaga NotFoundException si la tarea está eliminada', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockRejectedValue(NOT_FOUND());
      const service = new TasksAuthorizationService(ctx);

      await expect(service.assertCanEditTask(1, 10, LIDER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe.each([
    ['assertCanAssignTask' as const, 'asignar'],
    ['assertCanUnassignTask' as const, 'desasignar'],
  ])('%s (%s)', (method, _label) => {
    it('permite al líder y devuelve la tarea validada', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockResolvedValue(TAREA);
      ctx.getProjectOrThrow.mockResolvedValue(PROYECTO);
      const service = new TasksAuthorizationService(ctx);

      const result = await service[method](1, 10, LIDER_ID);

      expect(result).toBe(TAREA);
    });

    it('rechaza al asignado activo que no es líder (tarea sin rol)', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockResolvedValue(TAREA);
      ctx.getProjectOrThrow.mockResolvedValue(PROYECTO);
      const service = new TasksAuthorizationService(ctx);

      await expect(service[method](1, 10, ASIGNADO_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(ctx.getActiveAssignment).not.toHaveBeenCalled();
    });

    it('rechaza a un participante que no es líder (tarea sin rol)', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockResolvedValue(TAREA);
      ctx.getProjectOrThrow.mockResolvedValue(PROYECTO);
      const service = new TasksAuthorizationService(ctx);

      await expect(service[method](1, 10, PARTICIPANTE_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('permite a un participante activo en el mismo rol que la tarea (no líder)', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockResolvedValue(TAREA_CON_ROL);
      ctx.getProjectOrThrow.mockResolvedValue(PROYECTO);
      ctx.getActiveParticipationInRole.mockResolvedValue({ idParticipacion: 1 });
      const service = new TasksAuthorizationService(ctx);

      const result = await service[method](1, 10, PARTICIPANTE_ID);

      expect(result).toBe(TAREA_CON_ROL);
      expect(ctx.getActiveParticipationInRole).toHaveBeenCalledWith(1, PARTICIPANTE_ID, ROL_TAREA, undefined);
    });

    it('rechaza a un participante activo en un rol DISTINTO del de la tarea (cross-role)', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockResolvedValue(TAREA_CON_ROL);
      ctx.getProjectOrThrow.mockResolvedValue(PROYECTO);
      ctx.getActiveParticipationInRole.mockResolvedValue(null);
      const service = new TasksAuthorizationService(ctx);

      await expect(service[method](1, 10, PARTICIPANTE_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rechaza a un usuario cuya participación en el rol de la tarea ya no está ACTIVO (retirado)', async () => {
      // getActiveParticipationInRole ya filtra por estadoParticipacion:
      // 'ACTIVO' en la propia consulta — una fila RETIRADO/COMPLETADO se
      // traduce en null aquí, igual que en assertActiveProjectParticipant.
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockResolvedValue(TAREA_CON_ROL);
      ctx.getProjectOrThrow.mockResolvedValue(PROYECTO);
      ctx.getActiveParticipationInRole.mockResolvedValue(null);
      const service = new TasksAuthorizationService(ctx);

      await expect(service[method](1, 10, PARTICIPANTE_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('tarea sin rol: un participante activo es rechazado sin consultar participación por rol', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockResolvedValue(TAREA);
      ctx.getProjectOrThrow.mockResolvedValue(PROYECTO);
      const service = new TasksAuthorizationService(ctx);

      await expect(service[method](1, 10, PARTICIPANTE_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(ctx.getActiveParticipationInRole).not.toHaveBeenCalled();
    });

    it('el líder conserva autoridad total sobre una tarea con rol, sin consultar participación por rol', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockResolvedValue(TAREA_CON_ROL);
      ctx.getProjectOrThrow.mockResolvedValue(PROYECTO);
      const service = new TasksAuthorizationService(ctx);

      const result = await service[method](1, 10, LIDER_ID);

      expect(result).toBe(TAREA_CON_ROL);
      expect(ctx.getActiveParticipationInRole).not.toHaveBeenCalled();
    });

    it('traslada el mismo tx a getTaskInProjectOrThrow, getProjectOrThrow y getActiveParticipationInRole', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockResolvedValue(TAREA_CON_ROL);
      ctx.getProjectOrThrow.mockResolvedValue(PROYECTO);
      ctx.getActiveParticipationInRole.mockResolvedValue({ idParticipacion: 1 });
      const tx = { marker: 'tx' } as unknown as Prisma.TransactionClient;
      const service = new TasksAuthorizationService(ctx);

      await service[method](1, 10, PARTICIPANTE_ID, tx);

      expect(ctx.getTaskInProjectOrThrow).toHaveBeenCalledWith(1, 10, tx);
      expect(ctx.getProjectOrThrow).toHaveBeenCalledWith(1, tx);
      expect(ctx.getActiveParticipationInRole).toHaveBeenCalledWith(1, PARTICIPANTE_ID, ROL_TAREA, tx);
    });
  });

  describe('assertCanDeleteTask', () => {
    it('permite al líder y devuelve la tarea validada', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockResolvedValue(TAREA);
      ctx.assertProjectLeader.mockResolvedValue(undefined);
      const service = new TasksAuthorizationService(ctx);

      const result = await service.assertCanDeleteTask(1, 10, LIDER_ID);

      expect(result).toBe(TAREA);
    });

    it('rechaza al creador de la tarea si no es líder', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockResolvedValue(TAREA);
      ctx.assertProjectLeader.mockRejectedValue(FORBIDDEN_LEADER());
      const service = new TasksAuthorizationService(ctx);

      await expect(service.assertCanDeleteTask(1, 10, CREADOR_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rechaza al asignado activo que no es líder', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockResolvedValue(TAREA);
      ctx.assertProjectLeader.mockRejectedValue(FORBIDDEN_LEADER());
      const service = new TasksAuthorizationService(ctx);

      await expect(service.assertCanDeleteTask(1, 10, ASIGNADO_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('assertCanChangeTaskState', () => {
    it('permite al líder sin consultar la asignación activa', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockResolvedValue(TAREA);
      ctx.getProjectOrThrow.mockResolvedValue(PROYECTO);
      const service = new TasksAuthorizationService(ctx);

      const result = await service.assertCanChangeTaskState(1, 10, LIDER_ID);

      expect(result).toBe(TAREA);
      expect(ctx.getActiveAssignment).not.toHaveBeenCalled();
    });

    it('permite al asignado activo', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockResolvedValue(TAREA);
      ctx.getProjectOrThrow.mockResolvedValue(PROYECTO);
      ctx.getActiveAssignment.mockResolvedValue({
        idAsignacion: 1,
        idTarea: 10,
        idUsuario: ASIGNADO_ID,
        desasignadaEn: null,
      });
      const service = new TasksAuthorizationService(ctx);

      const result = await service.assertCanChangeTaskState(1, 10, ASIGNADO_ID);

      expect(result).toBe(TAREA);
    });

    it('rechaza a un usuario distinto del asignado activo', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockResolvedValue(TAREA);
      ctx.getProjectOrThrow.mockResolvedValue(PROYECTO);
      ctx.getActiveAssignment.mockResolvedValue({
        idAsignacion: 1,
        idTarea: 10,
        idUsuario: ASIGNADO_ID,
        desasignadaEn: null,
      });
      const service = new TasksAuthorizationService(ctx);

      await expect(service.assertCanChangeTaskState(1, 10, EXTERNO_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rechaza cuando la tarea no tiene asignación activa', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockResolvedValue(TAREA);
      ctx.getProjectOrThrow.mockResolvedValue(PROYECTO);
      ctx.getActiveAssignment.mockResolvedValue(null);
      const service = new TasksAuthorizationService(ctx);

      await expect(service.assertCanChangeTaskState(1, 10, ASIGNADO_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('no usa una asignación cerrada (getActiveAssignment ya filtra desasignadaEn: null, aquí null representa esa realidad)', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockResolvedValue(TAREA);
      ctx.getProjectOrThrow.mockResolvedValue(PROYECTO);
      // El contrato de TasksContextService.getActiveAssignment garantiza que
      // una fila con desasignadaEn distinto de null nunca se devuelve; se
      // simula ese comportamiento con null (sin asignación activa vigente).
      ctx.getActiveAssignment.mockResolvedValue(null);
      const service = new TasksAuthorizationService(ctx);

      await expect(service.assertCanChangeTaskState(1, 10, ASIGNADO_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rechaza al creador de la tarea sin otros permisos', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockResolvedValue(TAREA);
      ctx.getProjectOrThrow.mockResolvedValue(PROYECTO);
      ctx.getActiveAssignment.mockResolvedValue(null);
      const service = new TasksAuthorizationService(ctx);

      await expect(service.assertCanChangeTaskState(1, 10, CREADOR_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rechaza a un participante activo que no está asignado, sin consultar participación', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockResolvedValue(TAREA);
      ctx.getProjectOrThrow.mockResolvedValue(PROYECTO);
      ctx.getActiveAssignment.mockResolvedValue({
        idAsignacion: 1,
        idTarea: 10,
        idUsuario: ASIGNADO_ID,
        desasignadaEn: null,
      });
      const service = new TasksAuthorizationService(ctx);

      await expect(
        service.assertCanChangeTaskState(1, 10, PARTICIPANTE_ID),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(ctx.assertActiveProjectParticipant).not.toHaveBeenCalled();
    });

    it('propaga NotFoundException si la tarea no existe', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockRejectedValue(NOT_FOUND());
      const service = new TasksAuthorizationService(ctx);

      await expect(service.assertCanChangeTaskState(1, 999, LIDER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(ctx.getProjectOrThrow).not.toHaveBeenCalled();
    });

    it('propaga NotFoundException si la tarea está eliminada', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockRejectedValue(NOT_FOUND());
      const service = new TasksAuthorizationService(ctx);

      await expect(service.assertCanChangeTaskState(1, 10, LIDER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('consulta la asignación nuevamente en cada invocación (sin caché)', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockResolvedValue(TAREA);
      ctx.getProjectOrThrow.mockResolvedValue(PROYECTO);
      ctx.getActiveAssignment.mockResolvedValue({
        idAsignacion: 1,
        idTarea: 10,
        idUsuario: ASIGNADO_ID,
        desasignadaEn: null,
      });
      const service = new TasksAuthorizationService(ctx);

      await service.assertCanChangeTaskState(1, 10, ASIGNADO_ID);
      await service.assertCanChangeTaskState(1, 10, ASIGNADO_ID);

      expect(ctx.getActiveAssignment).toHaveBeenCalledTimes(2);
    });

    it('si la primera llamada encuentra al asignado y la segunda ya no, la segunda se rechaza (revocación inmediata)', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockResolvedValue(TAREA);
      ctx.getProjectOrThrow.mockResolvedValue(PROYECTO);
      ctx.getActiveAssignment
        .mockResolvedValueOnce({
          idAsignacion: 1,
          idTarea: 10,
          idUsuario: ASIGNADO_ID,
          desasignadaEn: null,
        })
        .mockResolvedValueOnce(null);
      const service = new TasksAuthorizationService(ctx);

      await expect(service.assertCanChangeTaskState(1, 10, ASIGNADO_ID)).resolves.toBe(TAREA);
      await expect(service.assertCanChangeTaskState(1, 10, ASIGNADO_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('assertCanListProjectTasks', () => {
    it('permite al líder', async () => {
      const ctx = makeContext();
      ctx.assertActiveProjectParticipant.mockResolvedValue(undefined);
      const service = new TasksAuthorizationService(ctx);

      await expect(service.assertCanListProjectTasks(1, LIDER_ID)).resolves.toBeUndefined();
    });

    it('permite a un participante activo', async () => {
      const ctx = makeContext();
      ctx.assertActiveProjectParticipant.mockResolvedValue(undefined);
      const service = new TasksAuthorizationService(ctx);

      await expect(
        service.assertCanListProjectTasks(1, PARTICIPANTE_ID),
      ).resolves.toBeUndefined();
    });

    it('rechaza a un usuario sin participación', async () => {
      const ctx = makeContext();
      ctx.assertActiveProjectParticipant.mockRejectedValue(FORBIDDEN_PARTICIPANT());
      const service = new TasksAuthorizationService(ctx);

      await expect(service.assertCanListProjectTasks(1, EXTERNO_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rechaza una participación no activa', async () => {
      const ctx = makeContext();
      ctx.assertActiveProjectParticipant.mockRejectedValue(FORBIDDEN_PARTICIPANT());
      const service = new TasksAuthorizationService(ctx);

      await expect(service.assertCanListProjectTasks(1, PARTICIPANTE_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('traslada el cliente transaccional recibido', async () => {
      const ctx = makeContext();
      ctx.assertActiveProjectParticipant.mockResolvedValue(undefined);
      const tx = { marker: 'tx' } as unknown as Prisma.TransactionClient;
      const service = new TasksAuthorizationService(ctx);

      await service.assertCanListProjectTasks(1, LIDER_ID, tx);

      expect(ctx.assertActiveProjectParticipant).toHaveBeenCalledWith(1, LIDER_ID, tx);
    });
  });

  describe('assertCanReadTask', () => {
    it('permite al líder y devuelve la tarea validada', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockResolvedValue(TAREA);
      ctx.assertActiveProjectParticipant.mockResolvedValue(undefined);
      const service = new TasksAuthorizationService(ctx);

      const result = await service.assertCanReadTask(1, 10, LIDER_ID);

      expect(result).toBe(TAREA);
    });

    it('permite a un participante activo', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockResolvedValue(TAREA);
      ctx.assertActiveProjectParticipant.mockResolvedValue(undefined);
      const service = new TasksAuthorizationService(ctx);

      const result = await service.assertCanReadTask(1, 10, PARTICIPANTE_ID);

      expect(result).toBe(TAREA);
    });

    it('rechaza a un asignado que ya no participa activamente', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockResolvedValue(TAREA);
      ctx.assertActiveProjectParticipant.mockRejectedValue(FORBIDDEN_PARTICIPANT());
      const service = new TasksAuthorizationService(ctx);

      await expect(service.assertCanReadTask(1, 10, ASIGNADO_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rechaza a un usuario externo', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockResolvedValue(TAREA);
      ctx.assertActiveProjectParticipant.mockRejectedValue(FORBIDDEN_PARTICIPANT());
      const service = new TasksAuthorizationService(ctx);

      await expect(service.assertCanReadTask(1, 10, EXTERNO_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('trata una tarea de otro proyecto como no encontrada, sin evaluar participación', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockRejectedValue(NOT_FOUND());
      const service = new TasksAuthorizationService(ctx);

      await expect(service.assertCanReadTask(1, 10, LIDER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(ctx.assertActiveProjectParticipant).not.toHaveBeenCalled();
    });

    it('trata una tarea eliminada como no encontrada', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockRejectedValue(NOT_FOUND());
      const service = new TasksAuthorizationService(ctx);

      await expect(service.assertCanReadTask(1, 10, LIDER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('valida la tarea antes de comprobar la participación', async () => {
      const ctx = makeContext();
      const orden: string[] = [];
      ctx.getTaskInProjectOrThrow.mockImplementation(async () => {
        orden.push('tarea');
        return TAREA;
      });
      ctx.assertActiveProjectParticipant.mockImplementation(async () => {
        orden.push('participacion');
      });
      const service = new TasksAuthorizationService(ctx);

      await service.assertCanReadTask(1, 10, LIDER_ID);

      expect(orden).toEqual(['tarea', 'participacion']);
    });
  });

  describe('assertCanCommentTask', () => {
    it('permite al líder y devuelve la tarea validada', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockResolvedValue(TAREA);
      ctx.assertActiveProjectParticipant.mockResolvedValue(undefined);
      const service = new TasksAuthorizationService(ctx);

      const result = await service.assertCanCommentTask(1, 10, LIDER_ID);

      expect(result).toBe(TAREA);
    });

    it('permite a un participante activo', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockResolvedValue(TAREA);
      ctx.assertActiveProjectParticipant.mockResolvedValue(undefined);
      const service = new TasksAuthorizationService(ctx);

      const result = await service.assertCanCommentTask(1, 10, PARTICIPANTE_ID);

      expect(result).toBe(TAREA);
    });

    it('rechaza a un asignado sin participación activa', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockResolvedValue(TAREA);
      ctx.assertActiveProjectParticipant.mockRejectedValue(FORBIDDEN_PARTICIPANT());
      const service = new TasksAuthorizationService(ctx);

      await expect(service.assertCanCommentTask(1, 10, ASIGNADO_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rechaza a un usuario externo', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockResolvedValue(TAREA);
      ctx.assertActiveProjectParticipant.mockRejectedValue(FORBIDDEN_PARTICIPANT());
      const service = new TasksAuthorizationService(ctx);

      await expect(service.assertCanCommentTask(1, 10, EXTERNO_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rechaza comentar una tarea eliminada', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockRejectedValue(NOT_FOUND());
      const service = new TasksAuthorizationService(ctx);

      await expect(service.assertCanCommentTask(1, 10, LIDER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('Tarea.creadaPor no concede ninguna autorización adicional', () => {
    // El "creador" no es líder, no participa activamente y no está asignado.
    function makeRejectingContext() {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockResolvedValue(TAREA);
      ctx.getProjectOrThrow.mockResolvedValue(PROYECTO);
      ctx.assertProjectLeader.mockRejectedValue(FORBIDDEN_LEADER());
      ctx.assertActiveProjectParticipant.mockRejectedValue(FORBIDDEN_PARTICIPANT());
      ctx.getActiveAssignment.mockResolvedValue(null);
      return ctx;
    }

    it.each([
      ['editar', (s: TasksAuthorizationService) => s.assertCanEditTask(1, 10, CREADOR_ID)],
      ['asignar', (s: TasksAuthorizationService) => s.assertCanAssignTask(1, 10, CREADOR_ID)],
      ['desasignar', (s: TasksAuthorizationService) => s.assertCanUnassignTask(1, 10, CREADOR_ID)],
      ['eliminar', (s: TasksAuthorizationService) => s.assertCanDeleteTask(1, 10, CREADOR_ID)],
      [
        'cambiar estado',
        (s: TasksAuthorizationService) => s.assertCanChangeTaskState(1, 10, CREADOR_ID),
      ],
      ['leer', (s: TasksAuthorizationService) => s.assertCanReadTask(1, 10, CREADOR_ID)],
      ['comentar', (s: TasksAuthorizationService) => s.assertCanCommentTask(1, 10, CREADOR_ID)],
    ])('%s: el creador de la tarea es rechazado', async (_accion, invocar) => {
      const ctx = makeRejectingContext();
      const service = new TasksAuthorizationService(ctx);

      await expect(invocar(service)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('el objeto de tarea conserva creadaPor sin que intervenga en la decisión', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockResolvedValue(TAREA);
      ctx.getProjectOrThrow.mockResolvedValue(PROYECTO);
      const service = new TasksAuthorizationService(ctx);

      const result = await service.assertCanEditTask(1, 10, LIDER_ID);

      expect(result.creadaPor).toBe(CREADOR_ID);
    });
  });

  describe('traslado del cliente transaccional', () => {
    it('assertCanDeleteTask (acción exclusiva del líder) traslada el mismo tx a todas las llamadas', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockResolvedValue(TAREA);
      ctx.assertProjectLeader.mockResolvedValue(undefined);
      const tx = { marker: 'tx' } as unknown as Prisma.TransactionClient;
      const service = new TasksAuthorizationService(ctx);

      await service.assertCanDeleteTask(1, 10, LIDER_ID, tx);

      expect(ctx.getTaskInProjectOrThrow).toHaveBeenCalledWith(1, 10, tx);
      expect(ctx.assertProjectLeader).toHaveBeenCalledWith(1, LIDER_ID, tx);
    });

    it('assertCanChangeTaskState traslada el mismo tx a todas las llamadas de contexto', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockResolvedValue(TAREA);
      ctx.getProjectOrThrow.mockResolvedValue(PROYECTO);
      ctx.getActiveAssignment.mockResolvedValue({
        idAsignacion: 1,
        idTarea: 10,
        idUsuario: ASIGNADO_ID,
        desasignadaEn: null,
      });
      const tx = { marker: 'tx' } as unknown as Prisma.TransactionClient;
      const service = new TasksAuthorizationService(ctx);

      await service.assertCanChangeTaskState(1, 10, ASIGNADO_ID, tx);

      expect(ctx.getTaskInProjectOrThrow).toHaveBeenCalledWith(1, 10, tx);
      expect(ctx.getProjectOrThrow).toHaveBeenCalledWith(1, tx);
      expect(ctx.getActiveAssignment).toHaveBeenCalledWith(10, tx);
    });

    it('assertCanReadTask traslada el mismo tx a todas las llamadas de contexto', async () => {
      const ctx = makeContext();
      ctx.getTaskInProjectOrThrow.mockResolvedValue(TAREA);
      ctx.assertActiveProjectParticipant.mockResolvedValue(undefined);
      const tx = { marker: 'tx' } as unknown as Prisma.TransactionClient;
      const service = new TasksAuthorizationService(ctx);

      await service.assertCanReadTask(1, 10, PARTICIPANTE_ID, tx);

      expect(ctx.getTaskInProjectOrThrow).toHaveBeenCalledWith(1, 10, tx);
      expect(ctx.assertActiveProjectParticipant).toHaveBeenCalledWith(1, PARTICIPANTE_ID, tx);
    });
  });
});
