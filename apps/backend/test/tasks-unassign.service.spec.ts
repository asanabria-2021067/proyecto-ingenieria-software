import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { TasksAuthorizationService } from '../src/tasks/tasks-authorization.service';
import type { TasksRelationsService } from '../src/tasks/tasks-relations.service';
import type { TasksContextService } from '../src/tasks/tasks-context.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import { TasksService } from '../src/tasks/tasks.service';
import { NOTIFICATION_TEMPLATES } from '../src/notifications/templates/notification.templates';

function makeTx() {
  return {
    asignacionTarea: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
}

function makePrisma(tx = makeTx()) {
  const prisma = {
    tx,
    $transaction: vi.fn(),
    usuario: { findUnique: vi.fn().mockResolvedValue({ nombre: 'Carlos', apellido: 'Mendoza' }) },
    proyecto: { findUnique: vi.fn().mockResolvedValue({ tituloProyecto: 'Portal de Empleo UVG' }) },
  };
  prisma.$transaction.mockImplementation(async (callback: (tx: ReturnType<typeof makeTx>) => unknown) => callback(tx));
  return prisma as typeof prisma & PrismaService;
}

function makeAuthorization(overrides: Record<string, unknown> = {}) {
  const authorization = {
    assertCanUnassignTask: vi
      .fn()
      .mockResolvedValue({ idTarea: 42, idProyecto: 5, tituloTarea: 'Tarea original' }),
    ...overrides,
  };
  return authorization as typeof authorization & TasksAuthorizationService;
}

function makeContext(overrides: Record<string, unknown> = {}) {
  const context = {
    getActiveAssignment: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
  return context as typeof context & TasksContextService;
}

function makeRelations() {
  const relations = { assertUserAssignableToProject: vi.fn(), validateRelatedResources: vi.fn() };
  return relations as typeof relations & TasksRelationsService;
}

function makeNotifications() {
  const notifications = { notifyFromTemplate: vi.fn().mockResolvedValue(undefined) };
  return notifications as typeof notifications & NotificationsService;
}

function asignacionActivaFixture(overrides: Record<string, unknown> = {}) {
  return {
    idAsignacion: 9,
    idTarea: 42,
    idUsuario: 3,
    asignadoPor: 1,
    fechaAsignacion: new Date('2026-01-05T00:00:00.000Z'),
    desasignadaEn: null,
    ...overrides,
  };
}

function makeService(opts: {
  prisma?: ReturnType<typeof makePrisma>;
  auth?: ReturnType<typeof makeAuthorization>;
  notifications?: ReturnType<typeof makeNotifications>;
  context?: ReturnType<typeof makeContext>;
} = {}) {
  const tx = makeTx();
  const prisma = opts.prisma ?? makePrisma(tx);
  const auth = opts.auth ?? makeAuthorization();
  const relations = makeRelations();
  const notifications = opts.notifications ?? makeNotifications();
  const context = opts.context ?? makeContext();
  const service = new TasksService(prisma, auth, relations, notifications, context);
  return { tx: prisma.tx, prisma, auth, relations, notifications, context, service };
}

describe('TasksService.unassign', () => {
  describe('autorización', () => {
    it('líder permitido: la operación resuelve sin error', async () => {
      const { service } = makeService();

      await expect(service.unassign(5, 42, 1)).resolves.toBeUndefined();
    });

    it('participante no líder rechazado: propaga ForbiddenException, no escribe', async () => {
      const { tx, service } = makeService({
        auth: makeAuthorization({
          assertCanUnassignTask: vi.fn().mockRejectedValue(new ForbiddenException('No eres el líder de este proyecto')),
        }),
      });

      await expect(service.unassign(5, 42, 7)).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.asignacionTarea.updateMany).not.toHaveBeenCalled();
    });

    it('asignado activo no líder rechazado', async () => {
      const { tx, service } = makeService({
        auth: makeAuthorization({
          assertCanUnassignTask: vi.fn().mockRejectedValue(new ForbiddenException('No eres el líder de este proyecto')),
        }),
      });

      await expect(service.unassign(5, 42, 3)).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.asignacionTarea.updateMany).not.toHaveBeenCalled();
    });

    it('creador de la tarea no líder rechazado', async () => {
      const { tx, service } = makeService({
        auth: makeAuthorization({
          assertCanUnassignTask: vi.fn().mockRejectedValue(new ForbiddenException('No eres el líder de este proyecto')),
        }),
      });

      await expect(service.unassign(5, 42, 1)).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.asignacionTarea.updateMany).not.toHaveBeenCalled();
    });

    it('usuario externo rechazado', async () => {
      const { tx, service } = makeService({
        auth: makeAuthorization({
          assertCanUnassignTask: vi.fn().mockRejectedValue(new ForbiddenException('externo')),
        }),
      });

      await expect(service.unassign(5, 42, 999)).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.asignacionTarea.updateMany).not.toHaveBeenCalled();
    });

    it('tarea inexistente: propaga NotFoundException', async () => {
      const { tx, service } = makeService({
        auth: makeAuthorization({
          assertCanUnassignTask: vi
            .fn()
            .mockRejectedValue(new NotFoundException('Tarea con id 999 no encontrada en el proyecto 5')),
        }),
      });

      await expect(service.unassign(5, 999, 1)).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.asignacionTarea.updateMany).not.toHaveBeenCalled();
    });

    it('tarea eliminada: propaga NotFoundException', async () => {
      const { tx, service } = makeService({
        auth: makeAuthorization({
          assertCanUnassignTask: vi
            .fn()
            .mockRejectedValue(new NotFoundException('Tarea con id 42 no encontrada en el proyecto 5')),
        }),
      });

      await expect(service.unassign(5, 42, 1)).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.asignacionTarea.updateMany).not.toHaveBeenCalled();
    });

    it('tarea de otro proyecto: propaga NotFoundException', async () => {
      const { tx, service } = makeService({
        auth: makeAuthorization({
          assertCanUnassignTask: vi
            .fn()
            .mockRejectedValue(new NotFoundException('Tarea con id 42 no encontrada en el proyecto 1')),
        }),
      });

      await expect(service.unassign(1, 42, 1)).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.asignacionTarea.updateMany).not.toHaveBeenCalled();
    });

    it('proyecto eliminado: propaga NotFoundException', async () => {
      const { tx, service } = makeService({
        auth: makeAuthorization({
          assertCanUnassignTask: vi.fn().mockRejectedValue(new NotFoundException('Proyecto con id 5 no encontrado')),
        }),
      });

      await expect(service.unassign(5, 42, 1)).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.asignacionTarea.updateMany).not.toHaveBeenCalled();
    });

    it('assertCanUnassignTask recibe projectId, taskId, userId y el mismo tx', async () => {
      const { tx, auth, service } = makeService();

      await service.unassign(5, 42, 1);

      expect(auth.assertCanUnassignTask).toHaveBeenCalledWith(5, 42, 1, tx);
    });
  });

  describe('con asignación activa', () => {
    it('consulta getActiveAssignment con el mismo tx', async () => {
      const { tx, context, service } = makeService({
        context: makeContext({ getActiveAssignment: vi.fn().mockResolvedValue(asignacionActivaFixture()) }),
      });

      await service.unassign(5, 42, 1);

      expect(context.getActiveAssignment).toHaveBeenCalledWith(42, tx);
    });

    it('llama updateMany exactamente una vez', async () => {
      const { tx, service } = makeService({
        context: makeContext({ getActiveAssignment: vi.fn().mockResolvedValue(asignacionActivaFixture()) }),
      });

      await service.unassign(5, 42, 1);

      expect(tx.asignacionTarea.updateMany).toHaveBeenCalledTimes(1);
    });

    it('el filtro incluye idAsignacion, idTarea, idUsuario y desasignadaEn: null', async () => {
      const { tx, service } = makeService({
        context: makeContext({ getActiveAssignment: vi.fn().mockResolvedValue(asignacionActivaFixture()) }),
      });

      await service.unassign(5, 42, 1);

      expect(tx.asignacionTarea.updateMany).toHaveBeenCalledWith({
        where: { idAsignacion: 9, idTarea: 42, idUsuario: 3, desasignadaEn: null },
        data: { desasignadaEn: expect.any(Date) },
      });
    });

    it('data contiene únicamente desasignadaEn', async () => {
      const { tx, service } = makeService({
        context: makeContext({ getActiveAssignment: vi.fn().mockResolvedValue(asignacionActivaFixture()) }),
      });

      await service.unassign(5, 42, 1);

      const data = tx.asignacionTarea.updateMany.mock.calls[0][0].data;
      expect(Object.keys(data)).toEqual(['desasignadaEn']);
    });

    it('count: 1 → notifica después del commit al usuario anterior', async () => {
      const { notifications, service } = makeService({
        context: makeContext({ getActiveAssignment: vi.fn().mockResolvedValue(asignacionActivaFixture({ idUsuario: 3 })) }),
      });

      await service.unassign(5, 42, 1);

      expect(notifications.notifyFromTemplate).toHaveBeenCalledTimes(1);
      expect(notifications.notifyFromTemplate).toHaveBeenCalledWith(
        [3],
        'TAREA_ACTUALIZADA',
        expect.objectContaining({ taskId: 42, projectId: 5, taskTitle: 'Tarea original' }),
      );
    });

    it('la respuesta final es void', async () => {
      const { service } = makeService({
        context: makeContext({ getActiveAssignment: vi.fn().mockResolvedValue(asignacionActivaFixture()) }),
      });

      await expect(service.unassign(5, 42, 1)).resolves.toBeUndefined();
    });
  });

  describe('sin asignación activa', () => {
    it('responde correctamente (resuelve sin error)', async () => {
      const { service } = makeService();

      await expect(service.unassign(5, 42, 1)).resolves.toBeUndefined();
    });

    it('no ejecuta updateMany', async () => {
      const { tx, service } = makeService();

      await service.unassign(5, 42, 1);

      expect(tx.asignacionTarea.updateMany).not.toHaveBeenCalled();
    });

    it('no notifica', async () => {
      const { notifications, service } = makeService();

      await service.unassign(5, 42, 1);

      expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    });

    it('no consulta datos auxiliares para la notificación (usuario/proyecto)', async () => {
      const { prisma, service } = makeService();

      await service.unassign(5, 42, 1);

      expect(prisma.usuario.findUnique).not.toHaveBeenCalled();
      expect(prisma.proyecto.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('solicitud repetida', () => {
    it('primera llamada encuentra asignación (count:1), segunda encuentra null: una sola escritura y una sola notificación', async () => {
      const getActiveAssignment = vi
        .fn()
        .mockResolvedValueOnce(asignacionActivaFixture())
        .mockResolvedValueOnce(null);
      const { tx, notifications, service } = makeService({
        context: makeContext({ getActiveAssignment }),
      });

      await expect(service.unassign(5, 42, 1)).resolves.toBeUndefined();
      await expect(service.unassign(5, 42, 1)).resolves.toBeUndefined();

      expect(tx.asignacionTarea.updateMany).toHaveBeenCalledTimes(1);
      expect(notifications.notifyFromTemplate).toHaveBeenCalledTimes(1);
    });
  });

  describe('carrera idempotente (updateMany.count === 0)', () => {
    it('no lanza error, no notifica, no ejecuta otra actualización, responde éxito', async () => {
      const tx = makeTx();
      tx.asignacionTarea.updateMany.mockResolvedValue({ count: 0 });
      const prisma = makePrisma(tx);
      const { notifications, service } = makeService({
        prisma,
        context: makeContext({ getActiveAssignment: vi.fn().mockResolvedValue(asignacionActivaFixture()) }),
      });

      await expect(service.unassign(5, 42, 1)).resolves.toBeUndefined();

      expect(tx.asignacionTarea.updateMany).toHaveBeenCalledTimes(1);
      expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    });
  });

  describe('historial', () => {
    it('nunca llama create/delete/deleteMany sobre AsignacionTarea', async () => {
      const { tx, service } = makeService({
        context: makeContext({ getActiveAssignment: vi.fn().mockResolvedValue(asignacionActivaFixture()) }),
      });

      await service.unassign(5, 42, 1);

      expect((tx.asignacionTarea as unknown as Record<string, unknown>).create).toBeUndefined();
      expect((tx.asignacionTarea as unknown as Record<string, unknown>).delete).toBeUndefined();
      expect((tx.asignacionTarea as unknown as Record<string, unknown>).deleteMany).toBeUndefined();
      expect((tx.asignacionTarea as unknown as Record<string, unknown>).update).toBeUndefined();
    });

    it('no se actualizan idUsuario, asignadoPor ni fechaAsignacion (data solo trae desasignadaEn)', async () => {
      const { tx, service } = makeService({
        context: makeContext({ getActiveAssignment: vi.fn().mockResolvedValue(asignacionActivaFixture()) }),
      });

      await service.unassign(5, 42, 1);

      const data = tx.asignacionTarea.updateMany.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('idUsuario');
      expect(data).not.toHaveProperty('asignadoPor');
      expect(data).not.toHaveProperty('fechaAsignacion');
    });

    it('no toca Tarea (no hay tx.tarea en absoluto)', async () => {
      const { tx, service } = makeService({
        context: makeContext({ getActiveAssignment: vi.fn().mockResolvedValue(asignacionActivaFixture()) }),
      });

      await service.unassign(5, 42, 1);

      expect((tx as unknown as Record<string, unknown>).tarea).toBeUndefined();
    });
  });

  describe('orden', () => {
    it('respeta: autorización → asignación activa → updateMany → fin de transacción → notificación', async () => {
      const orden: string[] = [];
      const tx = makeTx();
      const prisma = makePrisma(tx);
      prisma.$transaction = vi.fn(async (callback: (tx: ReturnType<typeof makeTx>) => unknown) => {
        const result = await callback(tx);
        orden.push('fin_transaccion');
        return result;
      }) as typeof prisma.$transaction;
      const authLiteral = {
        assertCanUnassignTask: vi.fn(async () => {
          orden.push('autorizacion');
          return { idTarea: 42, idProyecto: 5, tituloTarea: 'Tarea original' };
        }),
      };
      const auth = authLiteral as typeof authLiteral & TasksAuthorizationService;
      const contextLiteral = {
        getActiveAssignment: vi.fn(async () => {
          orden.push('asignacion_activa');
          return asignacionActivaFixture();
        }),
      };
      const context = contextLiteral as typeof contextLiteral & TasksContextService;
      tx.asignacionTarea.updateMany.mockImplementation(async () => {
        orden.push('updateMany');
        return { count: 1 };
      });
      const notificationsLiteral = {
        notifyFromTemplate: vi.fn(async () => {
          orden.push('notificacion');
        }),
      };
      const notifications = notificationsLiteral as typeof notificationsLiteral & NotificationsService;
      const relations = makeRelations();
      const service = new TasksService(prisma, auth, relations, notifications, context);

      await service.unassign(5, 42, 1);

      expect(orden).toEqual([
        'autorizacion',
        'asignacion_activa',
        'updateMany',
        'fin_transaccion',
        'notificacion',
      ]);
    });
  });

  describe('fallos', () => {
    it('fallo de autorización: rechaza, no notifica', async () => {
      const { notifications, service } = makeService({
        auth: makeAuthorization({
          assertCanUnassignTask: vi.fn().mockRejectedValue(new ForbiddenException('no autorizado')),
        }),
      });

      await expect(service.unassign(5, 42, 1)).rejects.toBeInstanceOf(ForbiddenException);
      expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    });

    it('fallo al consultar la asignación activa: rechaza, no escribe, no notifica', async () => {
      const { tx, notifications, service } = makeService({
        context: makeContext({ getActiveAssignment: vi.fn().mockRejectedValue(new Error('fallo consulta')) }),
      });

      await expect(service.unassign(5, 42, 1)).rejects.toThrow('fallo consulta');
      expect(tx.asignacionTarea.updateMany).not.toHaveBeenCalled();
      expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    });

    it('fallo de updateMany: rechaza, no notifica, la asignación permanece activa (no hay compensación)', async () => {
      const tx = makeTx();
      tx.asignacionTarea.updateMany.mockRejectedValue(new Error('fallo updateMany'));
      const prisma = makePrisma(tx);
      const { notifications, service } = makeService({
        prisma,
        context: makeContext({ getActiveAssignment: vi.fn().mockResolvedValue(asignacionActivaFixture()) }),
      });

      await expect(service.unassign(5, 42, 1)).rejects.toThrow('fallo updateMany');
      expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    });

    it('fallo de notificación: no rechaza, responde éxito, se registra con Logger, no se relanza', async () => {
      const notificationsLiteral = { notifyFromTemplate: vi.fn().mockRejectedValue(new Error('gateway caído')) };
      const { service } = makeService({
        context: makeContext({ getActiveAssignment: vi.fn().mockResolvedValue(asignacionActivaFixture()) }),
        notifications: notificationsLiteral as typeof notificationsLiteral & NotificationsService,
      });
      const loggerSpy = vi
        .spyOn((service as unknown as { logger: { error: (...args: unknown[]) => void } }).logger, 'error')
        .mockImplementation(() => undefined);

      await expect(service.unassign(5, 42, 1)).resolves.toBeUndefined();
      expect(loggerSpy).toHaveBeenCalledTimes(1);
    });

    it('ninguna escritura usa PrismaService fuera de tx (asignacionTarea no existe en el nivel externo)', async () => {
      const tx = makeTx();
      tx.asignacionTarea.updateMany.mockRejectedValue(new Error('fallo'));
      const prisma = makePrisma(tx);
      const { service } = makeService({
        prisma,
        context: makeContext({ getActiveAssignment: vi.fn().mockResolvedValue(asignacionActivaFixture()) }),
      });

      await expect(service.unassign(5, 42, 1)).rejects.toThrow('fallo');

      expect(prisma.asignacionTarea).toBeUndefined();
      expect(prisma.tarea).toBeUndefined();
    });
  });

  describe('plantilla de notificación TAREA_ACTUALIZADA', () => {
    it('reutiliza el enum existente y produce título/mensaje coherentes', () => {
      const data = {
        taskTitle: 'Optimizar consultas',
        projectTitle: 'Portal de Empleo UVG',
        unassignedBy: 'Carlos Mendoza',
        taskId: 8,
        projectId: 5,
      };

      const template = NOTIFICATION_TEMPLATES.TAREA_ACTUALIZADA;
      expect(template.title).toBe('Ya no estás asignado a esta tarea');
      expect(template.message(data)).toBe(
        'Carlos Mendoza te quitó la asignación de la tarea "Optimizar consultas" en el proyecto "Portal de Empleo UVG".',
      );
    });

    it('el payload de notifyFromTemplate incluye todas las variables requeridas por la plantilla', async () => {
      const { notifications, service } = makeService({
        context: makeContext({ getActiveAssignment: vi.fn().mockResolvedValue(asignacionActivaFixture({ idUsuario: 3 })) }),
      });

      await service.unassign(5, 42, 1);

      const payload = notifications.notifyFromTemplate.mock.calls[0][2];
      expect(Object.keys(payload).sort()).toEqual(
        ['taskTitle', 'projectTitle', 'unassignedBy', 'taskId', 'projectId'].sort(),
      );
      expect(payload.unassignedBy).toBe('Carlos Mendoza');
      expect(payload.projectTitle).toBe('Portal de Empleo UVG');
    });
  });
});
