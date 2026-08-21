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
import { LabelsController } from '../src/labels/labels.controller';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { CreateLabelDto } from '../src/labels/dto/create-label.dto';
import { UpdateLabelDto } from '../src/labels/dto/update-label.dto';
import { LabelsService } from '../src/labels/labels.service';

/**
 * Tarea 31: el proyecto no instala `@nestjs/testing` (ver
 * test/tasks-queries.controller.spec.ts); se inspecciona la metadata real
 * de `@Controller`/`@Get`/`@Post`/`@Patch`/`@Delete`/`@HttpCode` con
 * `Reflect.getMetadata`, y se instancia el controller directamente con un
 * LabelsService simulado para verificar delegación.
 */
function makeService() {
  const service = {
    findAllForProject: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };
  return service as typeof service & LabelsService;
}

const SOURCE = readFileSync(join(__dirname, '../src/labels/labels.controller.ts'), 'utf-8');

describe('LabelsController — metadata de rutas, guard y códigos HTTP (Tarea 31)', () => {
  it('prefijo exacto proyectos/:projectId/etiquetas', () => {
    expect(Reflect.getMetadata(PATH_METADATA, LabelsController)).toBe(
      'proyectos/:projectId/etiquetas',
    );
  });

  it('JwtAuthGuard declarado a nivel de clase (aplica a las 4 rutas)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, LabelsController);
    expect(guards).toEqual([JwtAuthGuard]);
  });

  it('GET en la ruta raíz, código 200 por defecto (sin @HttpCode)', () => {
    expect(Reflect.getMetadata(PATH_METADATA, LabelsController.prototype.findAll)).toBe('/');
    expect(Reflect.getMetadata(METHOD_METADATA, LabelsController.prototype.findAll)).toBe(0); // GET
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, LabelsController.prototype.findAll)).toBeUndefined();
  });

  it('POST en la ruta raíz responde 201 Created', () => {
    expect(Reflect.getMetadata(PATH_METADATA, LabelsController.prototype.create)).toBe('/');
    expect(Reflect.getMetadata(METHOD_METADATA, LabelsController.prototype.create)).toBe(1); // POST
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, LabelsController.prototype.create)).toBe(201);
  });

  it('PATCH usa :labelId, código 200 por defecto', () => {
    expect(Reflect.getMetadata(PATH_METADATA, LabelsController.prototype.update)).toBe(':labelId');
    expect(Reflect.getMetadata(METHOD_METADATA, LabelsController.prototype.update)).toBe(4); // PATCH
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, LabelsController.prototype.update)).toBeUndefined();
  });

  it('DELETE usa :labelId, responde 204 No Content', () => {
    expect(Reflect.getMetadata(PATH_METADATA, LabelsController.prototype.remove)).toBe(':labelId');
    expect(Reflect.getMetadata(METHOD_METADATA, LabelsController.prototype.remove)).toBe(3); // DELETE
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, LabelsController.prototype.remove)).toBe(204);
  });

  it('projectId usa ParseIntPipe en las 4 rutas; labelId usa ParseIntPipe en PATCH/DELETE', () => {
    const ocurrenciasProjectId = SOURCE.match(/@Param\('projectId', ParseIntPipe\)/g) ?? [];
    const ocurrenciasLabelId = SOURCE.match(/@Param\('labelId', ParseIntPipe\)/g) ?? [];
    expect(ocurrenciasProjectId).toHaveLength(4);
    expect(ocurrenciasLabelId).toHaveLength(2);
  });

  it('el actor proviene de @CurrentUser() en las 4 rutas; ningún handler lee el body en busca de un actor', () => {
    const ocurrenciasCurrentUser = SOURCE.match(/@CurrentUser\(\) user:/g) ?? [];
    expect(ocurrenciasCurrentUser).toHaveLength(4);
    expect(SOURCE).not.toMatch(/userId:\s*dto\./);
  });

  it('create usa CreateLabelDto y update usa UpdateLabelDto', () => {
    expect(SOURCE).toMatch(/@Body\(\) dto: CreateLabelDto/);
    expect(SOURCE).toMatch(/@Body\(\) dto: UpdateLabelDto/);
  });
});

describe('LabelsController — delegación exacta en LabelsService (Tarea 31)', () => {
  it('findAll delega en findAllForProject con projectId y userId, y retorna el resultado sin transformar', async () => {
    const service = makeService();
    const resultado = [{ idEtiqueta: 1, nombreEtiqueta: 'Backend', color: '#10B981' }];
    service.findAllForProject.mockResolvedValue(resultado);
    const controller = new LabelsController(service);

    const respuesta = await controller.findAll(5, { userId: 9 });

    expect(service.findAllForProject).toHaveBeenCalledWith(5, 9);
    expect(respuesta).toBe(resultado);
  });

  it('create delega en create con projectId, userId y el DTO exacto', async () => {
    const service = makeService();
    const creada = { idEtiqueta: 1, nombreEtiqueta: 'Backend', color: '#10B981' };
    service.create.mockResolvedValue(creada);
    const controller = new LabelsController(service);
    const dto: CreateLabelDto = { nombreEtiqueta: 'Backend', color: '#10B981' };

    const respuesta = await controller.create(5, { userId: 9 }, dto);

    expect(service.create).toHaveBeenCalledWith(5, 9, dto);
    expect(respuesta).toBe(creada);
  });

  it('update delega en update con projectId, labelId, userId y el DTO exacto', async () => {
    const service = makeService();
    const editada = { idEtiqueta: 1, nombreEtiqueta: 'Nuevo', color: '#10B981' };
    service.update.mockResolvedValue(editada);
    const controller = new LabelsController(service);
    const dto: UpdateLabelDto = { nombreEtiqueta: 'Nuevo' };

    const respuesta = await controller.update(5, 1, { userId: 9 }, dto);

    expect(service.update).toHaveBeenCalledWith(5, 1, 9, dto);
    expect(respuesta).toBe(editada);
  });

  it('remove delega en remove con projectId, labelId y userId, y no retorna body', async () => {
    const service = makeService();
    service.remove.mockResolvedValue(undefined);
    const controller = new LabelsController(service);

    const respuesta = await controller.remove(5, 1, { userId: 9 });

    expect(service.remove).toHaveBeenCalledWith(5, 1, 9);
    expect(respuesta).toBeUndefined();
  });

  it('propaga ForbiddenException del service sin envolverla (create)', async () => {
    const service = makeService();
    service.create.mockRejectedValue(new ForbiddenException('No eres el líder de este proyecto'));
    const controller = new LabelsController(service);

    await expect(
      controller.create(5, { userId: 9 }, { nombreEtiqueta: 'X', color: '#000000' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('propaga NotFoundException del service sin envolverla (update)', async () => {
    const service = makeService();
    service.update.mockRejectedValue(new NotFoundException('Etiqueta no encontrada'));
    const controller = new LabelsController(service);

    await expect(controller.update(5, 999, { userId: 9 }, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('propaga errores del service sin envolverlos (remove)', async () => {
    const service = makeService();
    service.remove.mockRejectedValue(new NotFoundException('Etiqueta no encontrada'));
    const controller = new LabelsController(service);

    await expect(controller.remove(5, 999, { userId: 9 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
