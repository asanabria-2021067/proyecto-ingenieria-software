import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { TasksContextService } from '../src/tasks/tasks-context.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { TimeRecordsService } from '../src/time-records/time-records.service';

const PROJECT_ID = 10;
const TASK_ID = 20;
const ASSIGNMENT_ID = 30;
const ASSIGNEE_ID = 50;
const OTHER_USER_ID = 60;
const LEADER_ID = 70;
const VALID_DTO = { horas: 2.5, fecha: '2026-08-20', nota: 'Avance de la mañana' };
const ASSIGNEE_USUARIO = { idUsuario: ASSIGNEE_ID, nombre: 'Ana', apellido: 'Lopez', fotoUrl: null };

function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    registroTiempoTarea: {
      create: vi.fn().mockResolvedValue({
        idRegistroTiempo: 1,
        idAsignacion: ASSIGNMENT_ID,
        idUsuario: ASSIGNEE_ID,
        horas: new Prisma.Decimal(VALID_DTO.horas),
        fecha: new Date('2026-08-20T00:00:00.000Z'),
        nota: VALID_DTO.nota,
        creadoEn: new Date('2026-08-20T12:00:00.000Z'),
        usuario: ASSIGNEE_USUARIO,
      }),
      aggregate: vi.fn().mockResolvedValue({ _sum: { horas: new Prisma.Decimal(2.5) } }),
    },
    asignacionTarea: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    ...overrides,
  };
}

function setup(txOverrides: Record<string, unknown> = {}) {
  const tx = makeTx(txOverrides);
  const prisma = {
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(tx)),
    registroTiempoTarea: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };

  const tasksContext = {
    getTaskInProjectOrThrow: vi.fn().mockResolvedValue({ idTarea: TASK_ID, idProyecto: PROJECT_ID }),
    getActiveAssignment: vi.fn().mockResolvedValue({
      idAsignacion: ASSIGNMENT_ID,
      idTarea: TASK_ID,
      idUsuario: ASSIGNEE_ID,
      desasignadaEn: null,
    }),
    assertActiveProjectParticipant: vi.fn().mockResolvedValue(undefined),
    getProjectOrThrow: vi.fn().mockResolvedValue({ idProyecto: PROJECT_ID, creadoPor: LEADER_ID }),
  };

  const notifications = {
    notifyTaskHoursLogged: vi.fn().mockResolvedValue(undefined),
  };

  const service = new TimeRecordsService(
    prisma as unknown as PrismaService,
    tasksContext as unknown as TasksContextService,
    notifications as unknown as NotificationsService,
  );

  return { prisma, tasksContext, notifications, tx, service };
}

describe('TimeRecordsService (HU-142 / T-170)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('crea el registro sobre el tramo activo cuando el actor es el usuario asignado', async () => {
      const { tx, tasksContext, service } = setup();

      const result = await service.create(PROJECT_ID, TASK_ID, ASSIGNEE_ID, VALID_DTO);

      expect(tasksContext.getTaskInProjectOrThrow).toHaveBeenCalledWith(PROJECT_ID, TASK_ID, tx);
      expect(tasksContext.getActiveAssignment).toHaveBeenCalledWith(TASK_ID, tx);
      expect(tasksContext.assertActiveProjectParticipant).toHaveBeenCalledWith(PROJECT_ID, ASSIGNEE_ID, tx);
      expect(tx.registroTiempoTarea.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            idAsignacion: ASSIGNMENT_ID,
            idUsuario: ASSIGNEE_ID,
            horas: VALID_DTO.horas,
            fecha: new Date('2026-08-20T00:00:00.000Z'),
            nota: VALID_DTO.nota,
          },
        }),
      );
      expect(result).toMatchObject({ idRegistroTiempo: 1, idAsignacion: ASSIGNMENT_ID });
    });

    it('devuelve horas como number (no string) y fecha como YYYY-MM-DD (no Decimal/Date crudos) — regresión del bug de suma-como-string y fecha invalida', async () => {
      const { service } = setup();

      const result = await service.create(PROJECT_ID, TASK_ID, ASSIGNEE_ID, VALID_DTO);

      expect(result.horas).toBe(2.5);
      expect(typeof result.horas).toBe('number');
      expect(result.fecha).toBe('2026-08-20');
      expect(result.usuario).toEqual(ASSIGNEE_USUARIO);
    });

    it('recalcula horasReales como la SUMA de los registros del tramo, no como el valor enviado', async () => {
      const { tx, service } = setup({
        registroTiempoTarea: {
          create: vi.fn().mockResolvedValue({
            idRegistroTiempo: 2,
            idAsignacion: ASSIGNMENT_ID,
            idUsuario: ASSIGNEE_ID,
            horas: new Prisma.Decimal(1),
            fecha: new Date('2026-08-20T00:00:00.000Z'),
            nota: null,
            creadoEn: new Date(),
            usuario: ASSIGNEE_USUARIO,
          }),
          aggregate: vi.fn().mockResolvedValue({ _sum: { horas: new Prisma.Decimal(6) } }),
        },
        asignacionTarea: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      });

      await service.create(PROJECT_ID, TASK_ID, ASSIGNEE_ID, { horas: 1, fecha: '2026-08-20' });

      expect(tx.registroTiempoTarea.aggregate).toHaveBeenCalledWith({
        where: { idAsignacion: ASSIGNMENT_ID },
        _sum: { horas: true },
      });
      const llamada = tx.asignacionTarea.updateMany.mock.calls[0][0];
      expect(llamada.where).toEqual({ idAsignacion: ASSIGNMENT_ID, desasignadaEn: null });
      expect(Number(llamada.data.horasReales)).toBe(6);
    });

    it('rechaza cuando la tarea no tiene una asignación activa', async () => {
      const { tasksContext, service } = setup();
      tasksContext.getActiveAssignment.mockResolvedValue(null);

      await expect(service.create(PROJECT_ID, TASK_ID, ASSIGNEE_ID, VALID_DTO)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rechaza cuando el actor no es el usuario con la asignación activa (ni siquiera el líder)', async () => {
      const { tx, service } = setup();

      await expect(service.create(PROJECT_ID, TASK_ID, OTHER_USER_ID, VALID_DTO)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(tx.registroTiempoTarea.create).not.toHaveBeenCalled();
    });

    it('rechaza cuando el actor es el líder pero no es el usuario asignado (registrar horas no es un privilegio de liderazgo)', async () => {
      const { service } = setup();

      await expect(service.create(PROJECT_ID, TASK_ID, LEADER_ID, VALID_DTO)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rechaza con ConflictException si el tramo se cerró entre la lectura y la escritura (inmutabilidad de un tramo cerrado)', async () => {
      const { service } = setup({
        asignacionTarea: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      });

      await expect(service.create(PROJECT_ID, TASK_ID, ASSIGNEE_ID, VALID_DTO)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('emite TASK_HOURS_LOGGED tras el commit, con projectId/taskId/idAsignacion', async () => {
      const { notifications, service } = setup();

      await service.create(PROJECT_ID, TASK_ID, ASSIGNEE_ID, VALID_DTO);

      expect(notifications.notifyTaskHoursLogged).toHaveBeenCalledWith(PROJECT_ID, ASSIGNEE_ID, {
        projectId: PROJECT_ID,
        taskId: TASK_ID,
        idAsignacion: ASSIGNMENT_ID,
      });
    });

    it('un fallo al emitir TASK_HOURS_LOGGED no afecta la respuesta de creación (registrado con Logger, nunca relanzado)', async () => {
      const { notifications, service } = setup();
      notifications.notifyTaskHoursLogged.mockRejectedValue(new Error('gateway caído'));

      await expect(service.create(PROJECT_ID, TASK_ID, ASSIGNEE_ID, VALID_DTO)).resolves.toMatchObject({
        idRegistroTiempo: 1,
      });
    });
  });

  describe('findAllForTask', () => {
    it('el líder recibe los registros de todos los usuarios (sin filtrar por idUsuario)', async () => {
      const { prisma, service } = setup();

      await service.findAllForTask(PROJECT_ID, TASK_ID, LEADER_ID);

      expect(prisma.registroTiempoTarea.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { asignacion: { idTarea: TASK_ID } },
        }),
      );
    });

    it('un integrante que no es líder solo recibe sus propios registros', async () => {
      const { prisma, service } = setup();

      await service.findAllForTask(PROJECT_ID, TASK_ID, ASSIGNEE_ID);

      expect(prisma.registroTiempoTarea.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { asignacion: { idTarea: TASK_ID }, idUsuario: ASSIGNEE_ID },
        }),
      );
    });

    it('mapea cada fila a horas number y fecha YYYY-MM-DD (misma regresión que create)', async () => {
      const { prisma, service } = setup();
      prisma.registroTiempoTarea.findMany.mockResolvedValue([
        {
          idRegistroTiempo: 5,
          idAsignacion: ASSIGNMENT_ID,
          idUsuario: ASSIGNEE_ID,
          horas: new Prisma.Decimal(3.25),
          fecha: new Date('2026-08-19T00:00:00.000Z'),
          nota: null,
          creadoEn: new Date('2026-08-19T09:00:00.000Z'),
          usuario: ASSIGNEE_USUARIO,
        },
      ]);

      const result = await service.findAllForTask(PROJECT_ID, TASK_ID, LEADER_ID);

      expect(result).toHaveLength(1);
      expect(result[0]!.horas).toBe(3.25);
      expect(typeof result[0]!.horas).toBe('number');
      expect(result[0]!.fecha).toBe('2026-08-19');
    });
  });
});
