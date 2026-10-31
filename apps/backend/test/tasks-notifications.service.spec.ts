import { describe, expect, it, vi } from 'vitest';
import { EstadoTarea, TipoNotificacion } from '@prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import type { BulkTaskActionDto } from '../src/tasks/dto/bulk-task-action.dto';
import type { TareaPublica } from '../src/tasks/tasks.mapper';
import { TasksNotificationsService } from '../src/tasks/tasks-notifications.service';

function makeService() {
  const prisma = {
    usuario: { findUnique: vi.fn().mockResolvedValue({ nombre: 'Ana', apellido: 'Lider' }) },
    proyecto: { findUnique: vi.fn().mockResolvedValue({ tituloProyecto: 'Proyecto X' }) },
    participacionProyecto: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const notifications = {
    notifyRoleMembers: vi.fn().mockResolvedValue(undefined),
    notifyUsers: vi.fn().mockResolvedValue(undefined),
    notifyFromTemplate: vi.fn().mockResolvedValue(undefined),
  };
  const service = new TasksNotificationsService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
  );
  return { prisma, notifications, service };
}

const input = {
  tipoNotificacion: TipoNotificacion.TAREA_ACTUALIZADA,
  tituloNotificacion: 't',
  mensajeNotificacion: 'm',
  datosJson: {},
};

function tarea(id: number, extra: Partial<TareaPublica> = {}): TareaPublica {
  return {
    idTarea: id,
    idProyecto: 5,
    idRolProyecto: null,
    tituloTarea: `T${id}`,
    estadoTarea: EstadoTarea.POR_HACER,
    asignacionActiva: null,
    ...extra,
  } as TareaPublica;
}

describe('TasksNotificationsService', () => {
  it('resolveTaskNotificationAudience: el rol gana sobre el asignado; sin ninguno no hay audiencia', () => {
    const { service } = makeService();
    expect(service.resolveTaskNotificationAudience(3, 5, 9)).toEqual({ kind: 'role', projectId: 5, roleId: 3 });
    expect(service.resolveTaskNotificationAudience(null, 5, 9)).toEqual({ kind: 'assignee', userId: 9 });
    expect(service.resolveTaskNotificationAudience(null, 5, null)).toEqual({ kind: 'none' });
  });

  it('notifyTaskAudience: rol -> notifyRoleMembers; asignado -> notifyUsers; none -> nada', async () => {
    const { notifications, service } = makeService();
    await service.notifyTaskAudience({ kind: 'role', projectId: 5, roleId: 3 }, 1, input);
    expect(notifications.notifyRoleMembers).toHaveBeenCalledWith(5, 3, 1, input);

    await service.notifyTaskAudience({ kind: 'assignee', userId: 9 }, 1, input);
    expect(notifications.notifyUsers).toHaveBeenCalledWith([9], input);

    notifications.notifyUsers.mockClear();
    await service.notifyTaskAudience({ kind: 'assignee', userId: 1 }, 1, input);
    await service.notifyTaskAudience({ kind: 'none' }, 1, input);
    expect(notifications.notifyUsers).not.toHaveBeenCalled();
  });

  it('notifyTaskAudience: un fallo se registra y no se relanza', async () => {
    const { notifications, service } = makeService();
    notifications.notifyUsers.mockRejectedValue(new Error('boom'));
    const spy = vi.spyOn(service.logger, 'error').mockImplementation(() => undefined);
    await expect(service.notifyTaskAudience({ kind: 'assignee', userId: 9 }, 1, input)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('notifyAssignment: usa la plantilla TAREA_ASIGNADA con actor y proyecto; omite al actor', async () => {
    const { notifications, service } = makeService();
    await service.notifyAssignment(tarea(8), 1, 9);
    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([9], 'TAREA_ASIGNADA', {
      taskTitle: 'T8',
      projectTitle: 'Proyecto X',
      assignedBy: 'Ana Lider',
      taskId: 8,
      projectId: 5,
    });

    notifications.notifyFromTemplate.mockClear();
    await service.notifyAssignment(tarea(8), 1, 1);
    expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
  });

  it('notifyUnassignment: plantilla TAREA_ACTUALIZADA con unassignedBy', async () => {
    const { notifications, service } = makeService();
    await service.notifyUnassignment(8, 5, 'T8', 1, 9);
    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([9], 'TAREA_ACTUALIZADA', {
      taskTitle: 'T8',
      projectTitle: 'Proyecto X',
      unassignedBy: 'Ana Lider',
      taskId: 8,
      projectId: 5,
    });
  });

  it('notificarAccionMasiva MOVER: un aviso por persona con todas sus tareas, excluyendo al actor', async () => {
    const { prisma, notifications, service } = makeService();
    prisma.participacionProyecto.findMany.mockResolvedValue([
      { idUsuario: 1, idRolProyecto: 3 }, // actor: excluido
      { idUsuario: 20, idRolProyecto: 3 },
    ]);
    const dto = { accion: 'MOVER', idsTareas: [1, 2, 3], estadoTarea: EstadoTarea.HECHO } as BulkTaskActionDto;
    const tareas = [
      tarea(1, { idRolProyecto: 3 }),
      tarea(2, { idRolProyecto: 3 }),
      tarea(3, { asignacionActiva: { idUsuario: 30 } as TareaPublica['asignacionActiva'] }),
    ];

    await service.notificarAccionMasiva(5, 1, dto, tareas, new Map());

    expect(notifications.notifyUsers).toHaveBeenCalledTimes(2);
    expect(notifications.notifyUsers).toHaveBeenCalledWith([20], expect.objectContaining({
      tipoNotificacion: TipoNotificacion.TAREA_ACTUALIZADA,
      tituloNotificacion: 'Tareas movidas',
      mensajeNotificacion: 'Se movieron 2 tareas a Hecho.',
      datosJson: { projectId: 5, accion: 'MOVER', taskIds: [1, 2] },
    }));
    expect(notifications.notifyUsers).toHaveBeenCalledWith([30], expect.objectContaining({
      tituloNotificacion: 'Estado de tarea actualizado',
      datosJson: { projectId: 5, accion: 'MOVER', taskIds: [3], taskId: 3, taskTitle: 'T3' },
    }));
  });

  it('notificarAccionMasiva DESASIGNAR: avisa a quien estaba asignado antes', async () => {
    const { notifications, service } = makeService();
    const dto = { accion: 'DESASIGNAR', idsTareas: [4] } as BulkTaskActionDto;
    await service.notificarAccionMasiva(5, 1, dto, [tarea(4)], new Map([[4, 40]]));
    expect(notifications.notifyUsers).toHaveBeenCalledWith([40], expect.objectContaining({
      tituloNotificacion: 'Asignación retirada',
      mensajeNotificacion: 'Ya no estás asignado a la tarea "T4".',
    }));
  });

  it('notificarAccionMasiva: sin tareas no hace nada', async () => {
    const { notifications, prisma, service } = makeService();
    await service.notificarAccionMasiva(5, 1, { accion: 'MOVER' } as BulkTaskActionDto, [], new Map());
    expect(prisma.participacionProyecto.findMany).not.toHaveBeenCalled();
    expect(notifications.notifyUsers).not.toHaveBeenCalled();
  });
});
