import { describe, expect, it, vi } from 'vitest';
import { EstadoSprint } from '@prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import { SprintSnapshotsService } from '../src/sprints/sprint-snapshots.service';

function makePrisma() {
  return {
    tarea: { findMany: vi.fn().mockResolvedValue([]) },
    sprint: { findMany: vi.fn().mockResolvedValue([]) },
    instantaneaSprint: { upsert: vi.fn().mockResolvedValue({ idInstantanea: 1 }) },
  };
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new SprintSnapshotsService(prisma as unknown as PrismaService);
}

describe('SprintSnapshotsService.generarInstantaneaDelDia', () => {
  it('separa pendientes/completadas y suma puntosHistoria solo de las NO HECHO (null cuenta como 0)', async () => {
    const prisma = makePrisma();
    prisma.tarea.findMany.mockResolvedValue([
      { estadoTarea: 'HECHO', puntosHistoria: 5 },
      { estadoTarea: 'EN_PROGRESO', puntosHistoria: 3 },
      { estadoTarea: 'POR_HACER', puntosHistoria: null },
      { estadoTarea: 'EN_REVISION', puntosHistoria: 2 },
    ]);
    const service = makeService(prisma);

    await service.generarInstantaneaDelDia(99);

    expect(prisma.instantaneaSprint.upsert).toHaveBeenCalledTimes(1);
    const llamada = prisma.instantaneaSprint.upsert.mock.calls[0][0];
    expect(llamada.create).toMatchObject({
      idSprint: 99,
      tareasPendientes: 3,
      tareasCompletadas: 1,
      // 3 (EN_PROGRESO) + 0 (POR_HACER, null->0) + 2 (EN_REVISION) = 5
      puntosHistoriaRestantes: 5,
    });
    expect(llamada.update).toMatchObject({
      tareasPendientes: 3,
      tareasCompletadas: 1,
      puntosHistoriaRestantes: 5,
    });
  });

  it('filtra por idSprint y excluye tareas eliminadas', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);

    await service.generarInstantaneaDelDia(7);

    expect(prisma.tarea.findMany).toHaveBeenCalledWith({
      where: { idSprint: 7, eliminadoEn: null },
      select: { estadoTarea: true, puntosHistoria: true },
    });
  });

  it('el upsert usa la clave compuesta (idSprint, fecha) — nunca puede apuntar a una fecha que no sea hoy', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);

    const antes = new Date();
    await service.generarInstantaneaDelDia(7);
    const despues = new Date();

    const llamada = prisma.instantaneaSprint.upsert.mock.calls[0][0];
    const fecha: Date = llamada.where.idSprint_fecha.fecha;
    expect(llamada.where.idSprint_fecha.idSprint).toBe(7);
    // La fecha calculada es el día calendario UTC de "ahora", sin hora — por
    // construcción nunca puede ser una fecha pasada ni futura respecto a la
    // ejecución real.
    expect(fecha.getTime()).toBeGreaterThanOrEqual(
      Date.UTC(antes.getUTCFullYear(), antes.getUTCMonth(), antes.getUTCDate()),
    );
    expect(fecha.getTime()).toBeLessThanOrEqual(
      Date.UTC(despues.getUTCFullYear(), despues.getUTCMonth(), despues.getUTCDate()),
    );
  });

  it('un Sprint sin tareas produce una instantánea en cero, nunca lanza', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);

    await expect(service.generarInstantaneaDelDia(7)).resolves.toBeDefined();
    const llamada = prisma.instantaneaSprint.upsert.mock.calls[0][0];
    expect(llamada.create).toMatchObject({
      tareasPendientes: 0,
      tareasCompletadas: 0,
      puntosHistoriaRestantes: 0,
    });
  });
});

describe('SprintSnapshotsService.generarInstantaneasDiarias (cron)', () => {
  it('genera instantánea solo para Sprints ACTIVO, nunca EN_FINALIZACION/CERRADO', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);
    const spy = vi.spyOn(service, 'generarInstantaneaDelDia').mockResolvedValue({} as any);
    prisma.sprint.findMany.mockResolvedValue([{ idSprint: 1 }, { idSprint: 2 }]);

    await service.generarInstantaneasDiarias();

    expect(prisma.sprint.findMany).toHaveBeenCalledWith({
      where: { estado: EstadoSprint.ACTIVO },
      select: { idSprint: true },
    });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith(1);
    expect(spy).toHaveBeenCalledWith(2);
  });

  it('un Sprint que falla no aborta el resto del lote', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);
    prisma.sprint.findMany.mockResolvedValue([{ idSprint: 1 }, { idSprint: 2 }]);
    const spy = vi
      .spyOn(service, 'generarInstantaneaDelDia')
      .mockRejectedValueOnce(new Error('DB caída'))
      .mockResolvedValueOnce({} as any);

    await expect(service.generarInstantaneasDiarias()).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('sin Sprints activos no falla y no hace ningún upsert', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);
    prisma.sprint.findMany.mockResolvedValue([]);

    await service.generarInstantaneasDiarias();

    expect(prisma.instantaneaSprint.upsert).not.toHaveBeenCalled();
  });
});
