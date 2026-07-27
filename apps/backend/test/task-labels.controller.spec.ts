import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TaskLabelsController } from '../src/labels/task-labels.controller';
import { LabelsController } from '../src/labels/labels.controller';
import { TasksController } from '../src/tasks/tasks.controller';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';

/**
 * Tarea 32: el proyecto no instala `@nestjs/testing` (ver
 * test/tasks-queries.controller.spec.ts); se inspecciona la metadata real
 * de `@Controller`/`@Put`/`@Delete`/`@HttpCode` con `Reflect.getMetadata`, y
 * se instancia el controller directamente con un LabelsService simulado
 * para verificar delegación.
 */
function makeService() {
  return {
    attachToTask: vi.fn(),
    detachFromTask: vi.fn(),
  } as any;
}

const SOURCE = readFileSync(join(__dirname, '../src/labels/task-labels.controller.ts'), 'utf-8');

describe('TaskLabelsController — metadata de rutas, guard y códigos HTTP (Tarea 32)', () => {
  it('prefijo exacto proyectos/:projectId/tareas/:taskId/etiquetas', () => {
    expect(Reflect.getMetadata(PATH_METADATA, TaskLabelsController)).toBe(
      'proyectos/:projectId/tareas/:taskId/etiquetas',
    );
  });

  it('JwtAuthGuard declarado a nivel de clase (aplica a ambas rutas)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, TaskLabelsController);
    expect(guards).toEqual([JwtAuthGuard]);
  });

  it('PUT usa :labelId, responde 204 No Content', () => {
    expect(Reflect.getMetadata(PATH_METADATA, TaskLabelsController.prototype.attach)).toBe(':labelId');
    expect(Reflect.getMetadata(METHOD_METADATA, TaskLabelsController.prototype.attach)).toBe(2); // PUT
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, TaskLabelsController.prototype.attach)).toBe(204);
  });

  it('DELETE usa :labelId, responde 204 No Content', () => {
    expect(Reflect.getMetadata(PATH_METADATA, TaskLabelsController.prototype.detach)).toBe(':labelId');
    expect(Reflect.getMetadata(METHOD_METADATA, TaskLabelsController.prototype.detach)).toBe(3); // DELETE
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, TaskLabelsController.prototype.detach)).toBe(204);
  });

  it('projectId, taskId y labelId usan ParseIntPipe en ambas rutas', () => {
    const ocurrenciasProjectId = SOURCE.match(/@Param\('projectId', ParseIntPipe\)/g) ?? [];
    const ocurrenciasTaskId = SOURCE.match(/@Param\('taskId', ParseIntPipe\)/g) ?? [];
    const ocurrenciasLabelId = SOURCE.match(/@Param\('labelId', ParseIntPipe\)/g) ?? [];
    expect(ocurrenciasProjectId).toHaveLength(2);
    expect(ocurrenciasTaskId).toHaveLength(2);
    expect(ocurrenciasLabelId).toHaveLength(2);
  });

  it('el actor proviene de @CurrentUser() en ambas rutas', () => {
    const ocurrenciasCurrentUser = SOURCE.match(/@CurrentUser\(\) user:/g) ?? [];
    expect(ocurrenciasCurrentUser).toHaveLength(2);
  });

  it('no existe @Body/DTO en ninguna ruta (sin body, sin query)', () => {
    expect(SOURCE).not.toMatch(/@Body\(/);
    expect(SOURCE).not.toMatch(/@Query\(/);
    expect(SOURCE).not.toMatch(/Dto/);
  });

  it('el controller no expone otros métodos más allá de attach/detach', () => {
    const propios = Object.getOwnPropertyNames(TaskLabelsController.prototype).filter(
      (name) => name !== 'constructor',
    );
    expect(propios.sort()).toEqual(['attach', 'detach']);
  });
});

describe('TaskLabelsController — delegación exacta en LabelsService (Tarea 32)', () => {
  it('PUT delega exactamente en attachToTask con projectId, taskId, labelId, userId (en ese orden)', async () => {
    const service = makeService();
    service.attachToTask.mockResolvedValue(undefined);
    const controller = new TaskLabelsController(service);

    const respuesta = await controller.attach(5, 42, 7, { userId: 9 });

    expect(service.attachToTask).toHaveBeenCalledWith(5, 42, 7, 9);
    expect(respuesta).toBeUndefined();
  });

  it('DELETE delega exactamente en detachFromTask con projectId, taskId, labelId, userId (en ese orden)', async () => {
    const service = makeService();
    service.detachFromTask.mockResolvedValue(undefined);
    const controller = new TaskLabelsController(service);

    const respuesta = await controller.detach(5, 42, 7, { userId: 9 });

    expect(service.detachFromTask).toHaveBeenCalledWith(5, 42, 7, 9);
    expect(respuesta).toBeUndefined();
  });

  it('propaga ForbiddenException del service sin envolverla (attach)', async () => {
    const service = makeService();
    service.attachToTask.mockRejectedValue(new ForbiddenException('No eres el líder de este proyecto'));
    const controller = new TaskLabelsController(service);

    await expect(controller.attach(5, 42, 7, { userId: 9 })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('propaga NotFoundException del service sin envolverla (detach)', async () => {
    const service = makeService();
    service.detachFromTask.mockRejectedValue(new NotFoundException('Tarea no encontrada'));
    const controller = new TaskLabelsController(service);

    await expect(controller.detach(5, 999, 7, { userId: 9 })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('TaskLabelsController — aislamiento de rutas (Tarea 32)', () => {
  it('el prefijo no colisiona con LabelsController (proyectos/:projectId/etiquetas)', () => {
    const prefijoTareas = Reflect.getMetadata(PATH_METADATA, TaskLabelsController);
    const prefijoProyecto = Reflect.getMetadata(PATH_METADATA, LabelsController);
    expect(prefijoTareas).not.toBe(prefijoProyecto);
    expect(prefijoTareas).toBe('proyectos/:projectId/tareas/:taskId/etiquetas');
    expect(prefijoProyecto).toBe('proyectos/:projectId/etiquetas');
  });

  it('el prefijo no colisiona con TasksController (proyectos/:projectId/tareas)', () => {
    const prefijoTareas = Reflect.getMetadata(PATH_METADATA, TaskLabelsController);
    const prefijoTasks = Reflect.getMetadata(PATH_METADATA, TasksController);
    expect(prefijoTareas).not.toBe(prefijoTasks);
    expect(prefijoTasks).toBe('proyectos/:projectId/tareas');
  });

  it('TasksController no se modificó: sigue sin rutas de etiquetas anidadas', () => {
    const tasksSource = readFileSync(join(__dirname, '../src/tasks/tasks.controller.ts'), 'utf-8');
    expect(tasksSource).not.toMatch(/etiquetas/);
  });
});
