import { describe, expect, it, vi } from 'vitest';
import { RepeticionTarea } from '@prisma/client';
import { TasksRecurrenceService } from '../src/tasks/tasks-recurrence.service';

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('MEJ-47: TasksRecurrenceService', () => {
  const maestra = (extra: Record<string, unknown> = {}) => ({
    idTarea: 10,
    idProyecto: 1,
    idHito: 4,
    idRolProyecto: null,
    tituloTarea: 'Standup',
    descripcionTarea: null,
    prioridad: 'MEDIA',
    tiempoEstimadoHoras: 1,
    puntosHistoria: null,
    creadaPor: 1,
    repeticion: RepeticionTarea.SEMANAL,
    repeticionProxima: dia('2026-11-10'),
    etiquetas: [{ idEtiqueta: 3 }],
    checklist: [{ texto: 'a', orden: 0 }],
    ...extra,
  });

  function crear(opts: { sprint?: boolean; reservada?: number; fila?: unknown } = {}) {
    const { sprint = true, reservada = 1, fila = maestra() } = opts;
    const tx = {
      tarea: {
        findFirst: vi.fn(async () => fila),
        updateMany: vi.fn(async () => ({ count: reservada })),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ idTarea: 11, estadoTarea: 'POR_HACER', ...data })),
        findMany: vi.fn(async () => []),
      },
      sprint: { findFirst: vi.fn(async () => (sprint ? { idSprint: 5 } : null)) },
      tareaEtiqueta: { createMany: vi.fn(async () => ({})) },
      tareaChecklistItem: { createMany: vi.fn(async () => ({})) },
      hito: { update: vi.fn(async () => ({})) },
    };
    const prisma = {
      tarea: { findMany: vi.fn(async () => [{ idTarea: 10 }]) },
      $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
    };
    const bitacora = { registrarEvento: vi.fn(async () => undefined) };
    return { service: new TasksRecurrenceService(prisma as never, bitacora as never), tx, prisma, bitacora };
  }

  it('crea una copia en el sprint activo y adelanta la proxima ocurrencia', async () => {
    const { service, tx, bitacora } = crear();
    const creadas = await service.generarTareasRepetitivas(new Date('2026-11-10T14:00:00.000Z'));
    expect(creadas).toBe(1);
    expect(tx.tarea.updateMany).toHaveBeenCalledWith({
      where: { idTarea: 10, repeticionProxima: dia('2026-11-10') },
      data: { repeticionProxima: dia('2026-11-17') },
    });
    expect(tx.tarea.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        idSprint: 5,
        idTareaOrigen: 10,
        estadoTarea: 'POR_HACER',
        fechaLimite: dia('2026-11-10'),
        tituloTarea: 'Standup',
      }),
    });
    expect(tx.tarea.create.mock.calls[0][0].data).not.toHaveProperty('repeticion');
    expect(tx.tareaEtiqueta.createMany).toHaveBeenCalled();
    expect(tx.tareaChecklistItem.createMany).toHaveBeenCalledWith({ data: [{ idTarea: 11, texto: 'a', orden: 0 }] });
    expect(tx.hito.update).toHaveBeenCalled();
    expect(bitacora.registrarEvento).toHaveBeenCalledWith(expect.objectContaining({ tipoEvento: 'TASK_CREATED', idEntidad: 11 }));
  });

  it('tras dias sin correr crea una sola copia con fecha de hoy y salta a futuro', async () => {
    const { service, tx } = crear({ fila: maestra({ repeticion: RepeticionTarea.DIARIA, repeticionProxima: dia('2026-11-05') }) });
    await service.generarTareasRepetitivas(new Date('2026-11-10T14:00:00.000Z'));
    expect(tx.tarea.updateMany.mock.calls[0][0].data).toEqual({ repeticionProxima: dia('2026-11-11') });
    expect(tx.tarea.create.mock.calls[0][0].data.fechaLimite).toEqual(dia('2026-11-10'));
    expect(tx.tarea.create).toHaveBeenCalledTimes(1);
  });

  it('sin sprint activo no crea ni adelanta nada', async () => {
    const { service, tx } = crear({ sprint: false });
    expect(await service.generarTareasRepetitivas(new Date('2026-11-10T14:00:00.000Z'))).toBe(0);
    expect(tx.tarea.updateMany).not.toHaveBeenCalled();
    expect(tx.tarea.create).not.toHaveBeenCalled();
  });

  it('ignora maestras en un Sprint CERRADO (ya no se pueden detener)', async () => {
    const { service, prisma, tx } = crear();
    await service.generarTareasRepetitivas(new Date('2026-11-10T14:00:00.000Z'));
    const filtro = { OR: [{ idSprint: null }, { sprint: { estado: { not: 'CERRADO' } } }] };
    expect(prisma.tarea.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining(filtro) }));
    expect(tx.tarea.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining(filtro) }));
  });

  it('si otra corrida ya reservo la ocurrencia no duplica', async () => {
    const { service, tx } = crear({ reservada: 0 });
    expect(await service.generarTareasRepetitivas(new Date('2026-11-10T14:00:00.000Z'))).toBe(0);
    expect(tx.tarea.create).not.toHaveBeenCalled();
  });

  it('un fallo en una tarea no detiene el job', async () => {
    const { service, prisma } = crear();
    prisma.$transaction.mockRejectedValueOnce(new Error('boom'));
    expect(await service.generarTareasRepetitivas(new Date('2026-11-10T14:00:00.000Z'))).toBe(0);
  });
});
