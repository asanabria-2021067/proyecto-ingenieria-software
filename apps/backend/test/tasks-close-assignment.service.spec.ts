import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service';
import { TasksAuthorizationService } from '../src/tasks/tasks-authorization.service';
import { TasksContextService } from '../src/tasks/tasks-context.service';
import { TasksRelationsService } from '../src/tasks/tasks-relations.service';
import { TasksService } from '../src/tasks/tasks.service';
import { NotificationsService } from '../src/notifications/notifications.service';

const PROJECT_ID = 5;
const TASK_ID = 42;
const ASSIGNMENT_ID = 9;
const ACTOR_ID = 3;
const OTHER_USER_ID = 4;
const LONG_CONTENT = 'avance '.repeat(34);
const VALID_DTO = {
  horasReales: 2.5,
  contenidoAvance: LONG_CONTENT,
  marcarComoHecha: true,
};

function tareaRow(overrides: Record<string, unknown> = {}) {
  return {
    idTarea: TASK_ID,
    idProyecto: PROJECT_ID,
    idHito: null,
    idRolProyecto: null,
    tituloTarea: 'Tarea con cierre de tramo',
    descripcionTarea: null,
    estadoTarea: 'EN_PROGRESO',
    prioridad: 'MEDIA',
    creadaPor: 1,
    fechaCreacion: new Date('2026-01-01T00:00:00.000Z'),
    fechaLimite: null,
    actualizadaEn: null,
    tiempoEstimadoHoras: null,
    hito: null,
    rolProyecto: null,
    asignaciones: [],
    etiquetas: [],
    _count: { comentarios: 0 },
    ...overrides,
  };
}

function asignacion(overrides: Record<string, unknown> = {}) {
  return {
    idAsignacion: ASSIGNMENT_ID,
    idTarea: TASK_ID,
    idUsuario: ACTOR_ID,
    desasignadaEn: null,
    ...overrides,
  };
}

function makeTx() {
  return {
    tarea: {
      findFirst: vi.fn().mockResolvedValue(tareaRow()),
      update: vi.fn().mockResolvedValue(tareaRow({ estadoTarea: 'HECHO' })),
    },
    asignacionTarea: {
      findFirst: vi.fn().mockResolvedValue(asignacion()),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    registroAvanceAsignacion: {
      create: vi.fn().mockResolvedValue({
        idRegistroAvance: 77,
        idAsignacion: ASSIGNMENT_ID,
        idAutor: ACTOR_ID,
        contenido: LONG_CONTENT,
      }),
    },
  };
}

type TxMock = ReturnType<typeof makeTx>;

function makePrisma(tx = makeTx()) {
  return {
    tx,
    $transaction: vi.fn(async (callback: (tx: TxMock) => Promise<unknown>) => callback(tx)),
    asignacionTarea: { updateMany: vi.fn(), findFirst: vi.fn() },
    registroAvanceAsignacion: { create: vi.fn() },
    tarea: { update: vi.fn(), findFirst: vi.fn() },
  };
}

function makeContext(overrides: Record<string, unknown> = {}) {
  return {
    getTaskInProjectOrThrow: vi.fn().mockResolvedValue(tareaRow()),
    assertActiveProjectParticipant: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeService(options: { prisma?: ReturnType<typeof makePrisma>; context?: ReturnType<typeof makeContext> } = {}) {
  const prisma = options.prisma ?? makePrisma();
  const context = options.context ?? makeContext();
  const service = new TasksService(
    prisma as unknown as PrismaService,
    {} as unknown as TasksAuthorizationService,
    {} as unknown as TasksRelationsService,
    {} as unknown as NotificationsService,
    context as unknown as TasksContextService,
  );
  return { context, prisma, service, tx: prisma.tx };
}

describe('TasksService.closeAssignment', () => {
  it('rechaza horasReales ausentes o inválidas sin cerrar tramo, crear avance ni marcar HECHO', async () => {
    const { service, tx } = makeService();

    await expect(
      service.closeAssignment(PROJECT_ID, TASK_ID, ASSIGNMENT_ID, ACTOR_ID, {
        contenidoAvance: LONG_CONTENT,
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.closeAssignment(PROJECT_ID, TASK_ID, ASSIGNMENT_ID, ACTOR_ID, {
        horasReales: -1,
        contenidoAvance: LONG_CONTENT,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.asignacionTarea.updateMany).not.toHaveBeenCalled();
    expect(tx.registroAvanceAsignacion.create).not.toHaveBeenCalled();
    expect(tx.tarea.update).not.toHaveBeenCalled();
  });

  it('rechaza avance ausente o menor de 200 caracteres significativos sin escritura parcial', async () => {
    const { service, tx } = makeService();
    const contenidoCortoConEspacios = `${' '.repeat(240)}avance corto${' '.repeat(240)}`;

    await expect(
      service.closeAssignment(PROJECT_ID, TASK_ID, ASSIGNMENT_ID, ACTOR_ID, {
        horasReales: 1,
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.closeAssignment(PROJECT_ID, TASK_ID, ASSIGNMENT_ID, ACTOR_ID, {
        horasReales: 1,
        contenidoAvance: contenidoCortoConEspacios,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.asignacionTarea.updateMany).not.toHaveBeenCalled();
    expect(tx.registroAvanceAsignacion.create).not.toHaveBeenCalled();
  });

  it('cierra el tramo con horas, avance y Tarea.estado HECHO cuando marcarComoHecha=true', async () => {
    const { context, prisma, service, tx } = makeService();
    tx.tarea.findFirst.mockResolvedValue(tareaRow({ estadoTarea: 'HECHO' }));

    const result = await service.closeAssignment(
      PROJECT_ID,
      TASK_ID,
      ASSIGNMENT_ID,
      ACTOR_ID,
      VALID_DTO,
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(context.getTaskInProjectOrThrow).toHaveBeenCalledWith(PROJECT_ID, TASK_ID, tx);
    expect(tx.asignacionTarea.findFirst).toHaveBeenCalledWith({
      where: { idAsignacion: ASSIGNMENT_ID, idTarea: TASK_ID },
      select: { idAsignacion: true, idTarea: true, idUsuario: true, desasignadaEn: true },
    });
    expect(context.assertActiveProjectParticipant).toHaveBeenCalledWith(PROJECT_ID, ACTOR_ID, tx);
    expect(tx.asignacionTarea.updateMany).toHaveBeenCalledWith({
      where: {
        idAsignacion: ASSIGNMENT_ID,
        idTarea: TASK_ID,
        idUsuario: ACTOR_ID,
        desasignadaEn: null,
      },
      data: { horasReales: 2.5, desasignadaEn: expect.any(Date) },
    });
    expect(tx.registroAvanceAsignacion.create).toHaveBeenCalledWith({
      data: { idAsignacion: ASSIGNMENT_ID, idAutor: ACTOR_ID, contenido: LONG_CONTENT },
    });
    expect(tx.tarea.update).toHaveBeenCalledWith({
      where: { idTarea: TASK_ID },
      data: { estadoTarea: 'HECHO' },
    });
    expect(result.estadoTarea).toBe('HECHO');
    expect(result.asignacionActiva).toBeNull();
  });

  it('cierra el tramo sin forzar HECHO cuando marcarComoHecha=false u omitido', async () => {
    const { service, tx } = makeService();

    await service.closeAssignment(PROJECT_ID, TASK_ID, ASSIGNMENT_ID, ACTOR_ID, {
      horasReales: 3,
      contenidoAvance: LONG_CONTENT,
      marcarComoHecha: false,
    });

    await service.closeAssignment(PROJECT_ID, TASK_ID, ASSIGNMENT_ID, ACTOR_ID, {
      horasReales: 4,
      contenidoAvance: LONG_CONTENT,
    });

    expect(tx.asignacionTarea.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.registroAvanceAsignacion.create).toHaveBeenCalledTimes(2);
    expect(tx.tarea.update).not.toHaveBeenCalled();
  });

  it('rechaza un tramo ya cerrado cuando el cierre condicional afecta cero filas', async () => {
    const { service, tx } = makeService();
    tx.asignacionTarea.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.closeAssignment(PROJECT_ID, TASK_ID, ASSIGNMENT_ID, ACTOR_ID, VALID_DTO),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.asignacionTarea.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ desasignadaEn: null }),
      }),
    );
    expect(tx.registroAvanceAsignacion.create).not.toHaveBeenCalled();
    expect(tx.tarea.update).not.toHaveBeenCalled();
  });

  it('rechaza una asignación que no pertenece a la tarea indicada', async () => {
    const { service, tx } = makeService();
    tx.asignacionTarea.findFirst.mockResolvedValue(null);

    await expect(
      service.closeAssignment(PROJECT_ID, TASK_ID, ASSIGNMENT_ID, ACTOR_ID, VALID_DTO),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(tx.asignacionTarea.updateMany).not.toHaveBeenCalled();
    expect(tx.registroAvanceAsignacion.create).not.toHaveBeenCalled();
  });

  it('rechaza un usuario distinto al responsable del tramo', async () => {
    const { context, service, tx } = makeService();

    await expect(
      service.closeAssignment(PROJECT_ID, TASK_ID, ASSIGNMENT_ID, OTHER_USER_ID, VALID_DTO),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(context.assertActiveProjectParticipant).not.toHaveBeenCalled();
    expect(tx.asignacionTarea.updateMany).not.toHaveBeenCalled();
    expect(tx.registroAvanceAsignacion.create).not.toHaveBeenCalled();
  });

  it('usa exclusivamente el cliente transaccional para las escrituras de cierre, avance y HECHO', async () => {
    const { prisma, service, tx } = makeService();

    await service.closeAssignment(PROJECT_ID, TASK_ID, ASSIGNMENT_ID, ACTOR_ID, VALID_DTO);

    expect(tx.asignacionTarea.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.registroAvanceAsignacion.create).toHaveBeenCalledTimes(1);
    expect(tx.tarea.update).toHaveBeenCalledTimes(1);
    expect(prisma.asignacionTarea.updateMany).not.toHaveBeenCalled();
    expect(prisma.registroAvanceAsignacion.create).not.toHaveBeenCalled();
    expect(prisma.tarea.update).not.toHaveBeenCalled();
  });
});
