import { makeTimeRecordsDouble } from './helpers/time-records.fixture';
import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { EstadoTarea, TipoNotificacion } from '@prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { TasksAuthorizationService } from '../src/tasks/tasks-authorization.service';
import type { TasksRelationsService } from '../src/tasks/tasks-relations.service';
import type { TasksContextService } from '../src/tasks/tasks-context.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import type { BitacoraEventosService } from '../src/bitacora/bitacora-eventos.service';
import type { BulkTaskActionDto } from '../src/tasks/dto/bulk-task-action.dto';
import { TasksService } from '../src/tasks/tasks.service';
import { ProjectTransactionService } from '../src/common/project-policy/project-transaction.service';
import { makeProjectPolicyDouble, makeProjectReadPolicyDouble, withProjectLock } from './helpers/project-policy.double';

const PROYECTO = 5;
const LIDER = 1;

interface TareaBase {
  idTarea: number;
  idSprint?: number | null;
  idHito?: number | null;
  idRolProyecto?: number | null;
  tituloTarea?: string;
  estadoTarea?: EstadoTarea;
  asignado?: { idUsuario: number; nombre: string; apellido: string } | null;
}

/** Fila mínima que la acción masiva lee antes de escribir. */
function minima(t: TareaBase) {
  return {
    idTarea: t.idTarea,
    idSprint: t.idSprint ?? 3,
    idHito: t.idHito ?? null,
    idRolProyecto: t.idRolProyecto ?? null,
    tituloTarea: t.tituloTarea ?? `Tarea ${t.idTarea}`,
    estadoTarea: t.estadoTarea ?? EstadoTarea.POR_HACER,
  };
}

/** Fila completa (TASK_SELECT) que se relee al final de la transacción. */
function completa(t: TareaBase) {
  return {
    ...minima(t),
    idProyecto: PROYECTO,
    descripcionTarea: null,
    prioridad: 'MEDIA',
    creadaPor: LIDER,
    fechaCreacion: new Date('2026-01-01T00:00:00.000Z'),
    fechaLimite: null,
    actualizadaEn: null,
    tiempoEstimadoHoras: null,
    puntosHistoria: null,
    hito: null,
    rolProyecto: t.idRolProyecto ? { idRolProyecto: t.idRolProyecto, nombreRol: 'Backend' } : null,
    asignaciones: t.asignado
      ? [
          {
            idAsignacion: 900 + t.idTarea,
            idUsuario: t.asignado.idUsuario,
            fechaAsignacion: new Date('2026-01-02T00:00:00.000Z'),
            usuario: { ...t.asignado, fotoUrl: null },
          },
        ]
      : [],
    etiquetas: [],
    _count: { comentarios: 0 },
  };
}

function makeService(opts: { antes: TareaBase[]; despues?: TareaBase[] }) {
  const tx = withProjectLock(
    {
      tarea: {
        // Tres lecturas distintas: la mínima (select con idSprint), la del
        // Hito en syncHitoEstado (where.idHito) y la relectura final.
        findMany: vi.fn(async (args: { select?: Record<string, unknown>; where?: Record<string, unknown> }) => {
          if (args.select && 'idSprint' in args.select) return opts.antes.map(minima);
          if (args.where && 'idHito' in args.where) return [{ estadoTarea: EstadoTarea.HECHO }];
          return (opts.despues ?? opts.antes).map(completa);
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      asignacionTarea: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({}),
      },
      tareaEtiqueta: {
        findMany: vi.fn().mockResolvedValue([]),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      hito: { update: vi.fn() },
    },
    { idProyecto: PROYECTO, creadoPor: LIDER },
  );
  const prisma = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    participacionProyecto: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const context = {
    assertProjectLeader: vi.fn().mockResolvedValue(undefined),
    getActiveAssignment: vi.fn().mockResolvedValue(null),
  };
  const relations = {
    assertUserAssignableToProject: vi.fn().mockResolvedValue(77),
    validateRelatedResources: vi.fn().mockResolvedValue({}),
  };
  const notifications = { notifyUsers: vi.fn().mockResolvedValue(undefined) };
  const policy = makeProjectPolicyDouble();
  const timeRecords = makeTimeRecordsDouble();
  const bitacora = { registrarEvento: vi.fn().mockResolvedValue(undefined) };
  const events = { emit: vi.fn() };

  const service = new TasksService(
    prisma as unknown as PrismaService,
    {} as TasksAuthorizationService,
    relations as unknown as TasksRelationsService,
    notifications as unknown as NotificationsService,
    context as unknown as TasksContextService,
    new ProjectTransactionService(prisma as unknown as PrismaService),
    policy,
    makeProjectReadPolicyDouble(),
    timeRecords,
    bitacora as unknown as BitacoraEventosService,
    events as never,
  );
  return { service, tx, prisma, context, relations, notifications, policy, timeRecords, bitacora, events };
}

function dto(valor: Partial<BulkTaskActionDto>): BulkTaskActionDto {
  return valor as BulkTaskActionDto;
}

describe('TasksService.bulkAction (HU-202/T-383)', () => {
  describe('permisos y validación', () => {
    it('solo el líder: si no lo es, propaga 403 y no escribe ni notifica', async () => {
      const { service, context, tx, notifications } = makeService({ antes: [{ idTarea: 1 }] });
      context.assertProjectLeader.mockRejectedValue(new ForbiddenException('No eres el líder de este proyecto'));

      await expect(
        service.bulkAction(PROYECTO, 8, dto({ idsTareas: [1], accion: 'MOVER', estadoTarea: EstadoTarea.HECHO })),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(context.assertProjectLeader).toHaveBeenCalledWith(PROYECTO, 8, tx);
      expect(tx.tarea.updateMany).not.toHaveBeenCalled();
      expect(notifications.notifyUsers).not.toHaveBeenCalled();
    });

    it('una tarea inexistente o de otro proyecto: 404 con sus ids y nada se escribe', async () => {
      const { service, tx } = makeService({ antes: [{ idTarea: 1 }] });

      const error = await service
        .bulkAction(PROYECTO, LIDER, dto({ idsTareas: [1, 2, 3], accion: 'MOVER', estadoTarea: EstadoTarea.HECHO }))
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as Error).message).toContain('2, 3');
      expect(tx.tarea.updateMany).not.toHaveBeenCalled();
    });

    it('exige la política del proyecto una vez, con la familia de cada acción, y la del Sprint por grupo', async () => {
      const mover = makeService({ antes: [{ idTarea: 1, idSprint: 3 }, { idTarea: 2, idSprint: 3 }, { idTarea: 3, idSprint: 4 }] });
      await mover.service.bulkAction(PROYECTO, LIDER, dto({ idsTareas: [1, 2, 3], accion: 'MOVER', estadoTarea: EstadoTarea.HECHO }));
      expect(mover.policy.assertWriteTx).toHaveBeenCalledOnce();
      expect(mover.policy.assertWriteTx).toHaveBeenCalledWith(mover.tx, expect.anything(), 'TAREA_WRITE', LIDER);
      expect(mover.policy.assertEntitySprintTx).toHaveBeenCalledTimes(2);
      expect(mover.policy.assertEntitySprintTx).toHaveBeenCalledWith(mover.tx, 3, 'ACTIVO');
      expect(mover.policy.assertEntitySprintTx).toHaveBeenCalledWith(mover.tx, 4, 'ACTIVO');

      const asignar = makeService({ antes: [{ idTarea: 1 }] });
      await asignar.service.bulkAction(PROYECTO, LIDER, dto({ idsTareas: [1], accion: 'DESASIGNAR' }));
      expect(asignar.policy.assertWriteTx).toHaveBeenCalledWith(asignar.tx, expect.anything(), 'TAREA_ASIGNACION', LIDER);
    });

    it('un proyecto que no admite escritura rechaza toda la operación antes de escribir', async () => {
      const { service, policy, tx } = makeService({ antes: [{ idTarea: 1 }] });
      policy.assertWriteTx.mockRejectedValue(new HttpException('Proyecto en cierre', 409));

      await expect(
        service.bulkAction(PROYECTO, LIDER, dto({ idsTareas: [1], accion: 'MOVER', estadoTarea: EstadoTarea.HECHO })),
      ).rejects.toBeInstanceOf(HttpException);
      expect(tx.tarea.updateMany).not.toHaveBeenCalled();
    });

    it('tareas de un Sprint ya no ACTIVO: 409 que nombra esas tareas y nada se escribe', async () => {
      const { service, policy, tx } = makeService({
        antes: [
          { idTarea: 1, idSprint: 3, tituloTarea: 'Vigente' },
          { idTarea: 2, idSprint: 2, tituloTarea: 'Vieja A' },
          { idTarea: 3, idSprint: 2, tituloTarea: 'Vieja B' },
        ],
      });
      policy.assertEntitySprintTx.mockImplementation(async (_tx: unknown, sprintId: number) => {
        if (sprintId === 2) throw new HttpException('La tarea pertenece a un Sprint que no está activo', 409);
      });

      const error = await service
        .bulkAction(PROYECTO, LIDER, dto({ idsTareas: [1, 2, 3], accion: 'MOVER', estadoTarea: EstadoTarea.HECHO }))
        .catch((e: unknown) => e);

      expect((error as HttpException).getStatus()).toBe(409);
      expect((error as HttpException).message).toBe(
        'Tareas "Vieja A", "Vieja B": La tarea pertenece a un Sprint que no está activo',
      );
      expect(tx.tarea.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('MOVER', () => {
    it('solo reescribe las que cambian, resincroniza el Hito y registra bitácora por tarea', async () => {
      const { service, tx, bitacora, events } = makeService({
        antes: [
          { idTarea: 1, estadoTarea: EstadoTarea.POR_HACER, idHito: 40 },
          { idTarea: 2, estadoTarea: EstadoTarea.HECHO },
          { idTarea: 3, estadoTarea: EstadoTarea.EN_REVISION, idHito: 40 },
        ],
      });

      const resultado = await service.bulkAction(
        PROYECTO,
        LIDER,
        dto({ idsTareas: [1, 2, 3], accion: 'MOVER', estadoTarea: EstadoTarea.HECHO }),
      );

      expect(tx.tarea.updateMany).toHaveBeenCalledOnce();
      expect(tx.tarea.updateMany).toHaveBeenCalledWith({
        where: { idTarea: { in: [1, 3] }, idProyecto: PROYECTO },
        data: { estadoTarea: EstadoTarea.HECHO },
      });
      expect(tx.hito.update).toHaveBeenCalledOnce();
      expect(bitacora.registrarEvento).toHaveBeenCalledTimes(2);
      expect(bitacora.registrarEvento).toHaveBeenCalledWith(
        expect.objectContaining({
          tipoEvento: 'TASK_STATUS_CHANGED',
          idEntidad: 1,
          valorAnterior: { estadoTarea: EstadoTarea.POR_HACER },
          valorNuevo: { estadoTarea: EstadoTarea.HECHO },
        }),
      );
      expect(events.emit).toHaveBeenCalledTimes(2);
      expect(resultado.idsActualizadas).toEqual([1, 3]);
      expect(resultado.tareas).toHaveLength(3);
    });

    it('si ninguna cambia, no escribe ni notifica', async () => {
      const { service, tx, notifications } = makeService({ antes: [{ idTarea: 1, estadoTarea: EstadoTarea.HECHO }] });

      const resultado = await service.bulkAction(
        PROYECTO,
        LIDER,
        dto({ idsTareas: [1], accion: 'MOVER', estadoTarea: EstadoTarea.HECHO }),
      );

      expect(tx.tarea.updateMany).not.toHaveBeenCalled();
      expect(notifications.notifyUsers).not.toHaveBeenCalled();
      expect(resultado.idsActualizadas).toEqual([]);
    });
  });

  describe('ASIGNAR', () => {
    it('valida al candidato contra el rol de cada tarea, cierra el tramo anterior y abre uno nuevo', async () => {
      const { service, tx, context, relations, timeRecords, bitacora } = makeService({
        antes: [{ idTarea: 1, idRolProyecto: 6 }, { idTarea: 2 }, { idTarea: 3 }],
      });
      context.getActiveAssignment.mockImplementation(async (idTarea: number) => {
        if (idTarea === 2) return { idAsignacion: 50, idUsuario: 11 };
        if (idTarea === 3) return { idAsignacion: 51, idUsuario: 20 }; // ya es el candidato: idempotente
        return null;
      });

      const resultado = await service.bulkAction(PROYECTO, LIDER, dto({ idsTareas: [1, 2, 3], accion: 'ASIGNAR', idUsuario: 20 }));

      expect(relations.assertUserAssignableToProject).toHaveBeenCalledWith(PROYECTO, 20, 6, tx, { nuevaAsignacion: true, actorId: LIDER });
      expect(relations.assertUserAssignableToProject).toHaveBeenCalledWith(PROYECTO, 20, null, tx, { nuevaAsignacion: true, actorId: LIDER });
      expect(timeRecords.recalculateAssignment).toHaveBeenCalledWith(tx, 50);
      expect(tx.asignacionTarea.updateMany).toHaveBeenCalledOnce();
      expect(tx.asignacionTarea.create).toHaveBeenCalledTimes(2);
      expect(bitacora.registrarEvento).toHaveBeenCalledWith(expect.objectContaining({ tipoEvento: 'TASK_ASSIGNED', idEntidad: 1 }));
      expect(bitacora.registrarEvento).toHaveBeenCalledWith(expect.objectContaining({ tipoEvento: 'TASK_REASSIGNED', idEntidad: 2 }));
      expect(resultado.idsActualizadas).toEqual([1, 2]);
    });

    it('todo o nada: si una tarea no admite al integrante, se rechaza con su título y no se notifica', async () => {
      const { service, relations, notifications } = makeService({
        antes: [{ idTarea: 1 }, { idTarea: 2, tituloTarea: 'Diseñar API', idRolProyecto: 9 }],
      });
      relations.assertUserAssignableToProject.mockImplementation(async (_p: number, _u: number, rol: number | null) => {
        if (rol === 9) throw new BadRequestException('El usuario no tiene una participación activa en el rol de la tarea');
        return 77;
      });

      const error = await service
        .bulkAction(PROYECTO, LIDER, dto({ idsTareas: [1, 2], accion: 'ASIGNAR', idUsuario: 20 }))
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(400);
      expect((error as HttpException).message).toBe(
        'Tarea "Diseñar API": El usuario no tiene una participación activa en el rol de la tarea',
      );
      expect(notifications.notifyUsers).not.toHaveBeenCalled();
    });
  });

  describe('DESASIGNAR', () => {
    it('cierra solo las asignaciones activas y avisa una sola vez a cada asignado anterior', async () => {
      const { service, tx, context, timeRecords, notifications } = makeService({
        antes: [{ idTarea: 1 }, { idTarea: 2 }, { idTarea: 3 }],
      });
      context.getActiveAssignment.mockImplementation(async (idTarea: number) =>
        idTarea === 3 ? null : { idAsignacion: 60 + idTarea, idUsuario: 30 },
      );

      const resultado = await service.bulkAction(PROYECTO, LIDER, dto({ idsTareas: [1, 2, 3], accion: 'DESASIGNAR' }));

      expect(timeRecords.recalculateAssignment).toHaveBeenCalledTimes(2);
      expect(tx.asignacionTarea.updateMany).toHaveBeenCalledTimes(2);
      expect(resultado.idsActualizadas).toEqual([1, 2]);
      expect(notifications.notifyUsers).toHaveBeenCalledOnce();
      expect(notifications.notifyUsers).toHaveBeenCalledWith([30], {
        tipoNotificacion: TipoNotificacion.TAREA_ACTUALIZADA,
        tituloNotificacion: 'Asignación retirada',
        mensajeNotificacion: 'Ya no estás asignado a 2 tareas.',
        datosJson: { projectId: PROYECTO, accion: 'DESASIGNAR', taskIds: [1, 2] },
      });
    });
  });

  describe('etiquetas', () => {
    it('AGREGAR conserva las existentes y solo crea las que faltan', async () => {
      const { service, tx, relations, bitacora } = makeService({ antes: [{ idTarea: 1 }, { idTarea: 2 }] });
      tx.tareaEtiqueta.findMany.mockResolvedValue([
        { idTarea: 1, idEtiqueta: 7 },
        { idTarea: 2, idEtiqueta: 7 },
        { idTarea: 2, idEtiqueta: 8 },
      ]);

      const resultado = await service.bulkAction(
        PROYECTO,
        LIDER,
        dto({ idsTareas: [1, 2], accion: 'AGREGAR_ETIQUETAS', idsEtiquetas: [8] }),
      );

      expect(relations.validateRelatedResources).toHaveBeenCalledWith(PROYECTO, { idsEtiquetas: [8] }, tx);
      expect(tx.tareaEtiqueta.createMany).toHaveBeenCalledWith({ data: [{ idTarea: 1, idEtiqueta: 8 }], skipDuplicates: true });
      expect(tx.tareaEtiqueta.deleteMany).not.toHaveBeenCalled();
      expect(bitacora.registrarEvento).toHaveBeenCalledWith(
        expect.objectContaining({ idEntidad: 1, valorAnterior: { idsEtiquetas: [7] }, valorNuevo: { idsEtiquetas: [7, 8] } }),
      );
      expect(resultado.idsActualizadas).toEqual([1]);
    });

    it('QUITAR solo borra las pedidas en las tareas que las tienen', async () => {
      const { service, tx } = makeService({ antes: [{ idTarea: 1 }, { idTarea: 2 }] });
      tx.tareaEtiqueta.findMany.mockResolvedValue([
        { idTarea: 1, idEtiqueta: 7 },
        { idTarea: 1, idEtiqueta: 8 },
      ]);

      const resultado = await service.bulkAction(
        PROYECTO,
        LIDER,
        dto({ idsTareas: [1, 2], accion: 'QUITAR_ETIQUETAS', idsEtiquetas: [8] }),
      );

      expect(tx.tareaEtiqueta.deleteMany).toHaveBeenCalledWith({
        where: { idTarea: { in: [1] }, idEtiqueta: { in: [8] } },
      });
      expect(tx.tareaEtiqueta.createMany).not.toHaveBeenCalled();
      expect(resultado.idsActualizadas).toEqual([1]);
    });
  });

  describe('aviso agrupado', () => {
    it('cada miembro del rol recibe una sola notificación con sus tareas; el actor queda excluido', async () => {
      const { service, prisma, notifications } = makeService({
        antes: [{ idTarea: 1, idRolProyecto: 6 }, { idTarea: 2, idRolProyecto: 6 }, { idTarea: 3, asignado: { idUsuario: 44, nombre: 'Ana', apellido: 'Paz' } }],
      });
      prisma.participacionProyecto.findMany.mockResolvedValue([
        { idUsuario: 21, idRolProyecto: 6 },
        { idUsuario: LIDER, idRolProyecto: 6 },
      ]);

      await service.bulkAction(PROYECTO, LIDER, dto({ idsTareas: [1, 2, 3], accion: 'MOVER', estadoTarea: EstadoTarea.EN_REVISION }));

      expect(notifications.notifyUsers).toHaveBeenCalledTimes(2);
      expect(notifications.notifyUsers).toHaveBeenCalledWith([21], {
        tipoNotificacion: TipoNotificacion.TAREA_ACTUALIZADA,
        tituloNotificacion: 'Tareas movidas',
        mensajeNotificacion: 'Se movieron 2 tareas a En revisión.',
        datosJson: { projectId: PROYECTO, accion: 'MOVER', taskIds: [1, 2] },
      });
      // Una sola tarea: el aviso la nombra y enlaza directo a ella.
      expect(notifications.notifyUsers).toHaveBeenCalledWith([44], {
        tipoNotificacion: TipoNotificacion.TAREA_ACTUALIZADA,
        tituloNotificacion: 'Estado de tarea actualizado',
        mensajeNotificacion: 'La tarea "Tarea 3" cambió de estado a En revisión.',
        datosJson: { projectId: PROYECTO, accion: 'MOVER', taskIds: [3], taskId: 3, taskTitle: 'Tarea 3' },
      });
    });

    it('un fallo al notificar no revierte ni rompe la respuesta', async () => {
      const { service, notifications } = makeService({
        antes: [{ idTarea: 1, asignado: { idUsuario: 44, nombre: 'Ana', apellido: 'Paz' } }],
      });
      notifications.notifyUsers.mockRejectedValue(new Error('socket caído'));

      const resultado = await service.bulkAction(
        PROYECTO,
        LIDER,
        dto({ idsTareas: [1], accion: 'MOVER', estadoTarea: EstadoTarea.EN_PROGRESO }),
      );
      expect(resultado.idsActualizadas).toEqual([1]);
    });
  });
});
