import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, ParseIntPipe } from '@nestjs/common';
import { HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TasksController } from '../src/tasks/tasks.controller';
import { TasksService } from '../src/tasks/tasks.service';

function makeService() {
  return {
    findAll: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateEstado: vi.fn(),
    remove: vi.fn(),
    assign: vi.fn(),
    unassign: vi.fn(),
  };
}

function makeController(service: ReturnType<typeof makeService>) {
  return new TasksController(service as unknown as TasksService);
}

describe('TasksController.unassign (DELETE /proyectos/:projectId/tareas/:taskId/asignar)', () => {
  it('está registrado como DELETE bajo el segmento :taskId/asignar', () => {
    expect(Reflect.getMetadata(PATH_METADATA, TasksController.prototype.unassign)).toBe(
      ':taskId/asignar',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, TasksController.prototype.unassign)).toBe(3); // DELETE
  });

  it('responde con 204 No Content', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, TasksController.prototype.unassign)).toBe(204);
  });

  it('delega en TasksService.unassign con projectId, taskId (Param) y userId (CurrentUser)', async () => {
    const service = makeService();
    const controller = makeController(service);

    await controller.unassign(5, 42, { userId: 9 });

    expect(service.unassign).toHaveBeenCalledWith(5, 42, 9);
  });

  it('la respuesta no tiene contenido (resuelve undefined)', async () => {
    const service = makeService();
    service.unassign.mockResolvedValue(undefined);
    const controller = makeController(service);

    const result = await controller.unassign(5, 42, { userId: 9 });

    expect(result).toBeUndefined();
  });

  it('propaga los errores que lance TasksService.unassign', async () => {
    const service = makeService();
    const error = new ForbiddenException('No eres el líder de este proyecto');
    service.unassign.mockRejectedValue(error);
    const controller = makeController(service);

    await expect(controller.unassign(5, 42, { userId: 9 })).rejects.toBe(error);
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

  it('no declara @Body en unassign', () => {
    const source = readFileSync(join(__dirname, '../src/tasks/tasks.controller.ts'), 'utf-8');
    const unassignMatch = source.match(/unassign\(([\s\S]*?)\): Promise<void> \{/);
    expect(unassignMatch).not.toBeNull();
    const unassignSignature = unassignMatch![1];
    expect(unassignSignature).not.toMatch(/@Body/);
    expect(unassignSignature).not.toMatch(/@Query/);
    expect(unassignSignature).not.toMatch(/@Headers/);
    expect(unassignSignature).toMatch(/@CurrentUser\(\)/);
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

  it('coexiste correctamente con POST :taskId/asignar', () => {
    expect(Reflect.getMetadata(PATH_METADATA, TasksController.prototype.assign)).toBe(
      ':taskId/asignar',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, TasksController.prototype.assign)).toBe(1); // POST
    expect(Reflect.getMetadata(PATH_METADATA, TasksController.prototype.unassign)).toBe(
      ':taskId/asignar',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, TasksController.prototype.unassign)).toBe(3); // DELETE

    // Mismo path, distinto verbo HTTP: no hay ambigüedad de rutas.
    const deletes = [
      Reflect.getMetadata(PATH_METADATA, TasksController.prototype.remove),
      Reflect.getMetadata(PATH_METADATA, TasksController.prototype.unassign),
    ];
    expect(new Set(deletes).size).toBe(2);
  });

  it('no existe un endpoint de desasignación duplicado', () => {
    const source = readFileSync(join(__dirname, '../src/tasks/tasks.controller.ts'), 'utf-8');
    const deleteAsignarMatches = [...source.matchAll(/@Delete\('[^']*asignar'\)/g)];
    expect(deleteAsignarMatches.length).toBe(1);
  });
});
