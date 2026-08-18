import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, ParseIntPipe } from '@nestjs/common';
import { HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EstadoTarea } from '@prisma/client';
import { TasksController } from '../src/tasks/tasks.controller';
import { TasksService } from '../src/tasks/tasks.service';
import { UpdateTaskEstadoDto } from '../src/tasks/dto/update-task-estado.dto';

function makeService() {
  return {
    findAll: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateEstado: vi.fn(),
  };
}

function makeController(service: ReturnType<typeof makeService>) {
  return new TasksController(service as unknown as TasksService);
}

describe('TasksController.updateEstado (PATCH /proyectos/:projectId/tareas/:taskId/estado)', () => {
  it('está registrado como PATCH bajo el segmento :taskId/estado', () => {
    expect(Reflect.getMetadata(PATH_METADATA, TasksController.prototype.updateEstado)).toBe(
      ':taskId/estado',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, TasksController.prototype.updateEstado)).toBe(4); // PATCH
  });

  it('no fuerza un código HTTP distinto del 200 por defecto de PATCH', () => {
    expect(
      Reflect.getMetadata(HTTP_CODE_METADATA, TasksController.prototype.updateEstado),
    ).toBeUndefined();
  });

  it('delega en TasksService.updateEstado con projectId, taskId, userId (CurrentUser) y el dto', () => {
    const service = makeService();
    const controller = makeController(service);
    const dto: UpdateTaskEstadoDto = { estadoTarea: EstadoTarea.EN_PROGRESO };

    controller.updateEstado(5, 42, { userId: 9 }, dto);

    expect(service.updateEstado).toHaveBeenCalledWith(5, 42, 9, dto);
  });

  it('retorna exactamente lo que resuelve TasksService.updateEstado, sin transformarlo', async () => {
    const service = makeService();
    const tareaActualizada = { idTarea: 42, estadoTarea: 'HECHO' };
    service.updateEstado.mockResolvedValue(tareaActualizada);
    const controller = makeController(service);

    const result = await controller.updateEstado(5, 42, { userId: 9 }, {
      estadoTarea: EstadoTarea.EN_PROGRESO,
    });

    expect(result).toBe(tareaActualizada);
  });

  it('propaga los errores que lance TasksService.updateEstado (autorización, tarea inexistente, etc.)', async () => {
    const service = makeService();
    const error = new ForbiddenException('No tienes permiso para realizar esta acción sobre la tarea');
    service.updateEstado.mockRejectedValue(error);
    const controller = makeController(service);

    await expect(
      controller.updateEstado(5, 42, { userId: 9 }, {
        estadoTarea: EstadoTarea.EN_PROGRESO,
      }),
    ).rejects.toBe(error);
  });

  it('projectId no numérico produce BadRequestException (400) vía ParseIntPipe real', async () => {
    const pipe = new ParseIntPipe();
    await expect(
      pipe.transform('abc', { type: 'param', data: 'projectId' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('taskId no numérico produce BadRequestException (400) vía ParseIntPipe real', async () => {
    const pipe = new ParseIntPipe();
    await expect(
      pipe.transform('xyz', { type: 'param', data: 'taskId' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('usa UpdateTaskEstadoDto y no lee la identidad del actor desde body, query o headers', () => {
    const source = readFileSync(join(__dirname, '../src/tasks/tasks.controller.ts'), 'utf-8');
    expect(source).toMatch(/@Body\(\)\s+dto:\s+UpdateTaskEstadoDto/);
    expect(source).not.toMatch(/@Query\(/);
    expect(source).not.toMatch(/@Headers\(/);
    expect(source).not.toMatch(/@Body\('userId'/);
    expect(source).not.toMatch(/dto\.userId/);
    expect(source).toMatch(/@CurrentUser\(\)/);
  });

  it('el controller no abre transacciones, no consulta Prisma ni usa any', () => {
    const source = readFileSync(join(__dirname, '../src/tasks/tasks.controller.ts'), 'utf-8');
    expect(source).not.toMatch(/\$transaction/);
    expect(source).not.toMatch(/:\s*any\b/);
  });

  it('no implementa otras rutas PATCH además de edición y estado (DELETE se agregó en la Tarea 22)', () => {
    const source = readFileSync(join(__dirname, '../src/tasks/tasks.controller.ts'), 'utf-8');
    const patches = [...source.matchAll(/@Patch\('([^']*)'\)/g)].map((m) => m[1]);
    expect(patches.sort()).toEqual([':taskId', ':taskId/estado'].sort());
  });

  it('los únicos nombres de @Param declarados en todo el archivo son projectId y taskId', () => {
    const source = readFileSync(join(__dirname, '../src/tasks/tasks.controller.ts'), 'utf-8');
    const paramNames = [...source.matchAll(/@Param\('([^']+)'/g)].map((m) => m[1]);
    expect([...new Set(paramNames)].sort()).toEqual(['projectId', 'taskId']);
  });
});
