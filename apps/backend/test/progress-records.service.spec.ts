import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service';
import { TasksContextService } from '../src/tasks/tasks-context.service';
import { ProgressRecordsService } from '../src/progress-records/progress-records.service';

const PROJECT_ID = 10;
const TASK_ID = 20;
const ASSIGNMENT_ID = 30;
const RECORD_ID = 40;
const AUTHOR_ID = 50;
const OTHER_USER_ID = 60;
const LONG_CONTENT = 'a'.repeat(200);
const UPDATED_CONTENT = 'b'.repeat(220);

function setup() {
  const prisma = {
    asignacionTarea: {
      findFirst: vi.fn(),
    },
    registroAvanceAsignacion: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };

  const tasksContext = {
    getTaskInProjectOrThrow: vi.fn(),
    assertActiveProjectParticipant: vi.fn(),
  };

  const service = new ProgressRecordsService(
    prisma as unknown as PrismaService,
    tasksContext as unknown as TasksContextService,
  );

  prisma.asignacionTarea.findFirst.mockResolvedValue({
    idAsignacion: ASSIGNMENT_ID,
    idTarea: TASK_ID,
    idUsuario: AUTHOR_ID,
  });
  prisma.registroAvanceAsignacion.findFirst.mockResolvedValue({
    idRegistroAvance: RECORD_ID,
    idAsignacion: ASSIGNMENT_ID,
    idAutor: AUTHOR_ID,
  });
  prisma.registroAvanceAsignacion.create.mockResolvedValue({
    idRegistroAvance: RECORD_ID,
    idAsignacion: ASSIGNMENT_ID,
    idAutor: AUTHOR_ID,
    contenido: LONG_CONTENT,
    creadoEn: new Date('2026-08-15T12:00:00.000Z'),
    editadoEn: null,
  });
  prisma.registroAvanceAsignacion.update.mockImplementation(({ data }) =>
    Promise.resolve({
      idRegistroAvance: RECORD_ID,
      idAsignacion: ASSIGNMENT_ID,
      idAutor: AUTHOR_ID,
      contenido: data.contenido,
      creadoEn: new Date('2026-08-15T12:00:00.000Z'),
      editadoEn: data.editadoEn,
    }),
  );

  return { prisma, service, tasksContext };
}

describe('ProgressRecordsService', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('crea un registro cuando la asignación es válida, el usuario está autorizado y el contenido cumple el mínimo', async () => {
    const { prisma, service, tasksContext } = setup();

    const result = await service.create(PROJECT_ID, TASK_ID, ASSIGNMENT_ID, AUTHOR_ID, {
      contenido: LONG_CONTENT,
    });

    expect(tasksContext.getTaskInProjectOrThrow).toHaveBeenCalledWith(PROJECT_ID, TASK_ID);
    expect(prisma.asignacionTarea.findFirst).toHaveBeenCalledWith({
      where: { idAsignacion: ASSIGNMENT_ID, idTarea: TASK_ID },
      select: { idAsignacion: true, idTarea: true, idUsuario: true },
    });
    expect(tasksContext.assertActiveProjectParticipant).toHaveBeenCalledWith(PROJECT_ID, AUTHOR_ID);
    expect(prisma.registroAvanceAsignacion.create).toHaveBeenCalledWith({
      data: { idAsignacion: ASSIGNMENT_ID, idAutor: AUTHOR_ID, contenido: LONG_CONTENT },
    });
    expect(result).toMatchObject({ idRegistroAvance: RECORD_ID, idAutor: AUTHOR_ID });
  });

  it('edita un registro cuando el autor original sigue activo en el proyecto y el contenido cumple el mínimo', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-08-15T18:30:00.000Z');
    vi.setSystemTime(now);
    const { prisma, service, tasksContext } = setup();

    const result = await service.update(PROJECT_ID, TASK_ID, ASSIGNMENT_ID, RECORD_ID, AUTHOR_ID, {
      contenido: UPDATED_CONTENT,
    });

    expect(tasksContext.getTaskInProjectOrThrow).toHaveBeenCalledWith(PROJECT_ID, TASK_ID);
    expect(prisma.registroAvanceAsignacion.findFirst).toHaveBeenCalledWith({
      where: { idRegistroAvance: RECORD_ID, idAsignacion: ASSIGNMENT_ID },
      select: { idRegistroAvance: true, idAsignacion: true, idAutor: true },
    });
    expect(tasksContext.assertActiveProjectParticipant).toHaveBeenCalledWith(PROJECT_ID, AUTHOR_ID);
    expect(prisma.registroAvanceAsignacion.update).toHaveBeenCalledWith({
      where: { idRegistroAvance: RECORD_ID },
      data: { contenido: UPDATED_CONTENT, editadoEn: now },
    });
    expect(result).toMatchObject({ contenido: UPDATED_CONTENT, editadoEn: now });
  });

  it('rechaza contenido con menos de 200 caracteres significativos aunque tenga espacios artificiales', async () => {
    const { prisma, service } = setup();
    const contenidoCortoConEspacios = `${' '.repeat(150)}avance insuficiente${' '.repeat(150)}`;

    await expect(
      service.create(PROJECT_ID, TASK_ID, ASSIGNMENT_ID, AUTHOR_ID, {
        contenido: contenidoCortoConEspacios,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.update(PROJECT_ID, TASK_ID, ASSIGNMENT_ID, RECORD_ID, AUTHOR_ID, {
        contenido: contenidoCortoConEspacios,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.registroAvanceAsignacion.create).not.toHaveBeenCalled();
    expect(prisma.registroAvanceAsignacion.update).not.toHaveBeenCalled();
  });

  it('rechaza la edición por un usuario distinto al autor', async () => {
    const { prisma, service, tasksContext } = setup();

    await expect(
      service.update(PROJECT_ID, TASK_ID, ASSIGNMENT_ID, RECORD_ID, OTHER_USER_ID, {
        contenido: UPDATED_CONTENT,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(tasksContext.assertActiveProjectParticipant).not.toHaveBeenCalled();
    expect(prisma.registroAvanceAsignacion.update).not.toHaveBeenCalled();
  });

  it('rechaza la edición cuando el autor histórico está retirado del proyecto', async () => {
    const { prisma, service, tasksContext } = setup();
    tasksContext.assertActiveProjectParticipant.mockRejectedValue(
      new ForbiddenException('No tienes una participación activa en este proyecto'),
    );

    await expect(
      service.update(PROJECT_ID, TASK_ID, ASSIGNMENT_ID, RECORD_ID, AUTHOR_ID, {
        contenido: UPDATED_CONTENT,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(tasksContext.assertActiveProjectParticipant).toHaveBeenCalledWith(PROJECT_ID, AUTHOR_ID);
    expect(prisma.registroAvanceAsignacion.update).not.toHaveBeenCalled();
  });

  it('rechaza una asignación que no pertenece a la tarea indicada', async () => {
    const { prisma, service } = setup();
    prisma.asignacionTarea.findFirst.mockResolvedValue(null);

    await expect(
      service.create(PROJECT_ID, TASK_ID, ASSIGNMENT_ID, AUTHOR_ID, {
        contenido: LONG_CONTENT,
      }),
    ).rejects.toThrow('Asignación con id 30 no encontrada en la tarea 20');
    expect(prisma.registroAvanceAsignacion.create).not.toHaveBeenCalled();
  });
});
