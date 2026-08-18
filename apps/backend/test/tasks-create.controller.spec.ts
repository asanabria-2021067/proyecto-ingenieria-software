import { describe, expect, it, vi } from 'vitest';
import { HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { TasksController } from '../src/tasks/tasks.controller';
import type { TasksService } from '../src/tasks/tasks.service';
import type { CreateTaskDto } from '../src/tasks/dto/create-task.dto';

function makeService() {
  return { findAll: vi.fn(), findOne: vi.fn(), create: vi.fn() };
}

describe('TasksController.create (POST /proyectos/:projectId/tareas)', () => {
  it('está registrado como POST en la ruta raíz del controller anidado', () => {
    expect(Reflect.getMetadata(PATH_METADATA, TasksController.prototype.create)).toBe('/');
    expect(Reflect.getMetadata(METHOD_METADATA, TasksController.prototype.create)).toBe(1); // POST
  });

  it('responde con 201 Created', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, TasksController.prototype.create)).toBe(201);
  });

  it('delega en TasksService.create con projectId, userId (CurrentUser) y el dto', () => {
    const service = makeService();
    const controller = new TasksController(service as unknown as TasksService);
    const dto = { tituloTarea: 'Nueva tarea', fechaLimite: '2026-12-25', prioridad: 'MEDIA' } as unknown as CreateTaskDto;

    controller.create(5, { userId: 9 }, dto);

    expect(service.create).toHaveBeenCalledWith(5, 9, dto);
  });

  it('retorna exactamente lo que resuelve TasksService.create, sin transformarlo', async () => {
    const service = makeService();
    const tareaCreada = { idTarea: 100, tituloTarea: 'Nueva tarea' };
    service.create.mockResolvedValue(tareaCreada);
    const controller = new TasksController(service as unknown as TasksService);

    const result = await controller.create(5, { userId: 9 }, {} as unknown as CreateTaskDto);

    expect(result).toBe(tareaCreada);
  });

  it('propaga los errores de autorización/validación que lance TasksService.create', async () => {
    const service = makeService();
    const error = new Error('no autorizado');
    service.create.mockRejectedValue(error);
    const controller = new TasksController(service as unknown as TasksService);

    await expect(controller.create(5, { userId: 9 }, {} as unknown as CreateTaskDto)).rejects.toBe(error);
  });
});
