import { describe, expect, it, vi } from 'vitest';
import { HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ProjectsController } from '../src/projects/projects.controller';
import { CreateHitoDto } from '../src/projects/dto/create-hito.dto';

function makeService() {
  return { createHito: vi.fn() };
}

function makeController(service: ReturnType<typeof makeService>) {
  return new ProjectsController(
    service as unknown as ConstructorParameters<typeof ProjectsController>[0],
  );
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
    const controller = makeController(service);
    const dto: CreateHitoDto = { tituloHito: 'Entrega de MVP' };

    controller.createHito(5, dto, { userId: 9 });

    expect(service.createHito).toHaveBeenCalledWith(5, 9, dto);
  });

  it('retorna exactamente lo que resuelve ProjectsService.createHito, sin transformarlo', async () => {
    const service = makeService();
    const hitoCreado = { idHito: 10, tituloHito: 'Entrega de MVP' };
    service.createHito.mockResolvedValue(hitoCreado);
    const controller = makeController(service);

    const result = await controller.createHito(5, {} as CreateHitoDto, { userId: 9 });

    expect(result).toBe(hitoCreado);
  });

  it('propaga los errores de autorización/validación que lance ProjectsService.createHito', async () => {
    const service = makeService();
    const error = new Error('no eres el líder');
    service.createHito.mockRejectedValue(error);
    const controller = makeController(service);

    await expect(controller.createHito(5, {} as CreateHitoDto, { userId: 9 })).rejects.toBe(error);
  });
});
