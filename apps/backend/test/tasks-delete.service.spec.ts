import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TasksService } from '../src/tasks/tasks.service';

function makeTx() {
  return {
    tarea: { update: vi.fn() },
    asignacionTarea: { updateMany: vi.fn() },
  };
}

function makePrisma(tx = makeTx()) {
  return {
    tx,
    $transaction: vi.fn(async (callback: any) => callback(tx)),
  } as any;
}

function makeAuthorization(overrides: Record<string, unknown> = {}) {
  return {
    assertCanDeleteTask: vi.fn().mockResolvedValue({ idTarea: 42, idProyecto: 5 }),
    ...overrides,
  } as any;
}

function makeNotifications() {
  return { notifyFromTemplate: vi.fn().mockResolvedValue(undefined) } as any;
}

function makeService(opts: { prisma?: any; auth?: any; notifications?: any } = {}) {
  const tx = makeTx();
  const prisma = opts.prisma ?? makePrisma(tx);
  const auth = opts.auth ?? makeAuthorization();
  const relations = { validateRelatedResources: vi.fn(), assertUserAssignableToProject: vi.fn() } as any;
  const notifications = opts.notifications ?? makeNotifications();
  const context = { getActiveAssignment: vi.fn() } as any;
  const service = new TasksService(prisma, auth, relations, notifications, context);
  return { tx: prisma.tx, prisma, auth, relations, notifications, context, service };
}

describe('TasksService.remove', () => {
  describe('autorización', () => {
    it('líder permitido: la operación resuelve sin error', async () => {
      const { service } = makeService();

      await expect(service.remove(5, 42, 1)).resolves.toBeUndefined();
    });

    it('participante no líder rechazado: propaga ForbiddenException, no escribe', async () => {
      const { tx, service } = makeService({
        auth: makeAuthorization({
          assertCanDeleteTask: vi.fn().mockRejectedValue(new ForbiddenException('No eres el líder de este proyecto')),
        }),
      });

      await expect(service.remove(5, 42, 7)).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.asignacionTarea.updateMany).not.toHaveBeenCalled();
      expect(tx.tarea.update).not.toHaveBeenCalled();
    });

    it('asignado activo no líder rechazado', async () => {
      const { tx, service } = makeService({
        auth: makeAuthorization({
          assertCanDeleteTask: vi.fn().mockRejectedValue(new ForbiddenException('No eres el líder de este proyecto')),
        }),
      });

      await expect(service.remove(5, 42, 3)).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.tarea.update).not.toHaveBeenCalled();
    });

    it('creador de la tarea no líder rechazado', async () => {
      const { tx, service } = makeService({
        auth: makeAuthorization({
          assertCanDeleteTask: vi.fn().mockRejectedValue(new ForbiddenException('No eres el líder de este proyecto')),
        }),
      });

      await expect(service.remove(5, 42, 1)).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.tarea.update).not.toHaveBeenCalled();
    });

    it('usuario externo rechazado', async () => {
      const { tx, service } = makeService({
        auth: makeAuthorization({
          assertCanDeleteTask: vi.fn().mockRejectedValue(new ForbiddenException('externo')),
        }),
      });

      await expect(service.remove(5, 42, 999)).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.tarea.update).not.toHaveBeenCalled();
    });

    it('tarea inexistente: propaga NotFoundException', async () => {
      const { tx, service } = makeService({
        auth: makeAuthorization({
          assertCanDeleteTask: vi
            .fn()
            .mockRejectedValue(new NotFoundException('Tarea con id 999 no encontrada en el proyecto 5')),
        }),
      });

      await expect(service.remove(5, 999, 1)).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.tarea.update).not.toHaveBeenCalled();
    });

    it('tarea ya eliminada: propaga NotFoundException', async () => {
      const { tx, service } = makeService({
        auth: makeAuthorization({
          assertCanDeleteTask: vi
            .fn()
            .mockRejectedValue(new NotFoundException('Tarea con id 42 no encontrada en el proyecto 5')),
        }),
      });

      await expect(service.remove(5, 42, 1)).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.tarea.update).not.toHaveBeenCalled();
    });

    it('tarea de otro proyecto: propaga NotFoundException', async () => {
      const { tx, service } = makeService({
        auth: makeAuthorization({
          assertCanDeleteTask: vi
            .fn()
            .mockRejectedValue(new NotFoundException('Tarea con id 42 no encontrada en el proyecto 1')),
        }),
      });

      await expect(service.remove(1, 42, 1)).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.tarea.update).not.toHaveBeenCalled();
    });

    it('proyecto eliminado: propaga NotFoundException', async () => {
      const { tx, service } = makeService({
        auth: makeAuthorization({
          assertCanDeleteTask: vi.fn().mockRejectedValue(new NotFoundException('Proyecto con id 5 no encontrado')),
        }),
      });

      await expect(service.remove(5, 42, 1)).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.tarea.update).not.toHaveBeenCalled();
    });

    it('assertCanDeleteTask recibe projectId, taskId, userId y el mismo tx', async () => {
      const { tx, auth, service } = makeService();

      await service.remove(5, 42, 1);

      expect(auth.assertCanDeleteTask).toHaveBeenCalledWith(5, 42, 1, tx);
    });
  });

  describe('con asignación activa', () => {
    it('cierra exactamente una vez, con el filtro idTarea + desasignadaEn: null', async () => {
      const { tx, service } = makeService();

      await service.remove(5, 42, 1);

      expect(tx.asignacionTarea.updateMany).toHaveBeenCalledTimes(1);
      const arg = tx.asignacionTarea.updateMany.mock.calls[0][0];
      expect(arg.where).toEqual({ idTarea: 42, desasignadaEn: null });
    });

    it('desasignadaEn usa el mismo timestamp que Tarea.eliminadoEn', async () => {
      const { tx, service } = makeService();

      await service.remove(5, 42, 1);

      const desasignadaEn = tx.asignacionTarea.updateMany.mock.calls[0][0].data.desasignadaEn;
      const eliminadoEn = tx.tarea.update.mock.calls[0][0].data.eliminadoEn;
      expect(desasignadaEn).toBeInstanceOf(Date);
      expect(desasignadaEn).toBe(eliminadoEn); // misma referencia de objeto, no dos new Date() distintos
    });

    it('tarea.update se ejecuta después de cerrar la asignación', async () => {
      const orden: string[] = [];
      const { tx, service } = makeService();
      tx.asignacionTarea.updateMany.mockImplementation(async () => {
        orden.push('cerrar_asignacion');
      });
      tx.tarea.update.mockImplementation(async () => {
        orden.push('soft_delete');
      });

      await service.remove(5, 42, 1);

      expect(orden).toEqual(['cerrar_asignacion', 'soft_delete']);
    });

    it('no crea ni elimina ninguna asignación (el tx no expone create/delete/deleteMany)', async () => {
      const { tx, service } = makeService();

      await service.remove(5, 42, 1);

      expect((tx.asignacionTarea as any).create).toBeUndefined();
      expect((tx.asignacionTarea as any).delete).toBeUndefined();
      expect((tx.asignacionTarea as any).deleteMany).toBeUndefined();
      expect((tx.asignacionTarea as any).update).toBeUndefined();
    });
  });

  describe('sin asignación activa', () => {
    it('updateMany con count: 0 no falla; la eliminación se resuelve correctamente', async () => {
      const { tx, service } = makeService();
      tx.asignacionTarea.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.remove(5, 42, 1)).resolves.toBeUndefined();
      expect(tx.tarea.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('filtro de asignaciones históricas', () => {
    it('el where de updateMany nunca omite desasignadaEn: null (no afecta cerradas)', async () => {
      const { tx, service } = makeService();

      await service.remove(5, 42, 1);

      const where = tx.asignacionTarea.updateMany.mock.calls[0][0].where;
      expect(where).toHaveProperty('desasignadaEn', null);
      expect(Object.keys(where).sort()).toEqual(['desasignadaEn', 'idTarea'].sort());
    });
  });

  describe('escritura de la tarea', () => {
    it('data enviada a tarea.update contiene únicamente eliminadoEn', async () => {
      const { tx, service } = makeService();

      await service.remove(5, 42, 1);

      const data = tx.tarea.update.mock.calls[0][0].data;
      expect(Object.keys(data)).toEqual(['eliminadoEn']);
      expect(tx.tarea.update).toHaveBeenCalledWith({ where: { idTarea: 42 }, data: { eliminadoEn: expect.any(Date) } });
    });

    it('abre exactamente una transacción', async () => {
      const { prisma, service } = makeService();

      await service.remove(5, 42, 1);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('no llama a NotificationsService.notifyFromTemplate', async () => {
      const { notifications, service } = makeService();

      await service.remove(5, 42, 1);

      expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    });
  });

  describe('orden transaccional', () => {
    it('respeta: autorización → updateMany de asignación → update de tarea → fin de transacción', async () => {
      const orden: string[] = [];
      const tx = makeTx();
      const prisma = makePrisma(tx);
      const auth = {
        assertCanDeleteTask: vi.fn(async () => {
          orden.push('autorizacion');
          return { idTarea: 42, idProyecto: 5 };
        }),
      } as any;
      tx.asignacionTarea.updateMany.mockImplementation(async () => {
        orden.push('updateMany_asignacion');
      });
      tx.tarea.update.mockImplementation(async () => {
        orden.push('update_tarea');
      });
      const relations = {} as any;
      const notifications = makeNotifications();
      const context = {} as any;
      const service = new TasksService(prisma, auth, relations, notifications, context);

      await service.remove(5, 42, 1);
      orden.push('fin_transaccion');

      expect(orden).toEqual(['autorizacion', 'updateMany_asignacion', 'update_tarea', 'fin_transaccion']);
    });
  });

  describe('fallos y rollback', () => {
    it('autorización fallida: no llama a updateMany ni a update', async () => {
      const { tx, notifications, service } = makeService({
        auth: makeAuthorization({
          assertCanDeleteTask: vi.fn().mockRejectedValue(new ForbiddenException('no autorizado')),
        }),
      });

      await expect(service.remove(5, 42, 1)).rejects.toBeInstanceOf(ForbiddenException);

      expect(tx.asignacionTarea.updateMany).not.toHaveBeenCalled();
      expect(tx.tarea.update).not.toHaveBeenCalled();
      expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    });

    it('fallo al cerrar la asignación: no se actualiza la tarea, no se notifica', async () => {
      const { tx, notifications, service } = makeService();
      tx.asignacionTarea.updateMany.mockRejectedValue(new Error('fallo al cerrar asignación'));

      await expect(service.remove(5, 42, 1)).rejects.toThrow('fallo al cerrar asignación');

      expect(tx.tarea.update).not.toHaveBeenCalled();
      expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    });

    it('fallo al actualizar la tarea: se rechaza toda la operación (rollback lo maneja $transaction)', async () => {
      const { tx, prisma, notifications, service } = makeService();
      tx.tarea.update.mockRejectedValue(new Error('fallo de escritura'));

      await expect(service.remove(5, 42, 1)).rejects.toThrow('fallo de escritura');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    });

    it('ninguna escritura usa PrismaService fuera de tx', async () => {
      const { prisma, tx, service } = makeService();
      tx.tarea.update.mockRejectedValue(new Error('fallo'));

      await expect(service.remove(5, 42, 1)).rejects.toThrow('fallo');

      expect(prisma.tarea).toBeUndefined();
      expect(prisma.asignacionTarea).toBeUndefined();
    });
  });

  describe('ausencia de borrado físico', () => {
    it('el tx usado no expone ningún delegate delete/deleteMany de tarea, asignación, comentario, evidencia o tareaEtiqueta', async () => {
      const { tx, service } = makeService();

      await service.remove(5, 42, 1);

      expect((tx as any).comentario).toBeUndefined();
      expect((tx as any).evidencia).toBeUndefined();
      expect((tx as any).tareaEtiqueta).toBeUndefined();
      expect((tx.tarea as any).delete).toBeUndefined();
      expect((tx.tarea as any).deleteMany).toBeUndefined();
      expect((tx.asignacionTarea as any).delete).toBeUndefined();
      expect((tx.asignacionTarea as any).deleteMany).toBeUndefined();
    });
  });
});
