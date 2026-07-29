import { describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TasksService } from '../src/tasks/tasks.service';

/**
 * Tarea 26: el índice parcial `asignacion_tarea_activa_unique` (a lo sumo
 * una fila activa por tarea) puede rechazar una segunda inserción
 * concurrente. Reproducido empíricamente contra PostgreSQL real (ver
 * reporte final) antes de escribir estas pruebas: Prisma 6.19.2 entrega,
 * para esa violación específica,
 *
 *   PrismaClientKnownRequestError { code: 'P2002',
 *     meta: { modelName: 'AsignacionTarea', target: ['id_tarea'] } }
 *
 * sin exponer el nombre del índice. Estos helpers construyen la CLASE REAL
 * de Prisma (no un objeto `{ code: 'P2002' }` falso) para que las pruebas
 * representen fielmente lo que producción realmente recibiría.
 */
function makeActiveAssignmentCollisionError() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`id_tarea`)', {
    code: 'P2002',
    clientVersion: '6.19.2',
    meta: { modelName: 'AsignacionTarea', target: ['id_tarea'] },
  });
}

function makeOtherModelP2002Error() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`correo`)', {
    code: 'P2002',
    clientVersion: '6.19.2',
    meta: { modelName: 'Usuario', target: ['correo'] },
  });
}

function makeOtherTargetP2002Error() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.19.2',
    meta: { modelName: 'AsignacionTarea', target: ['id_tarea', 'otra_columna'] },
  });
}

function makeOtherConstraintP2002Error() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.19.2',
    meta: { modelName: 'AsignacionTarea', constraint: 'alguna_otra_constraint' },
  });
}

function makeForeignKeyError() {
  return new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
    code: 'P2003',
    clientVersion: '6.19.2',
    meta: { modelName: 'AsignacionTarea', constraint: 'asignacion_tarea_id_usuario_fkey' },
  });
}

function makeRecordNotFoundError() {
  return new Prisma.PrismaClientKnownRequestError('An operation failed because it depends on one or more records that were required but not found', {
    code: 'P2025',
    clientVersion: '6.19.2',
    meta: { modelName: 'AsignacionTarea' },
  });
}

function makeConnectionError() {
  return new Prisma.PrismaClientInitializationError('Cannot reach database server', '6.19.2', 'P1001');
}

function makeTx() {
  return {
    tarea: { findFirst: vi.fn() },
    asignacionTarea: { create: vi.fn(), updateMany: vi.fn() },
  };
}

function makePrisma(tx = makeTx()) {
  return {
    tx,
    $transaction: vi.fn(async (callback: any) => callback(tx)),
  } as any;
}

function makeAuthorization(overrides: Record<string, unknown> = {}) {
  return {
    assertCanAssignTask: vi.fn().mockResolvedValue({ idTarea: 42, idProyecto: 5, idRolProyecto: null }),
    ...overrides,
  } as any;
}

function makeRelations(overrides: Record<string, unknown> = {}) {
  return {
    assertUserAssignableToProject: vi.fn().mockResolvedValue(undefined),
    validateRelatedResources: vi.fn(),
    ...overrides,
  } as any;
}

function makeContext(overrides: Record<string, unknown> = {}) {
  return {
    getActiveAssignment: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as any;
}

function makeNotifications() {
  return { notifyFromTemplate: vi.fn().mockResolvedValue(undefined) } as any;
}

function tareaRow(overrides: Record<string, unknown> = {}) {
  return {
    idTarea: 42,
    idProyecto: 5,
    idHito: null,
    idRolProyecto: null,
    tituloTarea: 'Tarea original',
    descripcionTarea: null,
    estadoTarea: 'POR_HACER',
    prioridad: 'MEDIA',
    creadaPor: 1,
    fechaCreacion: new Date('2026-01-01T00:00:00.000Z'),
    fechaLimite: null,
    actualizadaEn: null,
    tiempoEstimadoHoras: null,
    hito: null,
    rolProyecto: null,
    asignaciones: [],
    etiquetas: [],
    _count: { comentarios: 0 },
    ...overrides,
  };
}

function makeService(opts: {
  prisma?: any;
  auth?: any;
  relations?: any;
  notifications?: any;
  context?: any;
} = {}) {
  const tx = makeTx();
  const prisma = opts.prisma ?? makePrisma(tx);
  const auth = opts.auth ?? makeAuthorization();
  const relations = opts.relations ?? makeRelations();
  const notifications = opts.notifications ?? makeNotifications();
  const context = opts.context ?? makeContext();
  const service = new TasksService(prisma, auth, relations, notifications, context);
  return { tx: prisma.tx, prisma, auth, relations, notifications, context, service };
}

const DTO = { idUsuario: 7 } as any;

describe('TasksService.assign — colisión concurrente de asignación activa (Tarea 26)', () => {
  describe('detector: solo la colisión reconocida produce 409', () => {
    it('reconoce el error real del índice parcial: 409 exacto, mensaje público sin detalles internos', async () => {
      const { tx, service } = makeService();
      tx.asignacionTarea.create.mockRejectedValue(makeActiveAssignmentCollisionError());

      try {
        await service.assign(5, 42, 1, DTO);
        throw new Error('no debía resolver');
      } catch (e: any) {
        expect(e).toBeInstanceOf(ConflictException);
        expect(e.getStatus()).toBe(409);
        expect(e.message).toBe('La tarea ya tiene una asignación activa');
        expect(e.message).not.toMatch(/asignacion_tarea_activa_unique/i);
        expect(e.message).not.toMatch(/P2002/);
        expect(e.message).not.toMatch(/id_tarea/);
      }
    });

    it('rechaza un P2002 de otro modelo: propaga el error original', async () => {
      const { tx, service } = makeService();
      const original = makeOtherModelP2002Error();
      tx.asignacionTarea.create.mockRejectedValue(original);

      await expect(service.assign(5, 42, 1, DTO)).rejects.toBe(original);
    });

    it('rechaza un P2002 con otro target: propaga el error original', async () => {
      const { tx, service } = makeService();
      const original = makeOtherTargetP2002Error();
      tx.asignacionTarea.create.mockRejectedValue(original);

      await expect(service.assign(5, 42, 1, DTO)).rejects.toBe(original);
    });

    it('rechaza un P2002 con otra constraint (sin target): propaga el error original', async () => {
      const { tx, service } = makeService();
      const original = makeOtherConstraintP2002Error();
      tx.asignacionTarea.create.mockRejectedValue(original);

      await expect(service.assign(5, 42, 1, DTO)).rejects.toBe(original);
    });

    it('rechaza P2003 (clave foránea): propaga el error original', async () => {
      const { tx, service } = makeService();
      const original = makeForeignKeyError();
      tx.asignacionTarea.create.mockRejectedValue(original);

      await expect(service.assign(5, 42, 1, DTO)).rejects.toBe(original);
    });

    it('rechaza P2025 (registro requerido no encontrado): propaga el error original', async () => {
      const { tx, service } = makeService();
      const original = makeRecordNotFoundError();
      tx.asignacionTarea.create.mockRejectedValue(original);

      await expect(service.assign(5, 42, 1, DTO)).rejects.toBe(original);
    });

    it('rechaza un error de conexión/inicialización: propaga el error original', async () => {
      const { tx, service } = makeService();
      const original = makeConnectionError();
      tx.asignacionTarea.create.mockRejectedValue(original);

      await expect(service.assign(5, 42, 1, DTO)).rejects.toBe(original);
    });

    it('rechaza un Error genérico: propaga el error original exacto', async () => {
      const { tx, service } = makeService();
      const original = new Error('fallo inesperado');
      tx.asignacionTarea.create.mockRejectedValue(original);

      await expect(service.assign(5, 42, 1, DTO)).rejects.toBe(original);
    });

    it('no rompe con valores no-objeto (null, string, número) — ninguno coincide con la colisión', async () => {
      for (const valorNoObjeto of [null, 'fallo', 42]) {
        const { tx, service } = makeService();
        tx.asignacionTarea.create.mockRejectedValue(valorNoObjeto);

        await expect(service.assign(5, 42, 1, DTO)).rejects.toBe(valorNoObjeto);
      }
    });
  });

  describe('asignación inicial concurrente', () => {
    it('create lanza la colisión reconocida: assign() lanza ConflictException (409), sin otras escrituras', async () => {
      const { tx, service } = makeService();
      tx.asignacionTarea.create.mockRejectedValue(makeActiveAssignmentCollisionError());

      await expect(service.assign(5, 42, 1, DTO)).rejects.toBeInstanceOf(ConflictException);

      expect(tx.asignacionTarea.updateMany).not.toHaveBeenCalled();
    });

    it('no ejecuta la lectura final tras la colisión', async () => {
      const { tx, service } = makeService();
      tx.asignacionTarea.create.mockRejectedValue(makeActiveAssignmentCollisionError());

      await expect(service.assign(5, 42, 1, DTO)).rejects.toBeInstanceOf(ConflictException);

      expect(tx.tarea.findFirst).not.toHaveBeenCalled();
    });

    it('no notifica ante la colisión', async () => {
      const { tx, notifications, service } = makeService();
      tx.asignacionTarea.create.mockRejectedValue(makeActiveAssignmentCollisionError());

      await expect(service.assign(5, 42, 1, DTO)).rejects.toBeInstanceOf(ConflictException);

      expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    });
  });

  describe('reasignación concurrente', () => {
    function makeReasignacionService() {
      return makeService({
        context: makeContext({
          getActiveAssignment: vi.fn().mockResolvedValue({
            idAsignacion: 9,
            idTarea: 42,
            idUsuario: 3,
            asignadoPor: 1,
            fechaAsignacion: new Date('2026-01-05T00:00:00.000Z'),
            desasignadaEn: null,
          }),
        }),
      });
    }

    it('se ejecuta el cierre y luego la creación lanza la colisión: 409, ocurre dentro de la transacción', async () => {
      const { tx, service } = makeReasignacionService();
      tx.asignacionTarea.create.mockRejectedValue(makeActiveAssignmentCollisionError());

      await expect(service.assign(5, 42, 1, DTO)).rejects.toBeInstanceOf(ConflictException);

      expect(tx.asignacionTarea.updateMany).toHaveBeenCalledTimes(1);
      expect(tx.asignacionTarea.create).toHaveBeenCalledTimes(1);
    });

    it('la lectura final no se ejecuta cuando la reasignación pierde la carrera', async () => {
      const { tx, service } = makeReasignacionService();
      tx.asignacionTarea.create.mockRejectedValue(makeActiveAssignmentCollisionError());

      await expect(service.assign(5, 42, 1, DTO)).rejects.toBeInstanceOf(ConflictException);

      expect(tx.tarea.findFirst).not.toHaveBeenCalled();
    });

    it('no existe compensación manual: ninguna escritura adicional tras el 409 (una sola transacción, un solo create)', async () => {
      const { tx, prisma, service } = makeReasignacionService();
      tx.asignacionTarea.create.mockRejectedValue(makeActiveAssignmentCollisionError());

      await expect(service.assign(5, 42, 1, DTO)).rejects.toBeInstanceOf(ConflictException);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.asignacionTarea.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('idempotencia secuencial (sin cambios respecto a la Tarea 24)', () => {
    it('mismo usuario ya asignado: sigue respondiendo éxito, sin invocar create, sin 409', async () => {
      const { tx, service } = makeService({
        context: makeContext({
          getActiveAssignment: vi.fn().mockResolvedValue({
            idAsignacion: 9,
            idTarea: 42,
            idUsuario: 7,
            asignadoPor: 1,
            fechaAsignacion: new Date(),
            desasignadaEn: null,
          }),
        }),
      });
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      const result = await service.assign(5, 42, 1, DTO);

      expect(tx.asignacionTarea.create).not.toHaveBeenCalled();
      expect(result.idTarea).toBe(42);
    });
  });

  describe('simulación controlada de carrera (determinista, sin delays arbitrarios)', () => {
    it('dos asignaciones concurrentes a la misma tarea: una éxito, una 409, y la perdedora no llega a la lectura final', async () => {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      const auth = makeAuthorization();
      const relations = makeRelations();
      const notifications = makeNotifications();
      const context = makeContext({ getActiveAssignment: vi.fn().mockResolvedValue(null) });
      const service = new TasksService(prisma, auth, relations, notifications, context);

      // Ambas "solicitudes" observan que no hay asignación activa y ambas
      // alcanzan tx.asignacionTarea.create. El orden de invocación (no de
      // resolución) decide el resultado: la primera invocación gana, la
      // segunda recibe la forma real de la violación del índice parcial —
      // exactamente lo que la base de datos decidiría en producción.
      tx.asignacionTarea.create
        .mockImplementationOnce(async () => ({
          idAsignacion: 100,
          idTarea: 42,
          idUsuario: 7,
          asignadoPor: 1,
          fechaAsignacion: new Date(),
          desasignadaEn: null,
        }))
        .mockImplementationOnce(async () => {
          throw makeActiveAssignmentCollisionError();
        });
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      const [resultadoA, resultadoB] = await Promise.allSettled([
        service.assign(5, 42, 1, { idUsuario: 7 } as any),
        service.assign(5, 42, 1, { idUsuario: 9 } as any),
      ]);

      const exitos = [resultadoA, resultadoB].filter((r) => r.status === 'fulfilled');
      const rechazos = [resultadoA, resultadoB].filter((r) => r.status === 'rejected');

      expect(exitos).toHaveLength(1);
      expect(rechazos).toHaveLength(1);
      expect((rechazos[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
      expect((rechazos[0] as PromiseRejectedResult).reason.getStatus()).toBe(409);

      expect(tx.asignacionTarea.create).toHaveBeenCalledTimes(2);
      // Solo la ganadora llega a la lectura final.
      expect(tx.tarea.findFirst).toHaveBeenCalledTimes(1);
      expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    });
  });
});
