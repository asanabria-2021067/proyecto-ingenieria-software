import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common/enums/request-method.enum';
import { ProjectWriteGuard } from '../src/common/guards/project-write.guard';
import { ProgressRecordsController } from '../src/progress-records/progress-records.controller';
import { ProgressRecordsService } from '../src/progress-records/progress-records.service';

function makeController() {
  const service = {
    create: vi.fn(),
    update: vi.fn(),
  };
  return {
    controller: new ProgressRecordsController(service as unknown as ProgressRecordsService),
    service,
  };
}

function routeMetadata(methodName: keyof ProgressRecordsController) {
  const handler = ProgressRecordsController.prototype[methodName];
  return {
    path: Reflect.getMetadata(PATH_METADATA, handler),
    method: Reflect.getMetadata(METHOD_METADATA, handler),
    status: Reflect.getMetadata(HTTP_CODE_METADATA, handler),
  };
}

function guardsOf(methodName: keyof ProgressRecordsController): unknown[] {
  const handler = ProgressRecordsController.prototype[methodName];
  return Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];
}

describe('ProgressRecordsController', () => {
  it('mantiene el prefijo público de registros de avance', () => {
    expect(Reflect.getMetadata(PATH_METADATA, ProgressRecordsController)).toBe(
      'proyectos/:projectId/tareas/:taskId/asignaciones/:assignmentId/avance',
    );
  });

  it('mantiene POST create con 201', () => {
    expect(routeMetadata('create')).toEqual({
      path: '/',
      method: RequestMethod.POST,
      status: HttpStatus.CREATED,
    });
  });

  it('mantiene PATCH update con status estándar', () => {
    expect(routeMetadata('update')).toEqual({
      path: ':progressRecordId',
      method: RequestMethod.PATCH,
      status: undefined,
    });
  });

  it.each(['create', 'update'] as const)('%s tiene ProjectWriteGuard aplicado', (methodName) => {
    expect(guardsOf(methodName)).toContain(ProjectWriteGuard);
  });

  it('delega creación con projectId, taskId, assignmentId, userId y DTO', async () => {
    const { controller, service } = makeController();
    service.create.mockResolvedValue({ idRegistroAvance: 1 });

    const result = await controller.create(10, 20, 30, { userId: 40 }, { contenido: 'x'.repeat(200) });

    expect(service.create).toHaveBeenCalledWith(10, 20, 30, 40, { contenido: 'x'.repeat(200) });
    expect(result).toEqual({ idRegistroAvance: 1 });
  });

  it('delega edición con projectId, taskId, assignmentId, recordId, userId y DTO', async () => {
    const { controller, service } = makeController();
    service.update.mockResolvedValue({ idRegistroAvance: 50 });

    const result = await controller.update(10, 20, 30, 50, { userId: 40 }, { contenido: 'y'.repeat(200) });

    expect(service.update).toHaveBeenCalledWith(10, 20, 30, 50, 40, {
      contenido: 'y'.repeat(200),
    });
    expect(result).toEqual({ idRegistroAvance: 50 });
  });
});
