import { describe, expect, it, vi } from 'vitest';
import { GUARDS_METADATA, HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { SprintsController } from '../src/sprints/sprints.controller';
import { ProjectWriteGuard } from '../src/common/guards/project-write.guard';

function makeService() {
  return { startSprint: vi.fn(), finalizeSprint: vi.fn() } as any;
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

describe('SprintsController.finalize (POST /proyectos/:projectId/sprints/:sprintId/finalizar)', () => {
  it('está registrado como POST en :sprintId/finalizar', () => {
    expect(Reflect.getMetadata(PATH_METADATA, SprintsController.prototype.finalize)).toBe(
      ':sprintId/finalizar',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, SprintsController.prototype.finalize)).toBe(1); // POST
  });

  it('responde con 200 OK', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, SprintsController.prototype.finalize)).toBe(
      200,
    );
  });

  it('NO tiene ProjectWriteGuard aplicado (A4 gestiona su propia seguridad de estado en la transacción)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, SprintsController.prototype.finalize) ?? [];
    expect(guards).not.toContain(ProjectWriteGuard);
  });

  it('delega en SprintsService.finalizeSprint con projectId, sprintId y userId (CurrentUser)', () => {
    const service = makeService();
    const controller = new SprintsController(service);

    controller.finalize(5, 12, { userId: 9 });

    expect(service.finalizeSprint).toHaveBeenCalledTimes(1);
    expect(service.finalizeSprint).toHaveBeenCalledWith(5, 12, 9);
  });

  it('retorna exactamente lo que resuelve SprintsService.finalizeSprint, sin transformarlo', async () => {
    const service = makeService();
    const sprintFinalizado = { idSprint: 12, idProyecto: 5, estado: 'EN_FINALIZACION' };
    service.finalizeSprint.mockResolvedValue(sprintFinalizado);
    const controller = new SprintsController(service);

    const result = await controller.finalize(5, 12, { userId: 9 });

    expect(result).toBe(sprintFinalizado);
  });

  it('propaga los errores de autorización/negocio que lance SprintsService.finalizeSprint', async () => {
    const service = makeService();
    const error = new Error('conflicto');
    service.finalizeSprint.mockRejectedValue(error);
    const controller = new SprintsController(service);

    await expect(controller.finalize(5, 12, { userId: 9 })).rejects.toBe(error);
  });
});
