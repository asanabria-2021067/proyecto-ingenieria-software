import { describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LabelsService } from '../src/labels/labels.service';

/**
 * Tarea 31: el índice único compuesto `Etiqueta(idProyecto,
 * nombreNormalizado)` puede rechazar una segunda inserción/edición
 * concurrente. Reproducido empíricamente contra PostgreSQL real (ver
 * reporte final de la tarea) antes de escribir estas pruebas: Prisma
 * 6.19.2 entrega, para esa violación específica,
 *
 *   PrismaClientKnownRequestError { code: 'P2002',
 *     meta: { modelName: 'Etiqueta', target: ['id_proyecto', 'nombre_normalizado'] } }
 *
 * Estos helpers construyen la CLASE REAL de Prisma (no un objeto
 * `{ code: 'P2002' }` falso) para que las pruebas representen fielmente lo
 * que producción realmente recibiría.
 */
function makeLabelNameCollisionError() {
  return new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed on the fields: (`id_proyecto`,`nombre_normalizado`)',
    {
      code: 'P2002',
      clientVersion: '6.19.2',
      meta: { modelName: 'Etiqueta', target: ['id_proyecto', 'nombre_normalizado'] },
    },
  );
}

function makeOtherModelP2002Error() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`correo`)', {
    code: 'P2002',
    clientVersion: '6.19.2',
    meta: { modelName: 'Usuario', target: ['correo'] },
  });
}

function makeLabelOtherTargetP2002Error() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.19.2',
    meta: { modelName: 'Etiqueta', target: ['id_etiqueta'] },
  });
}

function makeLabelNoTargetP2002Error() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.19.2',
    meta: { modelName: 'Etiqueta', constraint: 'alguna_otra_constraint' },
  });
}

function makeForeignKeyError() {
  return new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
    code: 'P2003',
    clientVersion: '6.19.2',
    meta: { modelName: 'Etiqueta', constraint: 'etiqueta_id_proyecto_fkey' },
  });
}

function makeRecordNotFoundError() {
  return new Prisma.PrismaClientKnownRequestError(
    'An operation failed because it depends on one or more records that were required but not found',
    { code: 'P2025', clientVersion: '6.19.2', meta: { modelName: 'Etiqueta' } },
  );
}

function makeConnectionError() {
  return new Prisma.PrismaClientInitializationError('Cannot reach database server', '6.19.2', 'P1001');
}

const PROJECT_ID = 5;
const LEADER_ID = 1;
const LABEL_ID = 10;

function makePrisma() {
  return {
    proyecto: { findFirst: vi.fn().mockResolvedValue({ idProyecto: PROJECT_ID, creadoPor: LEADER_ID }) },
    participacionProyecto: { findFirst: vi.fn() },
    etiqueta: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    tareaEtiqueta: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  } as any;
}

describe('LabelsService — detección de conflicto Prisma en creación (Tarea 31)', () => {
  it('P2002 exacto de Etiqueta(idProyecto, nombreNormalizado) se traduce a ConflictException', async () => {
    const prisma = makePrisma();
    prisma.etiqueta.create.mockRejectedValue(makeLabelNameCollisionError());
    const service = new LabelsService(prisma);

    await expect(
      service.create(PROJECT_ID, LEADER_ID, { nombreEtiqueta: 'Backend', color: '#10B981' } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('el mensaje público no expone metadata de Prisma', async () => {
    const prisma = makePrisma();
    prisma.etiqueta.create.mockRejectedValue(makeLabelNameCollisionError());
    const service = new LabelsService(prisma);

    try {
      await service.create(PROJECT_ID, LEADER_ID, { nombreEtiqueta: 'Backend', color: '#10B981' } as any);
      throw new Error('no debía resolver');
    } catch (error: any) {
      const mensaje = JSON.stringify(error.getResponse());
      expect(mensaje).not.toMatch(/P2002/);
      expect(mensaje).not.toMatch(/nombre_normalizado/);
      expect(mensaje).not.toMatch(/prisma/i);
      expect(mensaje).not.toMatch(/SQL/i);
    }
  });

  it('P2002 de otro modelo (Usuario) se propaga sin cambios', async () => {
    const prisma = makePrisma();
    const error = makeOtherModelP2002Error();
    prisma.etiqueta.create.mockRejectedValue(error);
    const service = new LabelsService(prisma);

    await expect(
      service.create(PROJECT_ID, LEADER_ID, { nombreEtiqueta: 'Backend', color: '#10B981' } as any),
    ).rejects.toBe(error);
  });

  it('P2002 de Etiqueta con otro target se propaga sin cambios', async () => {
    const prisma = makePrisma();
    const error = makeLabelOtherTargetP2002Error();
    prisma.etiqueta.create.mockRejectedValue(error);
    const service = new LabelsService(prisma);

    await expect(
      service.create(PROJECT_ID, LEADER_ID, { nombreEtiqueta: 'Backend', color: '#10B981' } as any),
    ).rejects.toBe(error);
  });

  it('P2002 de Etiqueta sin target (constraint) se propaga sin cambios', async () => {
    const prisma = makePrisma();
    const error = makeLabelNoTargetP2002Error();
    prisma.etiqueta.create.mockRejectedValue(error);
    const service = new LabelsService(prisma);

    await expect(
      service.create(PROJECT_ID, LEADER_ID, { nombreEtiqueta: 'Backend', color: '#10B981' } as any),
    ).rejects.toBe(error);
  });

  it('P2003 (FK) se propaga sin cambios', async () => {
    const prisma = makePrisma();
    const error = makeForeignKeyError();
    prisma.etiqueta.create.mockRejectedValue(error);
    const service = new LabelsService(prisma);

    await expect(
      service.create(PROJECT_ID, LEADER_ID, { nombreEtiqueta: 'Backend', color: '#10B981' } as any),
    ).rejects.toBe(error);
  });

  it('P2025 (registro no encontrado) se propaga sin cambios', async () => {
    const prisma = makePrisma();
    const error = makeRecordNotFoundError();
    prisma.etiqueta.create.mockRejectedValue(error);
    const service = new LabelsService(prisma);

    await expect(
      service.create(PROJECT_ID, LEADER_ID, { nombreEtiqueta: 'Backend', color: '#10B981' } as any),
    ).rejects.toBe(error);
  });

  it('error de conexión (PrismaClientInitializationError) se propaga sin cambios', async () => {
    const prisma = makePrisma();
    const error = makeConnectionError();
    prisma.etiqueta.create.mockRejectedValue(error);
    const service = new LabelsService(prisma);

    await expect(
      service.create(PROJECT_ID, LEADER_ID, { nombreEtiqueta: 'Backend', color: '#10B981' } as any),
    ).rejects.toBe(error);
  });

  it('Error genérico se propaga sin cambios', async () => {
    const prisma = makePrisma();
    const error = new Error('fallo inesperado');
    prisma.etiqueta.create.mockRejectedValue(error);
    const service = new LabelsService(prisma);

    await expect(
      service.create(PROJECT_ID, LEADER_ID, { nombreEtiqueta: 'Backend', color: '#10B981' } as any),
    ).rejects.toBe(error);
  });

  it.each([undefined, null, 'x', 123, {}, []])(
    'un valor inesperado lanzado (%j) no rompe el detector: se propaga tal cual',
    async (valorLanzado) => {
      const prisma = makePrisma();
      prisma.etiqueta.create.mockRejectedValue(valorLanzado);
      const service = new LabelsService(prisma);

      await expect(
        service.create(PROJECT_ID, LEADER_ID, { nombreEtiqueta: 'Backend', color: '#10B981' } as any),
      ).rejects.toBe(valorLanzado);
    },
  );
});

describe('LabelsService — detección de conflicto Prisma en edición (Tarea 31)', () => {
  function stubEtiquetaActual(prisma: ReturnType<typeof makePrisma>) {
    prisma.etiqueta.findFirst.mockResolvedValue({
      idEtiqueta: LABEL_ID,
      nombreEtiqueta: 'Backend',
      color: '#10B981',
    });
  }

  it('P2002 exacto de Etiqueta(idProyecto, nombreNormalizado) se traduce a ConflictException', async () => {
    const prisma = makePrisma();
    stubEtiquetaActual(prisma);
    prisma.etiqueta.update.mockRejectedValue(makeLabelNameCollisionError());
    const service = new LabelsService(prisma);

    await expect(
      service.update(PROJECT_ID, LABEL_ID, LEADER_ID, { nombreEtiqueta: 'Urgente' } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('P2002 de otro modelo se propaga sin cambios', async () => {
    const prisma = makePrisma();
    stubEtiquetaActual(prisma);
    const error = makeOtherModelP2002Error();
    prisma.etiqueta.update.mockRejectedValue(error);
    const service = new LabelsService(prisma);

    await expect(
      service.update(PROJECT_ID, LABEL_ID, LEADER_ID, { nombreEtiqueta: 'Urgente' } as any),
    ).rejects.toBe(error);
  });

  it('P2003/P2025 se propagan sin cambios', async () => {
    const prisma = makePrisma();
    stubEtiquetaActual(prisma);
    const errorFk = makeForeignKeyError();
    prisma.etiqueta.update.mockRejectedValueOnce(errorFk);
    const service = new LabelsService(prisma);

    await expect(
      service.update(PROJECT_ID, LABEL_ID, LEADER_ID, { nombreEtiqueta: 'Urgente' } as any),
    ).rejects.toBe(errorFk);
  });
});

describe('LabelsService — carrera concurrente (Tarea 31)', () => {
  it('dos creaciones concurrentes con nombres equivalentes en el mismo proyecto: una éxito, una 409', async () => {
    const prisma = makePrisma();
    const ganadora = { idEtiqueta: 1, nombreEtiqueta: 'Frontend', color: '#10B981' };
    // Simula la garantía real del índice único: la primera llamada que
    // "llega" a la base gana; la segunda observa la violación P2002 ya
    // confirmada empíricamente para este índice.
    let primeraLlamada = true;
    prisma.etiqueta.create.mockImplementation(async () => {
      if (primeraLlamada) {
        primeraLlamada = false;
        return ganadora;
      }
      throw makeLabelNameCollisionError();
    });
    const service = new LabelsService(prisma);

    const [resultadoA, resultadoB] = await Promise.allSettled([
      service.create(PROJECT_ID, LEADER_ID, { nombreEtiqueta: 'Frontend', color: '#10B981' } as any),
      service.create(PROJECT_ID, LEADER_ID, { nombreEtiqueta: ' frontend ', color: '#000000' } as any),
    ]);

    const exitosas = [resultadoA, resultadoB].filter((r) => r.status === 'fulfilled');
    const rechazadas = [resultadoA, resultadoB].filter((r) => r.status === 'rejected');
    expect(exitosas).toHaveLength(1);
    expect(rechazadas).toHaveLength(1);
    expect((rechazadas[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
    expect((exitosas[0] as PromiseFulfilledResult<unknown>).value).toEqual(ganadora);
    expect(prisma.etiqueta.create).toHaveBeenCalledTimes(2);
  });

  it('el ganador de la carrera no se modifica ni se reintenta la operación perdedora', async () => {
    const prisma = makePrisma();
    const ganadora = { idEtiqueta: 1, nombreEtiqueta: 'Frontend', color: '#10B981' };
    prisma.etiqueta.create.mockResolvedValueOnce(ganadora).mockRejectedValueOnce(makeLabelNameCollisionError());
    const service = new LabelsService(prisma);

    await service.create(PROJECT_ID, LEADER_ID, { nombreEtiqueta: 'Frontend', color: '#10B981' } as any);
    await expect(
      service.create(PROJECT_ID, LEADER_ID, { nombreEtiqueta: 'FRONTEND', color: '#000000' } as any),
    ).rejects.toBeInstanceOf(ConflictException);

    // Ninguna llamada adicional (sin reintento automático) más allá de las 2 explícitas.
    expect(prisma.etiqueta.create).toHaveBeenCalledTimes(2);
  });

  it('dos proyectos distintos pueden crear concurrentemente el mismo nombre normalizado sin conflicto entre ellos', async () => {
    const prisma = makePrisma();
    prisma.etiqueta.create
      .mockResolvedValueOnce({ idEtiqueta: 1, nombreEtiqueta: 'Frontend', color: '#10B981' })
      .mockResolvedValueOnce({ idEtiqueta: 2, nombreEtiqueta: 'Frontend', color: '#000000' });
    const service = new LabelsService(prisma);

    const [a, b] = await Promise.all([
      service.create(5, LEADER_ID, { nombreEtiqueta: 'Frontend', color: '#10B981' } as any),
      service.create(6, LEADER_ID, { nombreEtiqueta: 'Frontend', color: '#000000' } as any),
    ]);

    expect(a.idEtiqueta).toBe(1);
    expect(b.idEtiqueta).toBe(2);
  });
});
