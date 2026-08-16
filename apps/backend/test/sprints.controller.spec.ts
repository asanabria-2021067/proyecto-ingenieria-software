import { describe, expect, it, vi } from 'vitest';
import { HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { SprintsController } from '../src/sprints/sprints.controller';

function makeService() {
  return { startSprint: vi.fn() } as any;
}

describe('SprintsController.start (POST /proyectos/:projectId/sprints)', () => {
  it('está registrado como POST en la ruta raíz del controller anidado', () => {
    expect(Reflect.getMetadata(PATH_METADATA, SprintsController.prototype.start)).toBe('/');
    expect(Reflect.getMetadata(METHOD_METADATA, SprintsController.prototype.start)).toBe(1); // POST
  });

  it('responde con 201 Created', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, SprintsController.prototype.start)).toBe(201);
  });

  it('delega en SprintsService.startSprint con projectId y userId (CurrentUser)', () => {
    const service = makeService();
    const controller = new SprintsController(service);

    controller.start(5, { userId: 9 });

    expect(service.startSprint).toHaveBeenCalledTimes(1);
    expect(service.startSprint).toHaveBeenCalledWith(5, 9);
  });

  it('retorna exactamente lo que resuelve SprintsService.startSprint, sin transformarlo', async () => {
    const service = makeService();
    const sprintCreado = { idSprint: 1, idProyecto: 5, numero: 1, estado: 'ACTIVO' };
    service.startSprint.mockResolvedValue(sprintCreado);
    const controller = new SprintsController(service);

    const result = await controller.start(5, { userId: 9 });

    expect(result).toBe(sprintCreado);
  });

  it('propaga los errores de autorización/negocio que lance SprintsService.startSprint', async () => {
    const service = makeService();
    const error = new Error('no autorizado');
    service.startSprint.mockRejectedValue(error);
    const controller = new SprintsController(service);

    await expect(controller.start(5, { userId: 9 })).rejects.toBe(error);
  });
});
