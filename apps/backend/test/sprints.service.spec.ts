import { describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SprintsService } from '../src/sprints/sprints.service';

/**
 * Reproduce la violación real del índice parcial `sprint_operable_unique`
 * (idProyecto) WHERE estado IN (ACTIVO, EN_FINALIZACION), siguiendo el
 * mismo patrón empírico documentado en tasks-assignment-conflict.spec.ts:
 * se construye la clase real Prisma.PrismaClientKnownRequestError, no un
 * objeto `{ code: 'P2002' }` falso.
 */
function makeOperableSprintCollisionError() {
  return new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed on the fields: (`id_proyecto`)',
    {
      code: 'P2002',
      clientVersion: '6.19.2',
      meta: { modelName: 'Sprint', target: ['id_proyecto'] },
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

function makeOtherTargetP2002Error() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.19.2',
    meta: { modelName: 'Sprint', target: ['id_proyecto', 'numero'] },
  });
}

function makeForeignKeyError() {
  return new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
    code: 'P2003',
    clientVersion: '6.19.2',
    meta: { modelName: 'Sprint', constraint: 'sprint_id_proyecto_fkey' },
  });
}

function makeTx() {
  return {
    sprint: { findFirst: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    tarea: { count: vi.fn() },
    horasParticipacion: { findFirst: vi.fn(), update: vi.fn() },
  };
}

function makePrisma(tx = makeTx()) {
  return {
    tx,
    $transaction: vi.fn(async (callback: any) => callback(tx)),
  } as any;
}

function makeSprintsContext() {
  return { getCurrentSprint: vi.fn() } as any;
}

function makeSprintsAuthorization() {
  return {
    assertCanStartSprint: vi.fn().mockResolvedValue(undefined),
    assertCanFinalizeSprint: vi.fn(),
    assertCanAdjustRecognizedHours: vi.fn().mockResolvedValue(undefined),
  } as any;
}

function makeNotifications() {
  return {
    notifyProjectActiveParticipants: vi.fn().mockResolvedValue(undefined),
    notifySprintFinalizationStarted: vi.fn().mockResolvedValue(undefined),
  } as any;
}

const LIDER_ID = 1;
const NO_LIDER_ID = 2;
const PROJECT_ID = 10;
const SPRINT_ID = 20;

describe('SprintsService', () => {
  describe('startSprint', () => {
    it('caso 1: crea el primer Sprint del proyecto con numero 1 y estado ACTIVO', async () => {
      const tx = makeTx();
      tx.sprint.findFirst.mockResolvedValue(null); // sin Sprints previos
      const nuevoSprint = { idSprint: 1, idProyecto: PROJECT_ID, numero: 1, estado: 'ACTIVO' };
      tx.sprint.create.mockResolvedValue(nuevoSprint);
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      context.getCurrentSprint.mockResolvedValue(null);
      const authorization = makeSprintsAuthorization();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      const result = await service.startSprint(PROJECT_ID, LIDER_ID);

      expect(result).toBe(nuevoSprint);
      expect(tx.sprint.create).toHaveBeenCalledWith({
        data: { idProyecto: PROJECT_ID, numero: 1, estado: 'ACTIVO' },
      });
    });

    it('caso 2: usa MAX(numero) + 1 cuando el proyecto ya tuvo Sprints (aunque estén CERRADOS)', async () => {
      const tx = makeTx();
      // Sprint 1 y Sprint 2 CERRADOS: el mayor numero es 2.
      tx.sprint.findFirst.mockResolvedValue({ numero: 2 });
      const nuevoSprint = { idSprint: 3, idProyecto: PROJECT_ID, numero: 3, estado: 'ACTIVO' };
      tx.sprint.create.mockResolvedValue(nuevoSprint);
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      context.getCurrentSprint.mockResolvedValue(null);
      const authorization = makeSprintsAuthorization();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      const result = await service.startSprint(PROJECT_ID, LIDER_ID);

      expect(result.numero).toBe(3);
      expect(tx.sprint.findFirst).toHaveBeenCalledWith({
        where: { idProyecto: PROJECT_ID },
        orderBy: { numero: 'desc' },
        select: { numero: true },
      });
      expect(tx.sprint.create).toHaveBeenCalledWith({
        data: { idProyecto: PROJECT_ID, numero: 3, estado: 'ACTIVO' },
      });
    });

    it('caso 3: rechaza si ya existe un Sprint ACTIVO, sin crear ninguna fila', async () => {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      context.getCurrentSprint.mockResolvedValue({
        idSprint: 5,
        idProyecto: PROJECT_ID,
        estado: 'ACTIVO',
      });
      const authorization = makeSprintsAuthorization();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      await expect(service.startSprint(PROJECT_ID, LIDER_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(tx.sprint.create).not.toHaveBeenCalled();
    });

    it('caso 4: rechaza si ya existe un Sprint EN_FINALIZACION, sin crear ninguna fila', async () => {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      context.getCurrentSprint.mockResolvedValue({
        idSprint: 5,
        idProyecto: PROJECT_ID,
        estado: 'EN_FINALIZACION',
      });
      const authorization = makeSprintsAuthorization();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      await expect(service.startSprint(PROJECT_ID, LIDER_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(tx.sprint.create).not.toHaveBeenCalled();
    });

    it('caso 5: un Sprint CERRADO no bloquea — permite iniciar el siguiente', async () => {
      // getCurrentSprint (A1) ya filtra CERRADO en su propia consulta: un
      // proyecto con un único Sprint CERRADO debe devolver null aquí.
      const tx = makeTx();
      tx.sprint.findFirst.mockResolvedValue({ numero: 1 });
      const nuevoSprint = { idSprint: 2, idProyecto: PROJECT_ID, numero: 2, estado: 'ACTIVO' };
      tx.sprint.create.mockResolvedValue(nuevoSprint);
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      context.getCurrentSprint.mockResolvedValue(null);
      const authorization = makeSprintsAuthorization();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      const result = await service.startSprint(PROJECT_ID, LIDER_ID);

      expect(result).toBe(nuevoSprint);
      expect(result.numero).toBe(2);
    });

    it('caso 6: rechaza a un usuario que no es líder, sin crear ninguna fila', async () => {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      const authorization = makeSprintsAuthorization();
      authorization.assertCanStartSprint.mockRejectedValue(
        new ForbiddenException('No eres el líder de este proyecto'),
      );
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      await expect(service.startSprint(PROJECT_ID, NO_LIDER_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(context.getCurrentSprint).not.toHaveBeenCalled();
      expect(tx.sprint.create).not.toHaveBeenCalled();
    });

    it('caso 6b: propaga NotFoundException si el proyecto no existe, sin crear ninguna fila', async () => {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      const authorization = makeSprintsAuthorization();
      authorization.assertCanStartSprint.mockRejectedValue(
        new NotFoundException('Proyecto con id 10 no encontrado'),
      );
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      await expect(service.startSprint(PROJECT_ID, LIDER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(tx.sprint.create).not.toHaveBeenCalled();
    });

    it('caso 7: la numeración está aislada por proyecto (Sprints de otro proyecto no afectan MAX(numero))', async () => {
      const tx = makeTx();
      // findFirst ya filtra por idProyecto en el where: se verifica
      // explícitamente que el proyecto B (con números más altos) no
      // interviene en el cálculo para el proyecto A.
      tx.sprint.findFirst.mockResolvedValue(null);
      const nuevoSprint = { idSprint: 1, idProyecto: PROJECT_ID, numero: 1, estado: 'ACTIVO' };
      tx.sprint.create.mockResolvedValue(nuevoSprint);
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      context.getCurrentSprint.mockResolvedValue(null);
      const authorization = makeSprintsAuthorization();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      const result = await service.startSprint(PROJECT_ID, LIDER_ID);

      expect(result.numero).toBe(1);
      expect(tx.sprint.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { idProyecto: PROJECT_ID } }),
      );
    });

    it('caso 8: traduce la colisión del índice sprint_operable_unique a ConflictException, sin exponer el error crudo', async () => {
      const tx = makeTx();
      tx.sprint.findFirst.mockResolvedValue(null);
      tx.sprint.create.mockRejectedValue(makeOperableSprintCollisionError());
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      context.getCurrentSprint.mockResolvedValue(null);
      const authorization = makeSprintsAuthorization();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      await expect(service.startSprint(PROJECT_ID, LIDER_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('caso 8b: relanza sin cambios un P2002 de otro modelo (no confunde otras colisiones con la de Sprint)', async () => {
      const tx = makeTx();
      tx.sprint.findFirst.mockResolvedValue(null);
      tx.sprint.create.mockRejectedValue(makeOtherModelP2002Error());
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      context.getCurrentSprint.mockResolvedValue(null);
      const authorization = makeSprintsAuthorization();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      await expect(service.startSprint(PROJECT_ID, LIDER_ID)).rejects.toBeInstanceOf(
        Prisma.PrismaClientKnownRequestError,
      );
    });

    it('caso 8c: relanza sin cambios un P2002 de Sprint con un target distinto', async () => {
      const tx = makeTx();
      tx.sprint.findFirst.mockResolvedValue(null);
      tx.sprint.create.mockRejectedValue(makeOtherTargetP2002Error());
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      context.getCurrentSprint.mockResolvedValue(null);
      const authorization = makeSprintsAuthorization();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      await expect(service.startSprint(PROJECT_ID, LIDER_ID)).rejects.toBeInstanceOf(
        Prisma.PrismaClientKnownRequestError,
      );
    });

    it('caso 8d: relanza sin cambios un error que no es P2002 (p. ej. P2003)', async () => {
      const tx = makeTx();
      tx.sprint.findFirst.mockResolvedValue(null);
      tx.sprint.create.mockRejectedValue(makeForeignKeyError());
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      context.getCurrentSprint.mockResolvedValue(null);
      const authorization = makeSprintsAuthorization();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      await expect(service.startSprint(PROJECT_ID, LIDER_ID)).rejects.toBeInstanceOf(
        Prisma.PrismaClientKnownRequestError,
      );
    });

    it('caso 9: reutiliza SprintsAuthorizationService.assertCanStartSprint (no duplica la regla de liderazgo)', async () => {
      const tx = makeTx();
      tx.sprint.findFirst.mockResolvedValue(null);
      tx.sprint.create.mockResolvedValue({
        idSprint: 1,
        idProyecto: PROJECT_ID,
        numero: 1,
        estado: 'ACTIVO',
      });
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      context.getCurrentSprint.mockResolvedValue(null);
      const authorization = makeSprintsAuthorization();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      await service.startSprint(PROJECT_ID, LIDER_ID);

      expect(authorization.assertCanStartSprint).toHaveBeenCalledTimes(1);
      expect(authorization.assertCanStartSprint).toHaveBeenCalledWith(PROJECT_ID, LIDER_ID, tx);
    });

    it('ejecuta autorización, comprobación de Sprint operable y creación dentro de la misma transacción', async () => {
      const tx = makeTx();
      tx.sprint.findFirst.mockResolvedValue(null);
      tx.sprint.create.mockResolvedValue({
        idSprint: 1,
        idProyecto: PROJECT_ID,
        numero: 1,
        estado: 'ACTIVO',
      });
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      context.getCurrentSprint.mockResolvedValue(null);
      const authorization = makeSprintsAuthorization();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      await service.startSprint(PROJECT_ID, LIDER_ID);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(context.getCurrentSprint).toHaveBeenCalledWith(PROJECT_ID, tx);
    });
  });

  describe('finalizeSprint', () => {
    function sprintActivo(overrides: Record<string, unknown> = {}) {
      return {
        idSprint: SPRINT_ID,
        idProyecto: PROJECT_ID,
        numero: 3,
        estado: 'ACTIVO',
        fechaFinalizacionIniciada: null,
        ...overrides,
      };
    }

    it('caso 1: todas las tareas HECHO -> ACTIVO pasa a EN_FINALIZACION, persiste fechaFinalizacionIniciada y notifica', async () => {
      const tx = makeTx();
      const sprint = sprintActivo();
      const authorization = makeSprintsAuthorization();
      authorization.assertCanFinalizeSprint.mockResolvedValue(sprint);
      tx.tarea.count.mockResolvedValue(0);
      tx.sprint.updateMany.mockResolvedValue({ count: 1 });
      const sprintFinalizado = { ...sprint, estado: 'EN_FINALIZACION', fechaFinalizacionIniciada: new Date() };
      tx.sprint.findFirst.mockResolvedValue(sprintFinalizado);
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      const notifications = makeNotifications();
      const service = new SprintsService(prisma, context, authorization, notifications);

      const result = await service.finalizeSprint(PROJECT_ID, SPRINT_ID, LIDER_ID);

      expect(result).toBe(sprintFinalizado);
      expect(tx.sprint.updateMany).toHaveBeenCalledWith({
        where: { idSprint: SPRINT_ID, idProyecto: PROJECT_ID, estado: 'ACTIVO' },
        data: expect.objectContaining({ estado: 'EN_FINALIZACION', fechaFinalizacionIniciada: expect.any(Date) }),
      });
      expect(notifications.notifyProjectActiveParticipants).toHaveBeenCalledTimes(1);
      expect(notifications.notifySprintFinalizationStarted).toHaveBeenCalledTimes(1);
      expect(notifications.notifySprintFinalizationStarted).toHaveBeenCalledWith(
        PROJECT_ID,
        LIDER_ID,
        { projectId: PROJECT_ID, sprintId: SPRINT_ID },
      );
    });

    it('caso 2: una tarea EN_PROGRESO bloquea, sin updateMany ni notificaciones', async () => {
      const tx = makeTx();
      const authorization = makeSprintsAuthorization();
      authorization.assertCanFinalizeSprint.mockResolvedValue(sprintActivo());
      tx.tarea.count.mockResolvedValue(1); // una tarea EN_PROGRESO cuenta como no-HECHO
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      const notifications = makeNotifications();
      const service = new SprintsService(prisma, context, authorization, notifications);

      await expect(service.finalizeSprint(PROJECT_ID, SPRINT_ID, LIDER_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(tx.sprint.updateMany).not.toHaveBeenCalled();
      expect(notifications.notifyProjectActiveParticipants).not.toHaveBeenCalled();
      expect(notifications.notifySprintFinalizationStarted).not.toHaveBeenCalled();
    });

    it('caso 3: una tarea PENDIENTE (POR_HACER) bloquea igual que cualquier estado != HECHO', async () => {
      const tx = makeTx();
      const authorization = makeSprintsAuthorization();
      authorization.assertCanFinalizeSprint.mockResolvedValue(sprintActivo());
      tx.tarea.count.mockResolvedValue(1);
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      const notifications = makeNotifications();
      const service = new SprintsService(prisma, context, authorization, notifications);

      await expect(service.finalizeSprint(PROJECT_ID, SPRINT_ID, LIDER_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(tx.tarea.count).toHaveBeenCalledWith({
        where: {
          idProyecto: PROJECT_ID,
          idSprint: SPRINT_ID,
          eliminadoEn: null,
          estadoTarea: { not: 'HECHO' },
        },
      });
    });

    it('caso 4: Sprint EN_FINALIZACION rechaza sin notificar', async () => {
      const tx = makeTx();
      const authorization = makeSprintsAuthorization();
      authorization.assertCanFinalizeSprint.mockResolvedValue(
        sprintActivo({ estado: 'EN_FINALIZACION' }),
      );
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      const notifications = makeNotifications();
      const service = new SprintsService(prisma, context, authorization, notifications);

      await expect(service.finalizeSprint(PROJECT_ID, SPRINT_ID, LIDER_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(tx.tarea.count).not.toHaveBeenCalled();
      expect(notifications.notifyProjectActiveParticipants).not.toHaveBeenCalled();
    });

    it('caso 5: Sprint CERRADO rechaza sin notificar', async () => {
      const tx = makeTx();
      const authorization = makeSprintsAuthorization();
      authorization.assertCanFinalizeSprint.mockResolvedValue(sprintActivo({ estado: 'CERRADO' }));
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      const notifications = makeNotifications();
      const service = new SprintsService(prisma, context, authorization, notifications);

      await expect(service.finalizeSprint(PROJECT_ID, SPRINT_ID, LIDER_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(notifications.notifyProjectActiveParticipants).not.toHaveBeenCalled();
    });

    it('caso 6: usuario no líder — propaga la excepción de assertCanFinalizeSprint sin mutar ni notificar', async () => {
      const tx = makeTx();
      const authorization = makeSprintsAuthorization();
      authorization.assertCanFinalizeSprint.mockRejectedValue(
        new ForbiddenException('No eres el líder de este proyecto'),
      );
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      const notifications = makeNotifications();
      const service = new SprintsService(prisma, context, authorization, notifications);

      await expect(
        service.finalizeSprint(PROJECT_ID, SPRINT_ID, NO_LIDER_ID),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.sprint.updateMany).not.toHaveBeenCalled();
      expect(notifications.notifyProjectActiveParticipants).not.toHaveBeenCalled();
    });

    it('caso 7: cross-project — sprintId válido de otro proyecto se rechaza vía assertCanFinalizeSprint (aislamiento projectId+sprintId)', async () => {
      const tx = makeTx();
      const authorization = makeSprintsAuthorization();
      authorization.assertCanFinalizeSprint.mockRejectedValue(
        new NotFoundException(`Sprint con id ${SPRINT_ID} no encontrado en el proyecto ${PROJECT_ID}`),
      );
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      const notifications = makeNotifications();
      const service = new SprintsService(prisma, context, authorization, notifications);

      await expect(
        service.finalizeSprint(PROJECT_ID, SPRINT_ID, LIDER_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.tarea.count).not.toHaveBeenCalled();
      expect(notifications.notifyProjectActiveParticipants).not.toHaveBeenCalled();
    });

    it('caso 8: Sprint sin tareas (0 relevantes) permite la transición — A4 no exige "al menos una tarea"', async () => {
      const tx = makeTx();
      const sprint = sprintActivo();
      const authorization = makeSprintsAuthorization();
      authorization.assertCanFinalizeSprint.mockResolvedValue(sprint);
      tx.tarea.count.mockResolvedValue(0);
      tx.sprint.updateMany.mockResolvedValue({ count: 1 });
      const sprintFinalizado = { ...sprint, estado: 'EN_FINALIZACION', fechaFinalizacionIniciada: new Date() };
      tx.sprint.findFirst.mockResolvedValue(sprintFinalizado);
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      const notifications = makeNotifications();
      const service = new SprintsService(prisma, context, authorization, notifications);

      const result = await service.finalizeSprint(PROJECT_ID, SPRINT_ID, LIDER_ID);

      expect(result.estado).toBe('EN_FINALIZACION');
    });

    it('caso 9: la notificación ocurre después de que $transaction resuelve (orden temporal explícito)', async () => {
      const tx = makeTx();
      const sprint = sprintActivo();
      const authorization = makeSprintsAuthorization();
      authorization.assertCanFinalizeSprint.mockResolvedValue(sprint);
      tx.tarea.count.mockResolvedValue(0);
      tx.sprint.updateMany.mockResolvedValue({ count: 1 });
      const sprintFinalizado = { ...sprint, estado: 'EN_FINALIZACION', fechaFinalizacionIniciada: new Date() };
      tx.sprint.findFirst.mockResolvedValue(sprintFinalizado);

      const orden: string[] = [];
      const prisma = {
        $transaction: vi.fn(async (callback: any) => {
          const resultado = await callback(tx);
          orden.push('transaction-resuelta');
          return resultado;
        }),
      } as any;
      const context = makeSprintsContext();
      const notifications = makeNotifications();
      notifications.notifyProjectActiveParticipants.mockImplementation(async () => {
        orden.push('notificacion-bandeja');
      });
      notifications.notifySprintFinalizationStarted.mockImplementation(async () => {
        orden.push('notificacion-realtime');
      });
      const service = new SprintsService(prisma, context, authorization, notifications);

      await service.finalizeSprint(PROJECT_ID, SPRINT_ID, LIDER_ID);

      expect(orden).toEqual([
        'transaction-resuelta',
        'notificacion-bandeja',
        'notificacion-realtime',
      ]);
    });

    it('caso 10: si la transacción falla (rollback), las notificaciones nunca se llaman', async () => {
      const tx = makeTx();
      const authorization = makeSprintsAuthorization();
      authorization.assertCanFinalizeSprint.mockResolvedValue(sprintActivo());
      tx.tarea.count.mockResolvedValue(0);
      tx.sprint.updateMany.mockResolvedValue({ count: 1 });
      // Simula un fallo dentro de la transacción DESPUÉS del updateMany (p.
      // ej. la relectura final falla) — el callback de $transaction
      // propaga el rechazo tal como Prisma haría en un rollback real.
      const prisma = {
        $transaction: vi.fn(async (callback: any) => {
          tx.sprint.findFirst.mockResolvedValue(null);
          return callback(tx);
        }),
      } as any;
      const context = makeSprintsContext();
      const notifications = makeNotifications();
      const service = new SprintsService(prisma, context, authorization, notifications);

      await expect(service.finalizeSprint(PROJECT_ID, SPRINT_ID, LIDER_ID)).rejects.toThrow();
      expect(notifications.notifyProjectActiveParticipants).not.toHaveBeenCalled();
      expect(notifications.notifySprintFinalizationStarted).not.toHaveBeenCalled();
    });

    it('caso 11: updateMany.count === 0 (carrera perdida) -> ConflictException, sin notificar', async () => {
      const tx = makeTx();
      const authorization = makeSprintsAuthorization();
      authorization.assertCanFinalizeSprint.mockResolvedValue(sprintActivo());
      tx.tarea.count.mockResolvedValue(0);
      tx.sprint.updateMany.mockResolvedValue({ count: 0 }); // otra transacción ya ganó la carrera
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      const notifications = makeNotifications();
      const service = new SprintsService(prisma, context, authorization, notifications);

      await expect(service.finalizeSprint(PROJECT_ID, SPRINT_ID, LIDER_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(notifications.notifyProjectActiveParticipants).not.toHaveBeenCalled();
      expect(notifications.notifySprintFinalizationStarted).not.toHaveBeenCalled();
    });
  });

  describe('adjustRecognizedHours', () => {
    const PARTICIPATION_ID = 30;

    function registroHoras(overrides: Record<string, unknown> = {}) {
      return {
        idRegistroHoras: 100,
        idParticipacion: PARTICIPATION_ID,
        idSprint: SPRINT_ID,
        horasCalculadas: new Prisma.Decimal(10),
        horasAprobadas: null,
        justificacionAjuste: null,
        ...overrides,
      };
    }

    // AsignacionTarea nunca se toca desde A7: makeTx() no expone
    // `asignacionTarea` en absoluto, así que cualquier intento de
    // leerla/escribirla desde adjustRecognizedHours haría fallar la prueba
    // con un TypeError, demostrando la invariante de horasReales inmutable
    // (Sección 10 / criterio 13) sin necesitar una fila real de fixture.

    it('caso 1: aumento con justificación válida — acepta, persiste horasAprobadas y justificacionAjuste', async () => {
      const tx = makeTx();
      tx.horasParticipacion.findFirst.mockResolvedValue(registroHoras());
      const actualizado = registroHoras({ horasAprobadas: new Prisma.Decimal(15), justificacionAjuste: 'Horas extra validadas con evidencia' });
      tx.horasParticipacion.update.mockResolvedValue(actualizado);
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      const authorization = makeSprintsAuthorization();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      const dto = { horasAprobadas: 15, justificacionAjuste: 'Horas extra validadas con evidencia' };
      const result = await service.adjustRecognizedHours(PROJECT_ID, SPRINT_ID, PARTICIPATION_ID, LIDER_ID, dto);

      expect(result).toBe(actualizado);
      expect(tx.horasParticipacion.update).toHaveBeenCalledWith({
        where: { idRegistroHoras: 100 },
        data: { horasAprobadas: 15, justificacionAjuste: 'Horas extra validadas con evidencia' },
      });
    });

    it('caso 2: disminución con justificación válida — acepta, persiste horasAprobadas y justificacionAjuste', async () => {
      const tx = makeTx();
      tx.horasParticipacion.findFirst.mockResolvedValue(registroHoras());
      const actualizado = registroHoras({ horasAprobadas: new Prisma.Decimal(6), justificacionAjuste: 'Se descuentan horas no verificables' });
      tx.horasParticipacion.update.mockResolvedValue(actualizado);
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      const authorization = makeSprintsAuthorization();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      const dto = { horasAprobadas: 6, justificacionAjuste: 'Se descuentan horas no verificables' };
      const result = await service.adjustRecognizedHours(PROJECT_ID, SPRINT_ID, PARTICIPATION_ID, LIDER_ID, dto);

      expect(result).toBe(actualizado);
      expect(tx.horasParticipacion.update).toHaveBeenCalledWith({
        where: { idRegistroHoras: 100 },
        data: { horasAprobadas: 6, justificacionAjuste: 'Se descuentan horas no verificables' },
      });
    });

    it('caso 3: diferencia sin justificación (campo ausente) — lanza BadRequestException sin persistir', async () => {
      const tx = makeTx();
      tx.horasParticipacion.findFirst.mockResolvedValue(registroHoras());
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      const authorization = makeSprintsAuthorization();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      const dto = { horasAprobadas: 12 };
      await expect(
        service.adjustRecognizedHours(PROJECT_ID, SPRINT_ID, PARTICIPATION_ID, LIDER_ID, dto),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.horasParticipacion.update).not.toHaveBeenCalled();
    });

    it('caso 3b: justificación whitespace-only no satisface la regla — lanza BadRequestException sin persistir', async () => {
      const tx = makeTx();
      tx.horasParticipacion.findFirst.mockResolvedValue(registroHoras());
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      const authorization = makeSprintsAuthorization();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      const dto = { horasAprobadas: 12, justificacionAjuste: '   ' };
      await expect(
        service.adjustRecognizedHours(PROJECT_ID, SPRINT_ID, PARTICIPATION_ID, LIDER_ID, dto),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.horasParticipacion.update).not.toHaveBeenCalled();
    });

    it('caso 4: igualdad (horasAprobadas == horasCalculadas) sin justificación — acepta y persiste horasAprobadas', async () => {
      const tx = makeTx();
      tx.horasParticipacion.findFirst.mockResolvedValue(registroHoras({ horasCalculadas: new Prisma.Decimal(10) }));
      const actualizado = registroHoras({ horasAprobadas: new Prisma.Decimal(10) });
      tx.horasParticipacion.update.mockResolvedValue(actualizado);
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      const authorization = makeSprintsAuthorization();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      const dto = { horasAprobadas: 10 };
      const result = await service.adjustRecognizedHours(PROJECT_ID, SPRINT_ID, PARTICIPATION_ID, LIDER_ID, dto);

      expect(result).toBe(actualizado);
      expect(tx.horasParticipacion.update).toHaveBeenCalledWith({
        where: { idRegistroHoras: 100 },
        data: { horasAprobadas: 10, justificacionAjuste: null },
      });
    });

    it('caso 5: localiza el registro acotando por idParticipacion + idSprint + proyecto (aislamiento cross-project)', async () => {
      const tx = makeTx();
      tx.horasParticipacion.findFirst.mockResolvedValue(registroHoras({ horasCalculadas: new Prisma.Decimal(10) }));
      tx.horasParticipacion.update.mockResolvedValue(registroHoras({ horasAprobadas: new Prisma.Decimal(10) }));
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      const authorization = makeSprintsAuthorization();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      await service.adjustRecognizedHours(PROJECT_ID, SPRINT_ID, PARTICIPATION_ID, LIDER_ID, { horasAprobadas: 10 });

      expect(tx.horasParticipacion.findFirst).toHaveBeenCalledWith({
        where: {
          idParticipacion: PARTICIPATION_ID,
          idSprint: SPRINT_ID,
          participacion: { rolProyecto: { idProyecto: PROJECT_ID } },
        },
      });
      expect(authorization.assertCanAdjustRecognizedHours).toHaveBeenCalledWith(
        PROJECT_ID,
        SPRINT_ID,
        LIDER_ID,
        tx,
      );
    });

    it('caso 6: registro de horas inexistente para la participación/Sprint — lanza NotFoundException sin persistir', async () => {
      const tx = makeTx();
      tx.horasParticipacion.findFirst.mockResolvedValue(null);
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      const authorization = makeSprintsAuthorization();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      await expect(
        service.adjustRecognizedHours(PROJECT_ID, SPRINT_ID, PARTICIPATION_ID, LIDER_ID, { horasAprobadas: 5 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.horasParticipacion.update).not.toHaveBeenCalled();
    });

    it('caso 7: usuario no líder — propaga la excepción de autorización sin buscar ni persistir el registro', async () => {
      const tx = makeTx();
      const authorization = makeSprintsAuthorization();
      authorization.assertCanAdjustRecognizedHours.mockRejectedValue(
        new ForbiddenException('No eres el líder de este proyecto'),
      );
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      await expect(
        service.adjustRecognizedHours(PROJECT_ID, SPRINT_ID, PARTICIPATION_ID, LIDER_ID, { horasAprobadas: 5 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.horasParticipacion.findFirst).not.toHaveBeenCalled();
      expect(tx.horasParticipacion.update).not.toHaveBeenCalled();
    });

    it('caso 8: horasCalculadas null se rechaza (A7.1) — NUNCA se trata como 0, sin importar si se envía justificación', async () => {
      const tx = makeTx();
      tx.horasParticipacion.findFirst.mockResolvedValue(registroHoras({ horasCalculadas: null }));
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      const authorization = makeSprintsAuthorization();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      // Con el fallback antiguo (?? new Prisma.Decimal(0)) esta llamada con
      // justificación habría sido ACEPTADA (3 != 0, justificación presente).
      // A7.1 debe rechazarla igual: sin horasCalculadas persistido no hay
      // base de cálculo sobre la cual ajustar, independientemente de que se
      // envíe justificación.
      await expect(
        service.adjustRecognizedHours(PROJECT_ID, SPRINT_ID, PARTICIPATION_ID, LIDER_ID, {
          horasAprobadas: 3,
          justificacionAjuste: 'justificación válida no vacía',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.horasParticipacion.update).not.toHaveBeenCalled();
    });

    it('caso 8b: horasCalculadas null con horasAprobadas = 0 también se rechaza (no hay fallback implícito a 0)', async () => {
      const tx = makeTx();
      tx.horasParticipacion.findFirst.mockResolvedValue(registroHoras({ horasCalculadas: null }));
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      const authorization = makeSprintsAuthorization();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      // Con el fallback antiguo, horasAprobadas=0 habría igualado el 0
      // implícito y se habría aceptado SIN justificación. A7.1 debe
      // rechazar de todos modos: null nunca se interpreta como 0.
      await expect(
        service.adjustRecognizedHours(PROJECT_ID, SPRINT_ID, PARTICIPATION_ID, LIDER_ID, { horasAprobadas: 0 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.horasParticipacion.update).not.toHaveBeenCalled();
    });

    it('caso 9: horasReales de AsignacionTarea permanece exactamente igual antes/después del ajuste (invariante de la Sección 10)', async () => {
      // Fixture explícito de dos tramos AsignacionTarea con horasReales
      // conocidas, independiente del mock de HorasParticipacion — simula el
      // estado real de la base de datos antes y después de la operación.
      const asignacionesAntes = [
        { idAsignacion: 501, horasReales: new Prisma.Decimal(3) },
        { idAsignacion: 502, horasReales: new Prisma.Decimal(2) },
      ];
      // Copia profunda independiente para comparar "estado post-operación"
      // sin compartir referencia con `asignacionesAntes`.
      const asignacionTareaStore = asignacionesAntes.map((a) => ({ ...a, horasReales: new Prisma.Decimal(a.horasReales) }));

      const tx = makeTx();
      // AsignacionTarea SÍ está disponible en este tx (a diferencia de otros
      // casos de este describe), precisamente para poder leerla antes y
      // después y comparar valores reales, no solo ausencia de llamadas.
      (tx as any).asignacionTarea = {
        findMany: vi.fn(async () => asignacionTareaStore.map((a) => ({ ...a }))),
      };
      tx.horasParticipacion.findFirst.mockResolvedValue(registroHoras({ horasCalculadas: new Prisma.Decimal(10) }));
      tx.horasParticipacion.update.mockResolvedValue(registroHoras({ horasAprobadas: new Prisma.Decimal(10) }));
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      const authorization = makeSprintsAuthorization();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      const antes = await (tx as any).asignacionTarea.findMany();

      await service.adjustRecognizedHours(PROJECT_ID, SPRINT_ID, PARTICIPATION_ID, LIDER_ID, { horasAprobadas: 10 });

      const despues = await (tx as any).asignacionTarea.findMany();

      expect(despues).toHaveLength(antes.length);
      antes.forEach((asignacionAntes: { idAsignacion: number; horasReales: Prisma.Decimal }, index: number) => {
        const asignacionDespues = despues[index];
        expect(asignacionDespues.idAsignacion).toBe(asignacionAntes.idAsignacion);
        expect(asignacionDespues.horasReales.equals(asignacionAntes.horasReales)).toBe(true);
      });
      // Aserción explícita adicional por valor concreto, sin depender solo
      // del bucle: los dos tramos conservan exactamente 3 y 2.
      expect(despues[0].horasReales.equals(new Prisma.Decimal(3))).toBe(true);
      expect(despues[1].horasReales.equals(new Prisma.Decimal(2))).toBe(true);
      // adjustRecognizedHours nunca invoca asignacionTarea: la única
      // llamada registrada es la del propio test (antes/después), no del
      // servicio.
      expect((tx as any).asignacionTarea.findMany).toHaveBeenCalledTimes(2);
    });
  });
});
