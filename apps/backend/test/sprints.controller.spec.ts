import { describe, expect, it, vi } from 'vitest';
import { GUARDS_METADATA, HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { SprintsController } from '../src/sprints/sprints.controller';
import { ProjectWriteGuard } from '../src/common/guards/project-write.guard';

function makeService() {
  return {
    startSprint: vi.fn(),
    finalizeSprint: vi.fn(),
    adjustRecognizedHours: vi.fn(),
    getSprintClosingSummary: vi.fn(),
    closeSprint: vi.fn(),
    listSprints: vi.fn(),
    getSprintDetail: vi.fn(),
  } as any;
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

describe('SprintsController.close (POST /proyectos/:projectId/sprints/:sprintId/cerrar)', () => {
  it('está registrado como POST en :sprintId/cerrar', () => {
    expect(Reflect.getMetadata(PATH_METADATA, SprintsController.prototype.close)).toBe(
      ':sprintId/cerrar',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, SprintsController.prototype.close)).toBe(1); // POST
  });

  it('responde con 200 OK', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, SprintsController.prototype.close)).toBe(200);
  });

  it('delega en SprintsService.closeSprint con projectId, sprintId y userId (CurrentUser)', () => {
    const service = makeService();
    const controller = new SprintsController(service);

    controller.close(5, 12, { userId: 9 });

    expect(service.closeSprint).toHaveBeenCalledTimes(1);
    expect(service.closeSprint).toHaveBeenCalledWith(5, 12, 9);
  });

  it('retorna exactamente lo que resuelve SprintsService.closeSprint, sin transformarlo', async () => {
    const service = makeService();
    const sprintCerrado = { idSprint: 12, idProyecto: 5, estado: 'CERRADO' };
    service.closeSprint.mockResolvedValue(sprintCerrado);
    const controller = new SprintsController(service);

    const result = await controller.close(5, 12, { userId: 9 });

    expect(result).toBe(sprintCerrado);
  });

  it('propaga los errores de autorización/negocio que lance SprintsService.closeSprint', async () => {
    const service = makeService();
    const error = new Error('conflicto');
    service.closeSprint.mockRejectedValue(error);
    const controller = new SprintsController(service);

    await expect(controller.close(5, 12, { userId: 9 })).rejects.toBe(error);
  });
});

describe('SprintsController.adjustHours (PATCH /proyectos/:projectId/sprints/:sprintId/horas/:participacionId)', () => {
  it('está registrado como PATCH en :sprintId/horas/:participacionId', () => {
    expect(Reflect.getMetadata(PATH_METADATA, SprintsController.prototype.adjustHours)).toBe(
      ':sprintId/horas/:participacionId',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, SprintsController.prototype.adjustHours)).toBe(4); // PATCH
  });

  it('responde con 200 OK', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, SprintsController.prototype.adjustHours)).toBe(
      200,
    );
  });

  it('delega en SprintsService.adjustRecognizedHours con projectId, sprintId, participacionId, userId y el body', () => {
    const service = makeService();
    const controller = new SprintsController(service);
    const dto = { horasAprobadas: 8, justificacionAjuste: 'ajuste válido' };

    controller.adjustHours(5, 12, 30, dto, { userId: 9 });

    expect(service.adjustRecognizedHours).toHaveBeenCalledTimes(1);
    expect(service.adjustRecognizedHours).toHaveBeenCalledWith(5, 12, 30, 9, dto);
  });

  it('retorna exactamente lo que resuelve SprintsService.adjustRecognizedHours, sin transformarlo', async () => {
    const service = makeService();
    const registroActualizado = { idRegistroHoras: 100, horasAprobadas: 8 };
    service.adjustRecognizedHours.mockResolvedValue(registroActualizado);
    const controller = new SprintsController(service);

    const result = await controller.adjustHours(5, 12, 30, { horasAprobadas: 8 }, { userId: 9 });

    expect(result).toBe(registroActualizado);
  });

  it('propaga los errores de autorización/negocio que lance SprintsService.adjustRecognizedHours', async () => {
    const service = makeService();
    const error = new Error('justificación requerida');
    service.adjustRecognizedHours.mockRejectedValue(error);
    const controller = new SprintsController(service);

    await expect(
      controller.adjustHours(5, 12, 30, { horasAprobadas: 8 }, { userId: 9 }),
    ).rejects.toBe(error);
  });
});

describe('SprintsController.getClosingSummary (GET /proyectos/:projectId/sprints/:sprintId/resumen-cierre)', () => {
  it('está registrado como GET en :sprintId/resumen-cierre', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, SprintsController.prototype.getClosingSummary),
    ).toBe(':sprintId/resumen-cierre');
    expect(
      Reflect.getMetadata(METHOD_METADATA, SprintsController.prototype.getClosingSummary),
    ).toBe(0); // GET
  });

  it('responde con 200 OK', () => {
    expect(
      Reflect.getMetadata(HTTP_CODE_METADATA, SprintsController.prototype.getClosingSummary),
    ).toBe(200);
  });

  it('delega en SprintsService.getSprintClosingSummary con projectId, sprintId y userId (CurrentUser)', () => {
    const service = makeService();
    const controller = new SprintsController(service);

    controller.getClosingSummary(5, 12, { userId: 9 });

    expect(service.getSprintClosingSummary).toHaveBeenCalledTimes(1);
    expect(service.getSprintClosingSummary).toHaveBeenCalledWith(5, 12, 9);
  });

  it('retorna exactamente lo que resuelve SprintsService.getSprintClosingSummary, sin transformarlo', async () => {
    const service = makeService();
    const summary = { idProyecto: 5, idSprint: 12, participantes: [] };
    service.getSprintClosingSummary.mockResolvedValue(summary);
    const controller = new SprintsController(service);

    const result = await controller.getClosingSummary(5, 12, { userId: 9 });

    expect(result).toBe(summary);
  });

  it('propaga los errores de autorización/negocio que lance SprintsService.getSprintClosingSummary', async () => {
    const service = makeService();
    const error = new Error('no autorizado');
    service.getSprintClosingSummary.mockRejectedValue(error);
    const controller = new SprintsController(service);

    await expect(controller.getClosingSummary(5, 12, { userId: 9 })).rejects.toBe(error);
  });
});

describe('SprintsController.list (GET /proyectos/:projectId/sprints)', () => {
  it('está registrado como GET en la ruta raíz del controller anidado', () => {
    expect(Reflect.getMetadata(PATH_METADATA, SprintsController.prototype.list)).toBe('/');
    expect(Reflect.getMetadata(METHOD_METADATA, SprintsController.prototype.list)).toBe(0); // GET
  });

  it('responde con 200 OK', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, SprintsController.prototype.list)).toBe(200);
  });

  it('delega en SprintsService.listSprints con projectId y userId (CurrentUser)', () => {
    const service = makeService();
    const controller = new SprintsController(service);

    controller.list(5, { userId: 9 });

    expect(service.listSprints).toHaveBeenCalledTimes(1);
    expect(service.listSprints).toHaveBeenCalledWith(5, 9);
  });

  it('retorna exactamente lo que resuelve SprintsService.listSprints, sin transformarlo', async () => {
    const service = makeService();
    const lista = [{ idSprint: 1, idProyecto: 5, numero: 1, estado: 'CERRADO' }];
    service.listSprints.mockResolvedValue(lista);
    const controller = new SprintsController(service);

    const result = await controller.list(5, { userId: 9 });

    expect(result).toBe(lista);
  });

  it('propaga los errores de autorización/negocio que lance SprintsService.listSprints', async () => {
    const service = makeService();
    const error = new Error('no autorizado');
    service.listSprints.mockRejectedValue(error);
    const controller = new SprintsController(service);

    await expect(controller.list(5, { userId: 9 })).rejects.toBe(error);
  });
});

describe('SprintsController.detail (GET /proyectos/:projectId/sprints/:sprintId)', () => {
  it('está registrado como GET en :sprintId', () => {
    expect(Reflect.getMetadata(PATH_METADATA, SprintsController.prototype.detail)).toBe(':sprintId');
    expect(Reflect.getMetadata(METHOD_METADATA, SprintsController.prototype.detail)).toBe(0); // GET
  });

  it('responde con 200 OK', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, SprintsController.prototype.detail)).toBe(200);
  });

  it('delega en SprintsService.getSprintDetail con projectId, sprintId y userId (CurrentUser)', () => {
    const service = makeService();
    const controller = new SprintsController(service);

    controller.detail(5, 12, { userId: 9 });

    expect(service.getSprintDetail).toHaveBeenCalledTimes(1);
    expect(service.getSprintDetail).toHaveBeenCalledWith(5, 12, 9);
  });

  it('retorna exactamente lo que resuelve SprintsService.getSprintDetail, sin transformarlo', async () => {
    const service = makeService();
    const detalle = { idSprint: 12, idProyecto: 5, tareas: [], hitos: [] };
    service.getSprintDetail.mockResolvedValue(detalle);
    const controller = new SprintsController(service);

    const result = await controller.detail(5, 12, { userId: 9 });

    expect(result).toBe(detalle);
  });

  it('propaga los errores de autorización/negocio que lance SprintsService.getSprintDetail', async () => {
    const service = makeService();
    const error = new Error('no encontrado');
    service.getSprintDetail.mockRejectedValue(error);
    const controller = new SprintsController(service);

    await expect(controller.detail(5, 12, { userId: 9 })).rejects.toBe(error);
  });
});
