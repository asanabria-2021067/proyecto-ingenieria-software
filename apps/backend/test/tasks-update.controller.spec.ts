import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ParseIntPipe } from '@nestjs/common';
import { HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TasksController } from '../src/tasks/tasks.controller';
import { TasksService } from '../src/tasks/tasks.service';
import { UpdateTaskDto } from '../src/tasks/dto/update-task.dto';

function makeService() {
  return { findAll: vi.fn(), findOne: vi.fn(), create: vi.fn(), update: vi.fn() };
}

function makeController(service: ReturnType<typeof makeService>) {
  return new TasksController(service as unknown as TasksService);
}

describe('TasksController.update (PATCH /proyectos/:projectId/tareas/:taskId)', () => {
  it('está registrado como PATCH bajo el segmento :taskId', () => {
    expect(Reflect.getMetadata(PATH_METADATA, TasksController.prototype.update)).toBe(':taskId');
    expect(Reflect.getMetadata(METHOD_METADATA, TasksController.prototype.update)).toBe(4); // PATCH
  });

  it('no fuerza un código HTTP distinto del 200 por defecto de PATCH', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, TasksController.prototype.update)).toBeUndefined();
  });

  it('delega en TasksService.update con projectId, taskId, userId (CurrentUser) y el dto', () => {
    const service = makeService();
    const controller = makeController(service);
    const dto: UpdateTaskDto = { tituloTarea: 'Título editado' };

    controller.update(5, 42, { userId: 9 }, dto);

    expect(service.update).toHaveBeenCalledWith(5, 42, 9, dto);
  });

  it('retorna exactamente lo que resuelve TasksService.update, sin transformarlo', async () => {
    const service = makeService();
    const tareaActualizada = { idTarea: 42, tituloTarea: 'Título editado' };
    service.update.mockResolvedValue(tareaActualizada);
    const controller = makeController(service);

    const result = await controller.update(5, 42, { userId: 9 }, {});

    expect(result).toBe(tareaActualizada);
  });

  it('propaga los errores que lance TasksService.update (autorización, validación, payload vacío)', async () => {
    const service = makeService();
    const error = new BadRequestException('Debe enviar al menos un campo para actualizar la tarea');
    service.update.mockRejectedValue(error);
    const controller = makeController(service);

    await expect(controller.update(5, 42, { userId: 9 }, {})).rejects.toBe(error);
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

  it('no lee la identidad del actor desde body, query o headers', () => {
    const source = readFileSync(join(__dirname, '../src/tasks/tasks.controller.ts'), 'utf-8');
    expect(source).toMatch(/@Body\(\)\s+dto:\s+UpdateTaskDto/);
    expect(source).not.toMatch(/@Body\('userId'/);
    expect(source).not.toMatch(/dto\.userId/);
  });

  it('el controller no abre transacciones, no consulta Prisma ni usa any', () => {
    const source = readFileSync(join(__dirname, '../src/tasks/tasks.controller.ts'), 'utf-8');
    expect(source).not.toMatch(/\$transaction/);
    expect(source).not.toMatch(/:\s*any\b/);
  });
});
