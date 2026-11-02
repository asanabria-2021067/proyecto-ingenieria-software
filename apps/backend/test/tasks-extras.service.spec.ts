import { describe, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TasksExtrasService } from '../src/tasks/tasks-extras.service';
import { fakeProjectTx } from './helpers/fake-project-tx';

describe('MEJ-6: checklist (TasksExtrasService)', () => {
  function crear(opts: { autoriza?: boolean; items?: number; existe?: boolean } = {}) {
    const { autoriza = true, items = 0, existe = true } = opts;
    const tx = {
      tareaChecklistItem: {
        count: vi.fn(async () => items),
        create: vi.fn(async () => ({})),
        findMany: vi.fn(async () => [{ idItem: 1, texto: 'a', completado: false }]),
        updateMany: vi.fn(async () => ({ count: existe ? 1 : 0 })),
        deleteMany: vi.fn(async () => ({ count: existe ? 1 : 0 })),
      },
    };
    const auth = {
      assertCanChangeTaskState: vi.fn(async () => {
        if (!autoriza) throw new ForbiddenException('no');
        return { idSprint: 3 };
      }),
      assertCanReadTask: vi.fn(),
    };
    const policy = { assertWriteTx: vi.fn(async () => undefined) };
    const service = new TasksExtrasService({} as never, fakeProjectTx(tx) as never, policy as never, auth as never, {} as never);
    return { service, tx, auth, policy };
  }

  it('crea al final, valida la politica de escritura y devuelve la lista', async () => {
    const { service, tx, policy } = crear({ items: 2 });
    const lista = await service.addItem(1, 5, 9, { texto: 'Revisar' });
    expect(tx.tareaChecklistItem.create).toHaveBeenCalledWith({ data: { idTarea: 5, texto: 'Revisar', orden: 2 } });
    expect(policy.assertWriteTx).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'TAREA_WRITE', 9, { sprintId: 3 });
    expect(lista).toHaveLength(1);
  });

  it('rechaza el elemento 51', async () => {
    const { service, tx } = crear({ items: 50 });
    await expect(service.addItem(1, 5, 9, { texto: 'x' })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.tareaChecklistItem.create).not.toHaveBeenCalled();
  });

  it('quien no es lider ni asignado no puede escribir (403) y nada se guarda', async () => {
    const { service, tx } = crear({ autoriza: false });
    await expect(service.addItem(1, 5, 9, { texto: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.updateItem(1, 5, 1, 9, { completado: true })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.removeItem(1, 5, 1, 9)).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.tareaChecklistItem.create).not.toHaveBeenCalled();
    expect(tx.tareaChecklistItem.updateMany).not.toHaveBeenCalled();
    expect(tx.tareaChecklistItem.deleteMany).not.toHaveBeenCalled();
  });

  it('actualiza solo los campos enviados y 404 si el elemento es de otra tarea', async () => {
    const ok = crear();
    await ok.service.updateItem(1, 5, 1, 9, { completado: true });
    expect(ok.tx.tareaChecklistItem.updateMany).toHaveBeenCalledWith({
      where: { idItem: 1, idTarea: 5 },
      data: { completado: true },
    });
    const faltante = crear({ existe: false });
    await expect(faltante.service.updateItem(1, 5, 1, 9, { texto: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(faltante.service.removeItem(1, 5, 1, 9)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('MEJ-10: historial de la tarea', () => {
  it('traduce los eventos de bitacora a texto y exige poder leer la tarea', async () => {
    const f = (idAuditoria: number, accion: string, valorAnterior: unknown, valorNuevo: unknown) => ({
      idAuditoria,
      accion,
      fechaEvento: new Date('2026-11-10T10:00:00.000Z'),
      detalleJson: { idProyecto: 1, valorAnterior, valorNuevo },
      usuario: { idUsuario: 1, nombre: 'Ana', apellido: 'Paz' },
    });
    const prisma = {
      bitacoraAuditoria: {
        findMany: vi.fn(async () => [
          f(5, 'TASK_UPDATED', { fechaLimite: '2026-12-01' }, { fechaLimite: '2026-12-05' }),
          f(4, 'TASK_REASSIGNED', { idUsuario: 2 }, { idUsuario: 3 }),
          f(3, 'TASK_ASSIGNED', { idUsuario: null }, { idUsuario: 2 }),
          f(2, 'TASK_STATUS_CHANGED', { estadoTarea: 'POR_HACER' }, { estadoTarea: 'EN_PROGRESO' }),
          f(1, 'TASK_CREATED', null, { tituloTarea: 'x' }),
        ]),
      },
      usuario: {
        findMany: vi.fn(async () => [
          { idUsuario: 2, nombre: 'Luis', apellido: 'Gil' },
          { idUsuario: 3, nombre: 'Eva', apellido: 'Soto' },
        ]),
      },
    };
    const auth = { assertCanReadTask: vi.fn(async () => ({ idSprint: 3 })) };
    const readPolicy = { assertRead: vi.fn(async () => ({})) };
    const service = new TasksExtrasService(prisma as never, {} as never, {} as never, auth as never, readPolicy as never);

    const historial = await service.historial(1, 8, 9);

    expect(auth.assertCanReadTask).toHaveBeenCalledWith(1, 8, 9);
    expect(readPolicy.assertRead).toHaveBeenCalledWith(undefined, {
      projectId: 1,
      actorId: 9,
      scope: 'bitacora',
      entitySprintId: 3,
    });
    expect(prisma.bitacoraAuditoria.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tipoObjeto: 'TAREA', idObjeto: '8' }) }),
    );
    expect(historial.map((h) => h.descripcion)).toEqual([
      'cambió la fecha límite de 2026-12-01 a 2026-12-05',
      'reasignó la tarea de Luis Gil a Eva Soto',
      'asignó la tarea a Luis Gil',
      'movió la tarea de Por hacer a En progreso',
      'creó la tarea',
    ]);
    expect(historial[0].actor).toEqual({ idUsuario: 1, nombre: 'Ana', apellido: 'Paz' });
  });

  it('no consulta la bitacora si la lectura es rechazada', async () => {
    const prisma = { bitacoraAuditoria: { findMany: vi.fn() } };
    const auth = { assertCanReadTask: vi.fn().mockRejectedValue(new ForbiddenException('no')) };
    const service = new TasksExtrasService(prisma as never, {} as never, {} as never, auth as never, {} as never);
    await expect(service.historial(1, 8, 9)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.bitacoraAuditoria.findMany).not.toHaveBeenCalled();
  });

  it('no consulta la bitacora si la politica de lectura la niega', async () => {
    const prisma = { bitacoraAuditoria: { findMany: vi.fn() } };
    const auth = { assertCanReadTask: vi.fn(async () => ({ idSprint: 3 })) };
    const readPolicy = { assertRead: vi.fn().mockRejectedValue(new ForbiddenException('no')) };
    const service = new TasksExtrasService(prisma as never, {} as never, {} as never, auth as never, readPolicy as never);
    await expect(service.historial(1, 8, 9)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.bitacoraAuditoria.findMany).not.toHaveBeenCalled();
  });
});
