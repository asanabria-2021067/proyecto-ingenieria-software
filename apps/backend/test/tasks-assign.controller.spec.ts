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
    assign: vi.fn(),
  } as any;
}

describe('TasksController.assign (POST /proyectos/:projectId/tareas/:taskId/asignar)', () => {
  it('está registrado como POST bajo el segmento :taskId/asignar', () => {
    expect(Reflect.getMetadata(PATH_METADATA, TasksController.prototype.assign)).toBe(
      ':taskId/asignar',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, TasksController.prototype.assign)).toBe(1); // POST
  });

  it('responde con 200 OK explícito (no 201, porque puede ser idempotente)', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, TasksController.prototype.assign)).toBe(200);
  });

  it('delega en TasksService.assign con projectId, taskId, userId (CurrentUser) y el dto', () => {
    const service = makeService();
    const controller = new TasksController(service);
    const dto = { idUsuario: 7 } as any;

    controller.assign(5, 42, { userId: 9 }, dto);

    expect(service.assign).toHaveBeenCalledWith(5, 42, 9, dto);
  });

  it('retorna exactamente lo que resuelve TasksService.assign, sin transformarlo', async () => {
    const service = makeService();
    const tareaAsignada = { idTarea: 42, asignacionActiva: { idUsuario: 7 } };
    service.assign.mockResolvedValue(tareaAsignada);
    const controller = new TasksController(service);

    const result = await controller.assign(5, 42, { userId: 9 }, { idUsuario: 7 } as any);

    expect(result).toBe(tareaAsignada);
  });

  it('propaga los errores que lance TasksService.assign (autorización, candidato inválido, etc.)', async () => {
    const service = makeService();
    const error = new ForbiddenException('No eres el líder de este proyecto');
    service.assign.mockRejectedValue(error);
    const controller = new TasksController(service);

    await expect(controller.assign(5, 42, { userId: 9 }, { idUsuario: 7 } as any)).rejects.toBe(
      error,
    );
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

  it('usa AssignTaskDto y no lee la identidad del actor desde body, query o headers', () => {
    const source = readFileSync(join(__dirname, '../src/tasks/tasks.controller.ts'), 'utf-8');
    const assignMatch = source.match(/assign\(([\s\S]*?)\)\s*\{/);
    expect(assignMatch).not.toBeNull();
    const assignSignature = assignMatch![1];
    expect(assignSignature).toMatch(/@Body\(\)\s+dto:\s+AssignTaskDto/);
    expect(assignSignature).not.toMatch(/@Query\(/);
    expect(assignSignature).not.toMatch(/@Headers\(/);
    expect(assignSignature).toMatch(/@CurrentUser\(\)/);
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

  it('coexiste correctamente con POST /, PATCH /:taskId, PATCH /:taskId/estado y DELETE /:taskId', () => {
    expect(Reflect.getMetadata(PATH_METADATA, TasksController.prototype.create)).toBe('/');
    expect(Reflect.getMetadata(METHOD_METADATA, TasksController.prototype.create)).toBe(1); // POST
    expect(Reflect.getMetadata(PATH_METADATA, TasksController.prototype.update)).toBe(':taskId');
    expect(Reflect.getMetadata(METHOD_METADATA, TasksController.prototype.update)).toBe(4); // PATCH
    expect(Reflect.getMetadata(PATH_METADATA, TasksController.prototype.updateEstado)).toBe(
      ':taskId/estado',
    );
    expect(Reflect.getMetadata(PATH_METADATA, TasksController.prototype.remove)).toBe(':taskId');
    expect(Reflect.getMetadata(METHOD_METADATA, TasksController.prototype.remove)).toBe(3); // DELETE

    // No hay ambigüedad entre las dos rutas POST (raíz vs. :taskId/asignar).
    const posts = [
      Reflect.getMetadata(PATH_METADATA, TasksController.prototype.create),
      Reflect.getMetadata(PATH_METADATA, TasksController.prototype.assign),
    ];
    expect(new Set(posts).size).toBe(2);
  });

  it('la desasignación independiente (Tarea 25) usa DELETE en la misma ruta, no un endpoint distinto', () => {
    const source = readFileSync(join(__dirname, '../src/tasks/tasks.controller.ts'), 'utf-8');
    const deleteAsignarMatches = [...source.matchAll(/@Delete\('[^']*asignar'\)/g)];
    expect(deleteAsignarMatches.length).toBe(1);
  });
});
