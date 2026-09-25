import { describe, expect, it, vi } from 'vitest';
import { HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { validate } from 'class-validator';
import { ProjectsController } from '../src/projects/projects.controller';
import { AssignHitoTasksDto } from '../src/projects/dto/assign-hito-tasks.dto';

function makeService() {
  return {
    assignHitoTasks: vi.fn(),
  };
}

function makeController(service: ReturnType<typeof makeService>) {
  return new ProjectsController(
    service as unknown as ConstructorParameters<typeof ProjectsController>[0],
  );
}

describe('ProjectsController.assignHitoTasks', () => {
  it('esta registrado como POST en :id/hitos/:idHito/tareas', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, ProjectsController.prototype.assignHitoTasks),
    ).toBe(':id/hitos/:idHito/tareas');

    expect(
      Reflect.getMetadata(METHOD_METADATA, ProjectsController.prototype.assignHitoTasks),
    ).toBe(1);
  });

  it('responde con 200 OK', () => {
    expect(
      Reflect.getMetadata(HTTP_CODE_METADATA, ProjectsController.prototype.assignHitoTasks),
    ).toBe(200);
  });

  it('delega proyecto, hito, usuario e ids de tareas al service', () => {
    const service = makeService();
    const controller = makeController(service);
    const dto: AssignHitoTasksDto = { idsTareas: [11, 12, 13] };

    controller.assignHitoTasks(5, 8, dto, { userId: 9 });

    expect(service.assignHitoTasks).toHaveBeenCalledOnce();
    expect(service.assignHitoTasks).toHaveBeenCalledWith(5, 8, 9, [11, 12, 13]);
  });

  it('retorna sin transformar el resultado del service', async () => {
    const service = makeService();
    const expected = { idHito: 8, idsTareasAsignadas: [11, 12] };
    service.assignHitoTasks.mockResolvedValue(expected);
    const controller = makeController(service);

    const result = await controller.assignHitoTasks(
      5,
      8,
      { idsTareas: [11, 12] },
      { userId: 9 },
    );

    expect(result).toBe(expected);
  });
});

describe('AssignHitoTasksDto', () => {
  async function errorsFor(value: unknown) {
    const dto = Object.assign(new AssignHitoTasksDto(), value);
    return validate(dto);
  }

  it('acepta una lista no vacia de ids positivos y unicos', async () => {
    await expect(errorsFor({ idsTareas: [1, 2, 3] })).resolves.toHaveLength(0);
  });

  it('rechaza una lista vacia', async () => {
    expect(await errorsFor({ idsTareas: [] })).not.toHaveLength(0);
  });

  it('rechaza ids duplicados', async () => {
    expect(await errorsFor({ idsTareas: [1, 1] })).not.toHaveLength(0);
  });

  it('rechaza ids no enteros o menores que uno', async () => {
    expect(await errorsFor({ idsTareas: [0, 1.5] })).not.toHaveLength(0);
  });
});