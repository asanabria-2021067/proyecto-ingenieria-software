import { describe, expect, it, vi } from 'vitest';
import { HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ProjectsController } from '../src/projects/projects.controller';

function makeService() {
  return { createHito: vi.fn() } as any;
}

describe('ProjectsController.createHito (POST /proyectos/:id/hitos)', () => {
  it('está registrado como POST en la ruta :id/hitos', () => {
    expect(Reflect.getMetadata(PATH_METADATA, ProjectsController.prototype.createHito)).toBe(
      ':id/hitos',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, ProjectsController.prototype.createHito)).toBe(1); // POST
  });

  it('responde con 201 Created', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, ProjectsController.prototype.createHito)).toBe(
      201,
    );
  });

  it('delega en ProjectsService.createHito con id, userId (CurrentUser) y el dto', () => {
    const service = makeService();
    const controller = new ProjectsController(service);
    const dto = { tituloHito: 'Entrega de MVP' } as any;

    controller.createHito(5, dto, { userId: 9 });

    expect(service.createHito).toHaveBeenCalledWith(5, 9, dto);
  });

  it('retorna exactamente lo que resuelve ProjectsService.createHito, sin transformarlo', async () => {
    const service = makeService();
    const hitoCreado = { idHito: 10, tituloHito: 'Entrega de MVP' };
    service.createHito.mockResolvedValue(hitoCreado);
    const controller = new ProjectsController(service);

    const result = await controller.createHito(5, {} as any, { userId: 9 });

    expect(result).toBe(hitoCreado);
  });

  it('propaga los errores de autorización/validación que lance ProjectsService.createHito', async () => {
    const service = makeService();
    const error = new Error('no eres el líder');
    service.createHito.mockRejectedValue(error);
    const controller = new ProjectsController(service);

    await expect(controller.createHito(5, {} as any, { userId: 9 })).rejects.toBe(error);
  });
});
