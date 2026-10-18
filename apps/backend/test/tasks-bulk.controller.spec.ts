import { describe, expect, it, vi } from 'vitest';
import { HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { TasksController } from '../src/tasks/tasks.controller';
import type { TasksService } from '../src/tasks/tasks.service';
import type { BulkTaskActionDto } from '../src/tasks/dto/bulk-task-action.dto';

describe('TasksController.bulkAction (HU-202/T-383)', () => {
  it('está registrado como POST acciones-masivas y responde 200', () => {
    const handler = TasksController.prototype.bulkAction;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('acciones-masivas');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(200);
  });

  it('delega proyecto, actor y DTO al servicio y devuelve su resultado sin transformar', async () => {
    const esperado = { accion: 'MOVER', tareas: [], idsActualizadas: [] };
    const service = { bulkAction: vi.fn().mockResolvedValue(esperado) };
    const controller = new TasksController(service as unknown as TasksService);
    const dto = { idsTareas: [1, 2], accion: 'MOVER', estadoTarea: 'HECHO' } as BulkTaskActionDto;

    const resultado = await controller.bulkAction(5, { userId: 9 }, dto);

    expect(service.bulkAction).toHaveBeenCalledWith(5, 9, dto);
    expect(resultado).toBe(esperado);
  });
});
