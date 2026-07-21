import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, ParseIntPipe } from '@nestjs/common';
import { HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TasksController } from '../src/tasks/tasks.controller';

function makeService() {
  return {
    findAll: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateEstado: vi.fn(),
    remove: vi.fn(),
  } as any;
}

describe('TasksController.remove (DELETE /proyectos/:projectId/tareas/:taskId)', () => {
  it('está registrado como DELETE bajo el segmento :taskId', () => {
    expect(Reflect.getMetadata(PATH_METADATA, TasksController.prototype.remove)).toBe(':taskId');
    expect(Reflect.getMetadata(METHOD_METADATA, TasksController.prototype.remove)).toBe(3); // DELETE
  });

  it('responde con 204 No Content', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, TasksController.prototype.remove)).toBe(204);
  });

  it('delega en TasksService.remove con projectId, taskId (Param) y userId (CurrentUser)', async () => {
    const service = makeService();
    const controller = new TasksController(service);

    await controller.remove(5, 42, { userId: 9 });

    expect(service.remove).toHaveBeenCalledWith(5, 42, 9);
  });

  it('la respuesta no tiene contenido (resuelve undefined)', async () => {
    const service = makeService();
    service.remove.mockResolvedValue(undefined);
    const controller = new TasksController(service);

    const result = await controller.remove(5, 42, { userId: 9 });

    expect(result).toBeUndefined();
  });

  it('propaga los errores que lance TasksService.remove (autorización, tarea inexistente, etc.)', async () => {
    const service = makeService();
    const error = new ForbiddenException('No eres el líder de este proyecto');
    service.remove.mockRejectedValue(error);
    const controller = new TasksController(service);

    await expect(controller.remove(5, 42, { userId: 9 })).rejects.toBe(error);
  });

  it('projectId no numérico produce BadRequestException (400) vía ParseIntPipe real', async () => {
    const pipe = new ParseIntPipe();
    await expect(
      pipe.transform('abc', { type: 'param', data: 'projectId' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('taskId no numérico produce BadRequestException (400) vía ParseIntPipe real', async () => {
    const pipe = new ParseIntPipe();
    await expect(
      pipe.transform('xyz', { type: 'param', data: 'taskId' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('no declara @Body en remove ni lee la identidad desde params/query adicionales', () => {
    const source = readFileSync(join(__dirname, '../src/tasks/tasks.controller.ts'), 'utf-8');
    const removeMatch = source.match(/remove\(([\s\S]*?)\): Promise<void> \{/);
    expect(removeMatch).not.toBeNull();
    const removeSignature = removeMatch![1];
    expect(removeSignature).not.toMatch(/@Body/);
    expect(removeSignature).not.toMatch(/@Query/);
    expect(removeSignature).not.toMatch(/@Headers/);
    expect(removeSignature).toMatch(/@CurrentUser\(\)/);
  });

  it('los únicos nombres de @Param declarados en todo el archivo son projectId y taskId', () => {
    const source = readFileSync(join(__dirname, '../src/tasks/tasks.controller.ts'), 'utf-8');
    const paramNames = [...source.matchAll(/@Param\('([^']+)'/g)].map((m) => m[1]);
    expect([...new Set(paramNames)].sort()).toEqual(['projectId', 'taskId']);
  });

  it('el controller no abre transacciones ni consulta Prisma directamente', () => {
    const source = readFileSync(join(__dirname, '../src/tasks/tasks.controller.ts'), 'utf-8');
    expect(source).not.toMatch(/\$transaction/);
    expect(source).not.toMatch(/prisma\./);
  });

  it('sigue exponiendo GET, POST, PATCH general y PATCH de estado sin cambios de ruta', () => {
    expect(Reflect.getMetadata(PATH_METADATA, TasksController.prototype.findAll)).toBe('/');
    expect(Reflect.getMetadata(PATH_METADATA, TasksController.prototype.findOne)).toBe(':taskId');
    expect(Reflect.getMetadata(PATH_METADATA, TasksController.prototype.create)).toBe('/');
    expect(Reflect.getMetadata(PATH_METADATA, TasksController.prototype.update)).toBe(':taskId');
    expect(Reflect.getMetadata(PATH_METADATA, TasksController.prototype.updateEstado)).toBe(
      ':taskId/estado',
    );
  });
});
