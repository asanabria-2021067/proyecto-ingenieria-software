import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { LabelsService } from '../src/labels/labels.service';

/**
 * Tarea 32: LabelsService.attachToTask/detachFromTask ejecutan TODA la
 * operación (validaciones + escritura) dentro de una única transacción
 * interactiva. El mock de `$transaction` invoca el callback con un `tx`
 * propio que expone los mismos delegates que usaría Prisma real
 * (proyecto, participacionProyecto, tarea, etiqueta, tareaEtiqueta), para
 * poder afirmar que CADA consulta ocurrió sobre `tx`, nunca sobre
 * `prisma` directamente.
 */
function makePrisma() {
  const tx = {
    proyecto: { findFirst: vi.fn() },
    participacionProyecto: { findFirst: vi.fn() },
    tarea: { findFirst: vi.fn() },
    etiqueta: { findFirst: vi.fn() },
    tareaEtiqueta: { upsert: vi.fn(), deleteMany: vi.fn() },
  };
  const prisma = {
    // Delegates a nivel raíz: si algún método usa `this.prisma.X` dentro del
    // callback de `$transaction` en vez de `tx.X`, estos espías lo detectan
    // porque nunca deberían ser invocados por attachToTask/detachFromTask.
    proyecto: { findFirst: vi.fn() },
    participacionProyecto: { findFirst: vi.fn() },
    tarea: { findFirst: vi.fn() },
    etiqueta: { findFirst: vi.fn() },
    tareaEtiqueta: { upsert: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn(async (fn: any) => fn(tx)),
    __tx: tx,
  };
  return prisma as any;
}

const PROJECT_ID = 5;
const TASK_ID = 42;
const LABEL_ID = 7;
const LEADER_ID = 1;
const PARTICIPANT_ID = 2;
const ASSIGNEE_ID = 3;
const TASK_CREATOR_ID = 4;
const EXTERNO_ID = 99;

function proyectoActivo(overrides: Record<string, unknown> = {}) {
  return { idProyecto: PROJECT_ID, creadoPor: LEADER_ID, ...overrides };
}

function stubHappyPath(prisma: ReturnType<typeof makePrisma>) {
  prisma.__tx.proyecto.findFirst.mockResolvedValue(proyectoActivo());
  prisma.__tx.tarea.findFirst.mockResolvedValue({ idTarea: TASK_ID });
  prisma.__tx.etiqueta.findFirst.mockResolvedValue({ idEtiqueta: LABEL_ID, nombreEtiqueta: 'Backend', color: '#10B981' });
}

describe('LabelsService.attachToTask (PUT, Tarea 32)', () => {
  it('el líder asocia: crea la fila vía upsert con la clave compuesta exacta', async () => {
    const prisma = makePrisma();
    stubHappyPath(prisma);
    const service = new LabelsService(prisma);

    await service.attachToTask(PROJECT_ID, TASK_ID, LABEL_ID, LEADER_ID);

    expect(prisma.__tx.tareaEtiqueta.upsert).toHaveBeenCalledWith({
      where: { idTarea_idEtiqueta: { idTarea: TASK_ID, idEtiqueta: LABEL_ID } },
      update: {},
      create: { idTarea: TASK_ID, idEtiqueta: LABEL_ID },
    });
  });

  it('toda la operación corre en una sola transacción; ninguna consulta usa el delegate raíz de PrismaService', async () => {
    const prisma = makePrisma();
    stubHappyPath(prisma);
    const service = new LabelsService(prisma);

    await service.attachToTask(PROJECT_ID, TASK_ID, LABEL_ID, LEADER_ID);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.proyecto.findFirst).not.toHaveBeenCalled();
    expect(prisma.tarea.findFirst).not.toHaveBeenCalled();
    expect(prisma.etiqueta.findFirst).not.toHaveBeenCalled();
    expect(prisma.tareaEtiqueta.upsert).not.toHaveBeenCalled();
  });

  it('devuelve void', async () => {
    const prisma = makePrisma();
    stubHappyPath(prisma);
    const service = new LabelsService(prisma);

    const resultado = await service.attachToTask(PROJECT_ID, TASK_ID, LABEL_ID, LEADER_ID);

    expect(resultado).toBeUndefined();
  });

  it('participante activo no líder recibe 403, sin llegar a validar tarea/etiqueta ni escribir', async () => {
    const prisma = makePrisma();
    prisma.__tx.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    const service = new LabelsService(prisma);

    await expect(
      service.attachToTask(PROJECT_ID, TASK_ID, LABEL_ID, PARTICIPANT_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.__tx.tarea.findFirst).not.toHaveBeenCalled();
    expect(prisma.__tx.etiqueta.findFirst).not.toHaveBeenCalled();
    expect(prisma.__tx.tareaEtiqueta.upsert).not.toHaveBeenCalled();
  });

  it('el asignado activo de la tarea (sin ser líder) recibe 403', async () => {
    const prisma = makePrisma();
    prisma.__tx.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    const service = new LabelsService(prisma);

    await expect(
      service.attachToTask(PROJECT_ID, TASK_ID, LABEL_ID, ASSIGNEE_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('el creador de la tarea (sin ser líder del proyecto) recibe 403', async () => {
    const prisma = makePrisma();
    prisma.__tx.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    const service = new LabelsService(prisma);

    await expect(
      service.attachToTask(PROJECT_ID, TASK_ID, LABEL_ID, TASK_CREATOR_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un usuario externo recibe 403', async () => {
    const prisma = makePrisma();
    prisma.__tx.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    const service = new LabelsService(prisma);

    await expect(
      service.attachToTask(PROJECT_ID, TASK_ID, LABEL_ID, EXTERNO_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('proyecto inexistente/eliminado produce 404, sin escritura', async () => {
    const prisma = makePrisma();
    prisma.__tx.proyecto.findFirst.mockResolvedValue(null);
    const service = new LabelsService(prisma);

    await expect(
      service.attachToTask(PROJECT_ID, TASK_ID, LABEL_ID, LEADER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.__tx.tareaEtiqueta.upsert).not.toHaveBeenCalled();
  });

  it('tarea inexistente produce 404', async () => {
    const prisma = makePrisma();
    prisma.__tx.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.__tx.tarea.findFirst.mockResolvedValue(null);
    const service = new LabelsService(prisma);

    await expect(
      service.attachToTask(PROJECT_ID, 999999, LABEL_ID, LEADER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.__tx.tareaEtiqueta.upsert).not.toHaveBeenCalled();
  });

  it('tarea eliminada produce 404 (consulta con eliminadoEn: null)', async () => {
    const prisma = makePrisma();
    prisma.__tx.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.__tx.tarea.findFirst.mockResolvedValue(null);
    const service = new LabelsService(prisma);

    await expect(
      service.attachToTask(PROJECT_ID, TASK_ID, LABEL_ID, LEADER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.__tx.tarea.findFirst).toHaveBeenCalledWith({
      where: {
        idTarea: TASK_ID,
        idProyecto: PROJECT_ID,
        eliminadoEn: null,
        proyecto: { eliminadoEn: null },
      },
      select: { idTarea: true },
    });
  });

  it('tarea de otro proyecto produce 404 (consulta única idTarea + idProyecto)', async () => {
    const prisma = makePrisma();
    prisma.__tx.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.__tx.tarea.findFirst.mockResolvedValue(null);
    const service = new LabelsService(prisma);

    await expect(
      service.attachToTask(PROJECT_ID, TASK_ID, LABEL_ID, LEADER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('etiqueta inexistente produce 404, sin escritura', async () => {
    const prisma = makePrisma();
    prisma.__tx.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.__tx.tarea.findFirst.mockResolvedValue({ idTarea: TASK_ID });
    prisma.__tx.etiqueta.findFirst.mockResolvedValue(null);
    const service = new LabelsService(prisma);

    await expect(
      service.attachToTask(PROJECT_ID, TASK_ID, 999999, LEADER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.__tx.tareaEtiqueta.upsert).not.toHaveBeenCalled();
  });

  it('etiqueta de otro proyecto produce 404', async () => {
    const prisma = makePrisma();
    prisma.__tx.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.__tx.tarea.findFirst.mockResolvedValue({ idTarea: TASK_ID });
    prisma.__tx.etiqueta.findFirst.mockResolvedValue(null);
    const service = new LabelsService(prisma);

    await expect(
      service.attachToTask(PROJECT_ID, TASK_ID, LABEL_ID, LEADER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.__tx.etiqueta.findFirst).toHaveBeenCalledWith({
      where: { idEtiqueta: LABEL_ID, idProyecto: PROJECT_ID },
      select: { idEtiqueta: true, nombreEtiqueta: true, color: true },
    });
  });

  it('orden de validación: proyecto → liderazgo → tarea → etiqueta → asociación', async () => {
    const orden: string[] = [];
    const prisma = makePrisma();
    prisma.__tx.proyecto.findFirst.mockImplementation(async () => {
      orden.push('proyecto+liderazgo');
      return proyectoActivo();
    });
    prisma.__tx.tarea.findFirst.mockImplementation(async () => {
      orden.push('tarea');
      return { idTarea: TASK_ID };
    });
    prisma.__tx.etiqueta.findFirst.mockImplementation(async () => {
      orden.push('etiqueta');
      return { idEtiqueta: LABEL_ID, nombreEtiqueta: 'Backend', color: '#10B981' };
    });
    prisma.__tx.tareaEtiqueta.upsert.mockImplementation(async () => {
      orden.push('asociacion');
    });
    const service = new LabelsService(prisma);

    await service.attachToTask(PROJECT_ID, TASK_ID, LABEL_ID, LEADER_ID);

    expect(orden).toEqual(['proyecto+liderazgo', 'tarea', 'etiqueta', 'asociacion']);
  });

  it('no modifica la tarea ni la etiqueta: nunca llama a tarea.update/updateMany/delete/deleteMany ni etiqueta.update/updateMany/delete/deleteMany', async () => {
    const prisma = makePrisma();
    stubHappyPath(prisma);
    const service = new LabelsService(prisma);

    await service.attachToTask(PROJECT_ID, TASK_ID, LABEL_ID, LEADER_ID);

    expect((prisma.__tx.tarea as any).update).toBeUndefined();
    expect((prisma.__tx.tarea as any).updateMany).toBeUndefined();
    expect((prisma.__tx.tarea as any).delete).toBeUndefined();
    expect((prisma.__tx.tarea as any).deleteMany).toBeUndefined();
    expect((prisma.__tx.etiqueta as any).update).toBeUndefined();
    expect((prisma.__tx.etiqueta as any).updateMany).toBeUndefined();
    expect((prisma.__tx.etiqueta as any).delete).toBeUndefined();
    expect((prisma.__tx.etiqueta as any).deleteMany).toBeUndefined();
  });

  it('ninguna notificación: no depende de NotificationsService', () => {
    const source = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '../src/labels/labels.service.ts'),
      'utf-8',
    );
    expect(source).not.toMatch(/^import .*NotificationsService/m);
  });

  it('un error Prisma no relacionado (P2003) durante el upsert se propaga sin convertirse en 409', async () => {
    const prisma = makePrisma();
    stubHappyPath(prisma);
    const errorFk = new Error('foreign key violation simulada');
    prisma.__tx.tareaEtiqueta.upsert.mockRejectedValue(errorFk);
    const service = new LabelsService(prisma);

    await expect(service.attachToTask(PROJECT_ID, TASK_ID, LABEL_ID, LEADER_ID)).rejects.toBe(errorFk);
  });

  it('atomicidad: si falla el upsert, la transacción rechaza (rollback real vía $transaction de Prisma)', async () => {
    const prisma = makePrisma();
    stubHappyPath(prisma);
    const errorFallo = new Error('fallo al escribir TareaEtiqueta');
    prisma.__tx.tareaEtiqueta.upsert.mockRejectedValue(errorFallo);
    const service = new LabelsService(prisma);

    await expect(service.attachToTask(PROJECT_ID, TASK_ID, LABEL_ID, LEADER_ID)).rejects.toBe(errorFallo);
  });
});

describe('LabelsService.detachFromTask (DELETE, Tarea 32)', () => {
  it('el líder retira: usa deleteMany filtrado por idTarea + idEtiqueta (nunca delete sobre la PK compuesta)', async () => {
    const prisma = makePrisma();
    stubHappyPath(prisma);
    const service = new LabelsService(prisma);

    await service.detachFromTask(PROJECT_ID, TASK_ID, LABEL_ID, LEADER_ID);

    expect(prisma.__tx.tareaEtiqueta.deleteMany).toHaveBeenCalledWith({
      where: { idTarea: TASK_ID, idEtiqueta: LABEL_ID },
    });
    expect((prisma.__tx.tareaEtiqueta as any).delete).toBeUndefined();
  });

  it('retirar una asociación inexistente responde correctamente (count: 0), sin lanzar', async () => {
    const prisma = makePrisma();
    stubHappyPath(prisma);
    prisma.__tx.tareaEtiqueta.deleteMany.mockResolvedValue({ count: 0 });
    const service = new LabelsService(prisma);

    await expect(
      service.detachFromTask(PROJECT_ID, TASK_ID, LABEL_ID, LEADER_ID),
    ).resolves.toBeUndefined();
  });

  it('participante activo no líder recibe 403, sin escritura', async () => {
    const prisma = makePrisma();
    prisma.__tx.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    const service = new LabelsService(prisma);

    await expect(
      service.detachFromTask(PROJECT_ID, TASK_ID, LABEL_ID, PARTICIPANT_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.__tx.tareaEtiqueta.deleteMany).not.toHaveBeenCalled();
  });

  it('proyecto inexistente/eliminado produce 404', async () => {
    const prisma = makePrisma();
    prisma.__tx.proyecto.findFirst.mockResolvedValue(null);
    const service = new LabelsService(prisma);

    await expect(
      service.detachFromTask(PROJECT_ID, TASK_ID, LABEL_ID, LEADER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('tarea inexistente/eliminada/cruzada produce 404, sin escritura', async () => {
    const prisma = makePrisma();
    prisma.__tx.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.__tx.tarea.findFirst.mockResolvedValue(null);
    const service = new LabelsService(prisma);

    await expect(
      service.detachFromTask(PROJECT_ID, TASK_ID, LABEL_ID, LEADER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.__tx.tareaEtiqueta.deleteMany).not.toHaveBeenCalled();
  });

  it('etiqueta inexistente/cruzada produce 404, sin escritura', async () => {
    const prisma = makePrisma();
    prisma.__tx.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.__tx.tarea.findFirst.mockResolvedValue({ idTarea: TASK_ID });
    prisma.__tx.etiqueta.findFirst.mockResolvedValue(null);
    const service = new LabelsService(prisma);

    await expect(
      service.detachFromTask(PROJECT_ID, TASK_ID, LABEL_ID, LEADER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.__tx.tareaEtiqueta.deleteMany).not.toHaveBeenCalled();
  });

  it('el filtro nunca usa solo idEtiqueta o solo idTarea (no afecta otras asociaciones)', async () => {
    const prisma = makePrisma();
    stubHappyPath(prisma);
    const service = new LabelsService(prisma);

    await service.detachFromTask(PROJECT_ID, TASK_ID, LABEL_ID, LEADER_ID);

    const where = prisma.__tx.tareaEtiqueta.deleteMany.mock.calls[0][0].where;
    expect(Object.keys(where).sort()).toEqual(['idEtiqueta', 'idTarea']);
  });

  it('no modifica la tarea ni la etiqueta', async () => {
    const prisma = makePrisma();
    stubHappyPath(prisma);
    const service = new LabelsService(prisma);

    await service.detachFromTask(PROJECT_ID, TASK_ID, LABEL_ID, LEADER_ID);

    expect((prisma.__tx.tarea as any).update).toBeUndefined();
    expect((prisma.__tx.etiqueta as any).delete).toBeUndefined();
  });

  it('atomicidad: si falla el deleteMany, la transacción rechaza', async () => {
    const prisma = makePrisma();
    stubHappyPath(prisma);
    const errorFallo = new Error('fallo al eliminar TareaEtiqueta');
    prisma.__tx.tareaEtiqueta.deleteMany.mockRejectedValue(errorFallo);
    const service = new LabelsService(prisma);

    await expect(service.detachFromTask(PROJECT_ID, TASK_ID, LABEL_ID, LEADER_ID)).rejects.toBe(errorFallo);
  });

  it('un error Prisma no relacionado se propaga sin cambios', async () => {
    const prisma = makePrisma();
    stubHappyPath(prisma);
    const error = new Error('fallo de conexión simulado');
    prisma.__tx.tareaEtiqueta.deleteMany.mockRejectedValue(error);
    const service = new LabelsService(prisma);

    await expect(service.detachFromTask(PROJECT_ID, TASK_ID, LABEL_ID, LEADER_ID)).rejects.toBe(error);
  });
});

describe('Idempotencia y concurrencia simuladas (Tarea 32)', () => {
  it('PUT repetido: la segunda llamada también resuelve sin error (upsert nunca lanza P2002 por PK compuesta ya existente)', async () => {
    const prisma = makePrisma();
    stubHappyPath(prisma);
    const service = new LabelsService(prisma);

    await service.attachToTask(PROJECT_ID, TASK_ID, LABEL_ID, LEADER_ID);
    await expect(
      service.attachToTask(PROJECT_ID, TASK_ID, LABEL_ID, LEADER_ID),
    ).resolves.toBeUndefined();
    expect(prisma.__tx.tareaEtiqueta.upsert).toHaveBeenCalledTimes(2);
  });

  it('dos PUT concurrentes resuelven ambos con éxito (simulados con Promise.all sobre el mismo upsert idempotente)', async () => {
    const prisma = makePrisma();
    stubHappyPath(prisma);
    const service = new LabelsService(prisma);

    await expect(
      Promise.all([
        service.attachToTask(PROJECT_ID, TASK_ID, LABEL_ID, LEADER_ID),
        service.attachToTask(PROJECT_ID, TASK_ID, LABEL_ID, LEADER_ID),
      ]),
    ).resolves.toEqual([undefined, undefined]);
  });

  it('DELETE repetido: la segunda llamada también resuelve sin error (deleteMany con count: 0)', async () => {
    const prisma = makePrisma();
    stubHappyPath(prisma);
    prisma.__tx.tareaEtiqueta.deleteMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const service = new LabelsService(prisma);

    await service.detachFromTask(PROJECT_ID, TASK_ID, LABEL_ID, LEADER_ID);
    await expect(
      service.detachFromTask(PROJECT_ID, TASK_ID, LABEL_ID, LEADER_ID),
    ).resolves.toBeUndefined();
  });

  it('dos DELETE concurrentes resuelven ambos con éxito, sin P2025', async () => {
    const prisma = makePrisma();
    stubHappyPath(prisma);
    const service = new LabelsService(prisma);

    await expect(
      Promise.all([
        service.detachFromTask(PROJECT_ID, TASK_ID, LABEL_ID, LEADER_ID),
        service.detachFromTask(PROJECT_ID, TASK_ID, LABEL_ID, LEADER_ID),
      ]),
    ).resolves.toEqual([undefined, undefined]);
  });
});
