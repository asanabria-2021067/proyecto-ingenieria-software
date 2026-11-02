import { describe, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PlantillasTareaService } from '../src/tasks/plantillas-tarea.service';
import { fakeProjectTx } from './helpers/fake-project-tx';

describe('MEJ-52: plantillas (PlantillasTareaService)', () => {
  function crear(opts: { cantidad?: number; lider?: boolean } = {}) {
    const { cantidad = 0, lider = true } = opts;
    const tx = {
      plantillaTarea: {
        count: vi.fn(async () => cantidad),
        create: vi.fn(async ({ data }: { data: unknown }) => data),
        deleteMany: vi.fn(async () => ({ count: 0 })),
      },
    };
    const prisma = { plantillaTarea: { findMany: vi.fn(async () => []) } };
    const auth = { assertCanListProjectTasks: vi.fn(async () => undefined) };
    const context = {
      assertProjectLeader: vi.fn(async () => {
        if (!lider) throw new ForbiddenException('no');
      }),
    };
    const policy = { assertWriteTx: vi.fn(async () => undefined) };
    const readPolicy = { assertRead: vi.fn(async () => ({})) };
    const service = new PlantillasTareaService(
      prisma as never,
      auth as never,
      context as never,
      fakeProjectTx(tx) as never,
      policy as never,
      readPolicy as never,
    );
    return { service, tx, auth, context, policy, readPolicy };
  }

  it('el listado exige la politica de lectura y leer el tablero', async () => {
    const { service, auth, readPolicy } = crear();
    await service.list(1, 9);
    expect(readPolicy.assertRead).toHaveBeenCalledWith(undefined, { projectId: 1, actorId: 9, scope: 'tareas' });
    expect(auth.assertCanListProjectTasks).toHaveBeenCalledWith(1, 9);

    readPolicy.assertRead.mockRejectedValue(new ForbiddenException('no'));
    await expect(service.list(1, 9)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('solo el lider crea y borra, con la politica de escritura dentro del lock del proyecto', async () => {
    const { service, tx, context, policy } = crear();
    await service.create(1, 9, { nombre: 'Bug', tituloTarea: 'Corregir', prioridad: 'ALTA', checklist: ['a'] });
    expect(context.assertProjectLeader).toHaveBeenCalledWith(1, 9, tx);
    expect(policy.assertWriteTx).toHaveBeenCalledWith(tx, { idProyecto: 1 }, 'ETIQUETA_CRUD', 9);
    expect(tx.plantillaTarea.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ idProyecto: 1, creadaPor: 9, checklist: ['a'], tiempoEstimadoHoras: null }),
    });

    await expect(service.remove(1, 4, 9)).rejects.toBeInstanceOf(NotFoundException);
    expect(policy.assertWriteTx).toHaveBeenCalledTimes(2);

    const ajeno = crear({ lider: false });
    await expect(ajeno.service.create(1, 8, { nombre: 'x', tituloTarea: 'x', prioridad: 'BAJA' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(ajeno.service.remove(1, 4, 8)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('limita a 30 plantillas por proyecto', async () => {
    const { service, tx } = crear({ cantidad: 30 });
    await expect(service.create(1, 9, { nombre: 'x', tituloTarea: 'x', prioridad: 'BAJA' })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.plantillaTarea.create).not.toHaveBeenCalled();
  });
});
