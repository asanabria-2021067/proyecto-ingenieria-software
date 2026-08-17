import { describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SprintsService } from '../src/sprints/sprints.service';
import { SprintsContextService } from '../src/sprints/sprints-context.service';
import { SprintsAuthorizationService } from '../src/sprints/sprints-authorization.service';

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
    $queryRaw: vi.fn(),
    sprint: { findFirst: vi.fn(), findMany: vi.fn() },
    hito: { findMany: vi.fn() },
    // A12: getSprintDetail usa esto para calcular `porcentaje` por Hito
    // (TODAS las tareas vigentes del Hito en el proyecto). Por defecto []
    // para no romper los tests preexistentes de getSprintDetail que nunca
    // configuran este mock explícitamente.
    tarea: { findMany: vi.fn().mockResolvedValue([]) },
  } as any;
}

function makeSprintsContext() {
  return { getCurrentSprint: vi.fn() } as any;
}

function makeSprintsAuthorization() {
  return {
    assertCanStartSprint: vi.fn().mockResolvedValue(undefined),
    assertCanFinalizeSprint: vi.fn(),
    assertCanCloseSprint: vi.fn(),
    assertCanAdjustRecognizedHours: vi.fn().mockResolvedValue(undefined),
    assertCanViewClosingSummary: vi.fn().mockResolvedValue(undefined),
    assertCanListSprintHistory: vi.fn().mockResolvedValue(undefined),
    assertCanViewSprintHistory: vi.fn().mockResolvedValue(undefined),
  } as any;
}

function makeNotifications() {
  return {
    notifyProjectActiveParticipants: vi.fn().mockResolvedValue(undefined),
    notifySprintFinalizationStarted: vi.fn().mockResolvedValue(undefined),
    notifySprintClosed: vi.fn().mockResolvedValue(undefined),
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

    it('caso 6b (A7.1 multirol): ajustar la participación #51 nunca toca el registro de horas de la participación #87 del mismo usuario', async () => {
      const tx = makeTx();
      const registro51 = registroHoras({
        idRegistroHoras: 501,
        idParticipacion: 51,
        horasCalculadas: new Prisma.Decimal(10),
        horasAprobadas: null,
      });
      const registro87 = registroHoras({
        idRegistroHoras: 870,
        idParticipacion: 87,
        horasCalculadas: new Prisma.Decimal(8),
        horasAprobadas: new Prisma.Decimal(8),
      });
      tx.horasParticipacion.findFirst.mockImplementation(async ({ where }: any) => {
        if (where.idParticipacion === 51) return registro51;
        if (where.idParticipacion === 87) return registro87;
        return null;
      });
      tx.horasParticipacion.update.mockImplementation(async ({ where, data }: any) => {
        if (where.idRegistroHoras === 501) return { ...registro51, ...data };
        if (where.idRegistroHoras === 870) return { ...registro87, ...data };
        throw new Error(`update dirigido a un idRegistroHoras inesperado: ${where.idRegistroHoras}`);
      });
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      const authorization = makeSprintsAuthorization();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      const resultado51 = await service.adjustRecognizedHours(PROJECT_ID, SPRINT_ID, 51, LIDER_ID, {
        horasAprobadas: 12,
        justificacionAjuste: 'Se reconocen dos horas adicionales',
      });

      expect(resultado51.horasAprobadas).toBe(12);
      expect(tx.horasParticipacion.update).toHaveBeenCalledTimes(1);
      expect(tx.horasParticipacion.update).toHaveBeenCalledWith({
        where: { idRegistroHoras: 501 },
        data: { horasAprobadas: 12, justificacionAjuste: 'Se reconocen dos horas adicionales' },
      });
      // #87 nunca fue leída ni escrita por este ajuste: solo se consultó una
      // vez (para #51), y ningún update apuntó a su idRegistroHoras (870).
      expect(tx.horasParticipacion.findFirst).toHaveBeenCalledTimes(1);
      expect(tx.horasParticipacion.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ where: { idRegistroHoras: 870 } }),
      );
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

  describe('getSprintClosingSummary', () => {
    function participanteRaw(overrides: Record<string, unknown> = {}) {
      return {
        idUsuario: 40,
        nombre: 'Ana',
        apellido: 'Pérez',
        correo: 'ana@example.test',
        fotoUrl: null,
        roles: [{ idRolProyecto: 1, nombreRol: 'Desarrollador' }],
        tareasRealizadas: 2,
        horasReportadas: 10,
        horasCalculadas: 10,
        horasAprobadas: 10,
        participaciones: [
          {
            idParticipacion: 501,
            idRolProyecto: 1,
            nombreRol: 'Desarrollador',
            horasReportadas: 10,
            horasCalculadas: 10,
            horasAprobadas: 10,
            justificacionAjuste: null,
          },
        ],
        ...overrides,
      };
    }

    it('caso feliz: devuelve un summary tipado con múltiples participantes, sin transformar las filas agregadas', async () => {
      const tx = makeTx();
      const filas = [
        participanteRaw({ idUsuario: 40 }),
        participanteRaw({
          idUsuario: 41,
          nombre: 'Beto',
          roles: [
            { idRolProyecto: 1, nombreRol: 'Desarrollador' },
            { idRolProyecto: 2, nombreRol: 'QA' },
          ],
          tareasRealizadas: 5,
          horasReportadas: 8,
          horasCalculadas: 7,
          horasAprobadas: 7,
        }),
      ];
      const prisma = makePrisma(tx);
      prisma.$queryRaw.mockResolvedValue(filas);
      const context = makeSprintsContext();
      const authorization = makeSprintsAuthorization();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      const result = await service.getSprintClosingSummary(PROJECT_ID, SPRINT_ID, LIDER_ID);

      expect(result).toEqual({
        idProyecto: PROJECT_ID,
        idSprint: SPRINT_ID,
        participantes: filas,
      });
      expect(authorization.assertCanViewClosingSummary).toHaveBeenCalledWith(
        PROJECT_ID,
        SPRINT_ID,
        LIDER_ID,
      );
    });

    it('caso multirol: una persona con varios roles llega como UNA sola fila con roles.length > 1 (paso directo, sin duplicar)', async () => {
      const tx = makeTx();
      const filaMultirol = participanteRaw({
        idUsuario: 42,
        roles: [
          { idRolProyecto: 1, nombreRol: 'Desarrollador' },
          { idRolProyecto: 3, nombreRol: 'Líder técnico' },
        ],
      });
      const prisma = makePrisma(tx);
      prisma.$queryRaw.mockResolvedValue([filaMultirol]);
      const context = makeSprintsContext();
      const authorization = makeSprintsAuthorization();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      const result = await service.getSprintClosingSummary(PROJECT_ID, SPRINT_ID, LIDER_ID);

      expect(result.participantes).toHaveLength(1);
      expect(result.participantes[0].idUsuario).toBe(42);
      expect(result.participantes[0].roles).toHaveLength(2);
    });

    describe('A8.1 — desglose por participación (participaciones[])', () => {
      it('multirol: expone una entrada de participaciones[] por cada ParticipacionProyecto, con su idParticipacion propio', async () => {
        const tx = makeTx();
        const filaMultirol = participanteRaw({
          idUsuario: 42,
          roles: [
            { idRolProyecto: 1, nombreRol: 'Desarrollador' },
            { idRolProyecto: 3, nombreRol: 'Líder técnico' },
          ],
          tareasRealizadas: 5,
          horasReportadas: 18,
          horasCalculadas: 18,
          horasAprobadas: 18,
          participaciones: [
            {
              idParticipacion: 51,
              idRolProyecto: 1,
              nombreRol: 'Desarrollador',
              horasReportadas: 10,
              horasCalculadas: 10,
              horasAprobadas: 10,
              justificacionAjuste: null,
            },
            {
              idParticipacion: 87,
              idRolProyecto: 3,
              nombreRol: 'Líder técnico',
              horasReportadas: 8,
              horasCalculadas: 8,
              horasAprobadas: 8,
              justificacionAjuste: null,
            },
          ],
        });
        const prisma = makePrisma(tx);
        prisma.$queryRaw.mockResolvedValue([filaMultirol]);
        const context = makeSprintsContext();
        const authorization = makeSprintsAuthorization();
        const service = new SprintsService(prisma, context, authorization, makeNotifications());

        const result = await service.getSprintClosingSummary(PROJECT_ID, SPRINT_ID, LIDER_ID);

        const persona = result.participantes[0];
        expect(persona.participaciones).toHaveLength(2);
        const ids = persona.participaciones.map((p) => p.idParticipacion).sort();
        expect(ids).toEqual([51, 87]);
        // El total person-centric sigue siendo la SUMA de las participaciones,
        // nunca un valor distinto inventado por el paso-through.
        expect(persona.horasCalculadas).toBe(
          persona.participaciones.reduce((acc, p) => acc + (p.horasCalculadas ?? 0), 0),
        );
        expect(persona.horasAprobadas).toBe(
          persona.participaciones.reduce((acc, p) => acc + (p.horasAprobadas ?? 0), 0),
        );
      });

      it('preserva justificacionAjuste ya persistida en la participación correcta, sin filtrarla a otras', async () => {
        const tx = makeTx();
        const filaMultirol = participanteRaw({
          idUsuario: 42,
          participaciones: [
            {
              idParticipacion: 51,
              idRolProyecto: 1,
              nombreRol: 'Desarrollador',
              horasReportadas: 10,
              horasCalculadas: 10,
              horasAprobadas: 12,
              justificacionAjuste: 'Se reconocen dos horas adicionales por soporte fuera de horario.',
            },
            {
              idParticipacion: 87,
              idRolProyecto: 3,
              nombreRol: 'Líder técnico',
              horasReportadas: 8,
              horasCalculadas: 8,
              horasAprobadas: 8,
              justificacionAjuste: null,
            },
          ],
        });
        const prisma = makePrisma(tx);
        prisma.$queryRaw.mockResolvedValue([filaMultirol]);
        const context = makeSprintsContext();
        const authorization = makeSprintsAuthorization();
        const service = new SprintsService(prisma, context, authorization, makeNotifications());

        const result = await service.getSprintClosingSummary(PROJECT_ID, SPRINT_ID, LIDER_ID);

        const persona = result.participantes[0];
        const p51 = persona.participaciones.find((p) => p.idParticipacion === 51)!;
        const p87 = persona.participaciones.find((p) => p.idParticipacion === 87)!;
        expect(p51.justificacionAjuste).toBe(
          'Se reconocen dos horas adicionales por soporte fuera de horario.',
        );
        expect(p87.justificacionAjuste).toBeNull();
      });

      it('participación única: participaciones tiene exactamente un elemento, sin desglose superfluo', async () => {
        const tx = makeTx();
        const prisma = makePrisma(tx);
        prisma.$queryRaw.mockResolvedValue([participanteRaw()]);
        const context = makeSprintsContext();
        const authorization = makeSprintsAuthorization();
        const service = new SprintsService(prisma, context, authorization, makeNotifications());

        const result = await service.getSprintClosingSummary(PROJECT_ID, SPRINT_ID, LIDER_ID);

        expect(result.participantes[0].participaciones).toHaveLength(1);
        expect(result.participantes[0].participaciones[0].idParticipacion).toBe(501);
      });

      it('horasCalculadas/horasAprobadas nulas por participación se preservan como null, sin normalizarlas a 0', async () => {
        const tx = makeTx();
        const filaSinCalculo = participanteRaw({
          horasCalculadas: 0,
          horasAprobadas: 0,
          participaciones: [
            {
              idParticipacion: 501,
              idRolProyecto: 1,
              nombreRol: 'Desarrollador',
              horasReportadas: 0,
              horasCalculadas: null,
              horasAprobadas: null,
              justificacionAjuste: null,
            },
          ],
        });
        const prisma = makePrisma(tx);
        prisma.$queryRaw.mockResolvedValue([filaSinCalculo]);
        const context = makeSprintsContext();
        const authorization = makeSprintsAuthorization();
        const service = new SprintsService(prisma, context, authorization, makeNotifications());

        const result = await service.getSprintClosingSummary(PROJECT_ID, SPRINT_ID, LIDER_ID);

        expect(result.participantes[0].participaciones[0].horasCalculadas).toBeNull();
        expect(result.participantes[0].participaciones[0].horasAprobadas).toBeNull();
      });
    });

    it('ausencia de datos: Sprint sin contribuciones devuelve participantes: [], no un error', async () => {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      prisma.$queryRaw.mockResolvedValue([]);
      const context = makeSprintsContext();
      const authorization = makeSprintsAuthorization();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      const result = await service.getSprintClosingSummary(PROJECT_ID, SPRINT_ID, LIDER_ID);

      expect(result).toEqual({ idProyecto: PROJECT_ID, idSprint: SPRINT_ID, participantes: [] });
    });

    it('Sprint ajeno al proyecto: propaga NotFoundException sin ejecutar la consulta agregada', async () => {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      const authorization = makeSprintsAuthorization();
      authorization.assertCanViewClosingSummary.mockRejectedValue(
        new NotFoundException(`Sprint con id ${SPRINT_ID} no encontrado en el proyecto ${PROJECT_ID}`),
      );
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      await expect(
        service.getSprintClosingSummary(PROJECT_ID, SPRINT_ID, LIDER_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('usuario no líder: propaga ForbiddenException sin ejecutar la consulta agregada', async () => {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      const authorization = makeSprintsAuthorization();
      authorization.assertCanViewClosingSummary.mockRejectedValue(
        new ForbiddenException('No eres el líder de este proyecto'),
      );
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      await expect(
        service.getSprintClosingSummary(PROJECT_ID, SPRINT_ID, NO_LIDER_ID),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('aislamiento: la consulta agregada parametriza projectId y sprintId (sin concatenación de strings)', async () => {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      prisma.$queryRaw.mockResolvedValue([]);
      const context = makeSprintsContext();
      const authorization = makeSprintsAuthorization();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      await service.getSprintClosingSummary(PROJECT_ID, SPRINT_ID, LIDER_ID);

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      const sqlArg = prisma.$queryRaw.mock.calls[0][0] as { values: unknown[]; strings: string[] };
      // Prisma.sql produce un objeto con `.values` (los parámetros reales
      // que viajarán como $1, $2, ... — nunca interpolados directamente en
      // `.strings`), evidencia de que la consulta usa parametrización
      // segura, no concatenación de strings.
      expect(Array.isArray(sqlArg.values)).toBe(true);
      expect(Array.isArray(sqlArg.strings)).toBe(true);
      expect(sqlArg.values).toContain(PROJECT_ID);
      expect(sqlArg.values).toContain(SPRINT_ID);
      expect(sqlArg.strings.join('')).not.toContain(String(PROJECT_ID));
      expect(sqlArg.strings.join('')).not.toContain(String(SPRINT_ID));
    });

    it('query count: exactamente 2 consultas de base de datos (contexto+autorización + agregación), sin crecer con N participantes', async () => {
      async function contarQueriesParaNParticipantes(n: number) {
        const sprintFilas = Array.from({ length: n }, (_, i) => participanteRaw({ idUsuario: 100 + i }));
        const sprintFindFirst = vi.fn().mockResolvedValue({
          idSprint: SPRINT_ID,
          idProyecto: PROJECT_ID,
          proyecto: { creadoPor: LIDER_ID, eliminadoEn: null },
        });
        const queryRaw = vi.fn().mockResolvedValue(sprintFilas);
        const prisma = { sprint: { findFirst: sprintFindFirst }, $queryRaw: queryRaw } as any;

        // Servicios reales (no mocks de conveniencia) para que el conteo
        // refleje exactamente las llamadas a Prisma que la cadena
        // real autorización -> agregación efectúa.
        const context = new SprintsContextService(prisma);
        const authorization = new SprintsAuthorizationService(context);
        const service = new SprintsService(prisma, context, authorization, makeNotifications());

        const result = await service.getSprintClosingSummary(PROJECT_ID, SPRINT_ID, LIDER_ID);

        expect(result.participantes).toHaveLength(n);
        expect(sprintFindFirst).toHaveBeenCalledTimes(1);
        expect(queryRaw).toHaveBeenCalledTimes(1);
      }

      await contarQueriesParaNParticipantes(1);
      await contarQueriesParaNParticipantes(5);
    });
  });

  describe('closeSprint', () => {
    function sprintEnFinalizacion(overrides: Record<string, unknown> = {}) {
      return {
        idSprint: SPRINT_ID,
        idProyecto: PROJECT_ID,
        numero: 3,
        estado: 'EN_FINALIZACION',
        fechaCierre: null,
        cerradoPor: null,
        ...overrides,
      };
    }

    it('caso 1: cierre exitoso — EN_FINALIZACION -> CERRADO, persiste fechaCierre y cerradoPor', async () => {
      const tx = makeTx();
      const sprint = sprintEnFinalizacion();
      const authorization = makeSprintsAuthorization();
      authorization.assertCanCloseSprint.mockResolvedValue(sprint);
      tx.sprint.updateMany.mockResolvedValue({ count: 1 });
      const sprintCerrado = {
        ...sprint,
        estado: 'CERRADO',
        fechaCierre: new Date('2026-08-20T10:00:00Z'),
        cerradoPor: LIDER_ID,
      };
      tx.sprint.findFirst.mockResolvedValue(sprintCerrado);
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      const notifications = makeNotifications();
      const service = new SprintsService(prisma, context, authorization, notifications);

      const result = await service.closeSprint(PROJECT_ID, SPRINT_ID, LIDER_ID);

      expect(result).toBe(sprintCerrado);
      expect(tx.sprint.updateMany).toHaveBeenCalledWith({
        where: { idSprint: SPRINT_ID, idProyecto: PROJECT_ID, estado: 'EN_FINALIZACION' },
        data: {
          estado: 'CERRADO',
          fechaCierre: expect.any(Date),
          cerradoPor: LIDER_ID,
        },
      });
      // A9.1: SPRINT_CLOSED se emite exactamente una vez, con el payload real.
      expect(notifications.notifySprintClosed).toHaveBeenCalledTimes(1);
      expect(notifications.notifySprintClosed).toHaveBeenCalledWith(PROJECT_ID, LIDER_ID, {
        projectId: PROJECT_ID,
        sprintId: SPRINT_ID,
      });
    });

    describe('A9.1 — SPRINT_CLOSED realtime post-commit', () => {
      it('se emite DESPUÉS de que la transacción resuelve (no antes ni dentro): el orden de llamadas lo demuestra', async () => {
        const tx = makeTx();
        const sprint = sprintEnFinalizacion();
        const authorization = makeSprintsAuthorization();
        authorization.assertCanCloseSprint.mockResolvedValue(sprint);
        tx.sprint.updateMany.mockResolvedValue({ count: 1 });
        const sprintCerrado = { ...sprint, estado: 'CERRADO' };
        tx.sprint.findFirst.mockResolvedValue(sprintCerrado);
        const prisma = makePrisma(tx);
        const context = makeSprintsContext();
        const notifications = makeNotifications();
        const llamadas: string[] = [];
        tx.sprint.updateMany.mockImplementation(async () => {
          llamadas.push('updateMany');
          return { count: 1 };
        });
        notifications.notifySprintClosed.mockImplementation(async () => {
          llamadas.push('notifySprintClosed');
        });
        const service = new SprintsService(prisma, context, authorization, notifications);

        await service.closeSprint(PROJECT_ID, SPRINT_ID, LIDER_ID);

        expect(llamadas).toEqual(['updateMany', 'notifySprintClosed']);
      });

      it('si la transacción falla (Sprint ya no EN_FINALIZACION), SPRINT_CLOSED nunca se emite', async () => {
        const tx = makeTx();
        const authorization = makeSprintsAuthorization();
        authorization.assertCanCloseSprint.mockResolvedValue(sprintEnFinalizacion({ estado: 'ACTIVO' }));
        const prisma = makePrisma(tx);
        const context = makeSprintsContext();
        const notifications = makeNotifications();
        const service = new SprintsService(prisma, context, authorization, notifications);

        await expect(service.closeSprint(PROJECT_ID, SPRINT_ID, LIDER_ID)).rejects.toBeInstanceOf(
          ConflictException,
        );
        expect(notifications.notifySprintClosed).not.toHaveBeenCalled();
      });

      it('si la carrera del updateMany pierde (count=0), SPRINT_CLOSED nunca se emite', async () => {
        const tx = makeTx();
        const authorization = makeSprintsAuthorization();
        authorization.assertCanCloseSprint.mockResolvedValue(sprintEnFinalizacion());
        tx.sprint.updateMany.mockResolvedValue({ count: 0 });
        const prisma = makePrisma(tx);
        const context = makeSprintsContext();
        const notifications = makeNotifications();
        const service = new SprintsService(prisma, context, authorization, notifications);

        await expect(service.closeSprint(PROJECT_ID, SPRINT_ID, LIDER_ID)).rejects.toBeInstanceOf(
          ConflictException,
        );
        expect(notifications.notifySprintClosed).not.toHaveBeenCalled();
      });

      it('un Sprint rechazado por autorización (no líder) nunca emite SPRINT_CLOSED', async () => {
        const tx = makeTx();
        const authorization = makeSprintsAuthorization();
        authorization.assertCanCloseSprint.mockRejectedValue(
          new ForbiddenException('No eres el líder de este proyecto'),
        );
        const prisma = makePrisma(tx);
        const context = makeSprintsContext();
        const notifications = makeNotifications();
        const service = new SprintsService(prisma, context, authorization, notifications);

        await expect(
          service.closeSprint(PROJECT_ID, SPRINT_ID, NO_LIDER_ID),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(notifications.notifySprintClosed).not.toHaveBeenCalled();
      });
    });

    it('caso 2: Sprint ACTIVO — rechaza sin persistir metadata de cierre', async () => {
      const tx = makeTx();
      const authorization = makeSprintsAuthorization();
      authorization.assertCanCloseSprint.mockResolvedValue(sprintEnFinalizacion({ estado: 'ACTIVO' }));
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      await expect(service.closeSprint(PROJECT_ID, SPRINT_ID, LIDER_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(tx.sprint.updateMany).not.toHaveBeenCalled();
    });

    it('caso 3: Sprint ya CERRADO — rechaza sin alterar fechaCierre/cerradoPor existentes', async () => {
      const tx = makeTx();
      const authorization = makeSprintsAuthorization();
      const fechaCierreExistente = new Date('2026-08-15T00:00:00Z');
      authorization.assertCanCloseSprint.mockResolvedValue(
        sprintEnFinalizacion({ estado: 'CERRADO', fechaCierre: fechaCierreExistente, cerradoPor: 99 }),
      );
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      await expect(service.closeSprint(PROJECT_ID, SPRINT_ID, LIDER_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(tx.sprint.updateMany).not.toHaveBeenCalled();
    });

    it('caso 4: el estado cambia entre la autorización y el updateMany (carrera) — count=0 rechaza sin sobrescribir', async () => {
      const tx = makeTx();
      const authorization = makeSprintsAuthorization();
      // La autorización/lectura inicial todavía ve EN_FINALIZACION, pero
      // para cuando el updateMany condicionado se ejecuta, otra transacción
      // ya cambió el estado real (p. ej. otro cierre concurrente ya ganó) —
      // simulado aquí con count: 0 sin importar la causa exacta.
      authorization.assertCanCloseSprint.mockResolvedValue(sprintEnFinalizacion());
      tx.sprint.updateMany.mockResolvedValue({ count: 0 });
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      await expect(service.closeSprint(PROJECT_ID, SPRINT_ID, LIDER_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
      // La revalidación SÍ se intentó (no se depende únicamente de la
      // lectura previa de autorización) — el updateMany fue llamado con la
      // condición correcta — pero como count=0, no hay relectura ni
      // sobrescritura posterior.
      expect(tx.sprint.updateMany).toHaveBeenCalledWith({
        where: { idSprint: SPRINT_ID, idProyecto: PROJECT_ID, estado: 'EN_FINALIZACION' },
        data: expect.objectContaining({ estado: 'CERRADO' }),
      });
    });

    it('caso 5: usuario no líder — propaga la excepción de autorización sin ejecutar updateMany', async () => {
      const tx = makeTx();
      const authorization = makeSprintsAuthorization();
      authorization.assertCanCloseSprint.mockRejectedValue(
        new ForbiddenException('No eres el líder de este proyecto'),
      );
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      await expect(
        service.closeSprint(PROJECT_ID, SPRINT_ID, NO_LIDER_ID),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.sprint.updateMany).not.toHaveBeenCalled();
    });

    it('caso 6: aislamiento cross-project — sprintId ajeno al proyecto se rechaza vía assertCanCloseSprint, sin ejecutar updateMany', async () => {
      const tx = makeTx();
      const authorization = makeSprintsAuthorization();
      authorization.assertCanCloseSprint.mockRejectedValue(
        new NotFoundException(`Sprint con id ${SPRINT_ID} no encontrado en el proyecto ${PROJECT_ID}`),
      );
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      await expect(
        service.closeSprint(PROJECT_ID, SPRINT_ID, LIDER_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.sprint.updateMany).not.toHaveBeenCalled();
    });

    it('caso 7: preserva las horas de A7 — closeSprint nunca lee ni escribe HorasParticipacion/AsignacionTarea', async () => {
      const tx = makeTx();
      const sprint = sprintEnFinalizacion();
      const authorization = makeSprintsAuthorization();
      authorization.assertCanCloseSprint.mockResolvedValue(sprint);
      tx.sprint.updateMany.mockResolvedValue({ count: 1 });
      tx.sprint.findFirst.mockResolvedValue({ ...sprint, estado: 'CERRADO' });
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      await service.closeSprint(PROJECT_ID, SPRINT_ID, LIDER_ID);

      expect(tx.horasParticipacion.findFirst).not.toHaveBeenCalled();
      expect(tx.horasParticipacion.update).not.toHaveBeenCalled();
      // makeTx() tampoco expone asignacionTarea: si closeSprint intentara
      // tocarla, la llamada fallaría con TypeError antes de llegar aquí.
      expect((tx as any).asignacionTarea).toBeUndefined();
    });

    it('terminalidad: una segunda llamada a closeSprint sobre un Sprint ya CERRADO se rechaza (mismo caso 3, verificado explícitamente como "terminal")', async () => {
      const tx = makeTx();
      const authorization = makeSprintsAuthorization();
      authorization.assertCanCloseSprint.mockResolvedValue(
        sprintEnFinalizacion({ estado: 'CERRADO', fechaCierre: new Date('2026-08-15'), cerradoPor: LIDER_ID }),
      );
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      await expect(service.closeSprint(PROJECT_ID, SPRINT_ID, LIDER_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('terminalidad: finalizeSprint sobre un Sprint CERRADO sigue rechazando (A4 intacta, sin ruta de reapertura)', async () => {
      const tx = makeTx();
      const authorization = makeSprintsAuthorization();
      authorization.assertCanFinalizeSprint.mockResolvedValue(
        sprintEnFinalizacion({ estado: 'CERRADO', fechaCierre: new Date('2026-08-15'), cerradoPor: LIDER_ID }),
      );
      const prisma = makePrisma(tx);
      const context = makeSprintsContext();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      await expect(
        service.finalizeSprint(PROJECT_ID, SPRINT_ID, LIDER_ID),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.sprint.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('listSprints', () => {
    function sprintRow(overrides: Record<string, unknown> = {}) {
      return {
        idSprint: 1,
        idProyecto: PROJECT_ID,
        numero: 1,
        estado: 'CERRADO',
        fechaInicio: new Date('2026-01-01'),
        fechaFinalizacionIniciada: new Date('2026-01-20'),
        fechaCierre: new Date('2026-01-25'),
        ...overrides,
      };
    }

    function agregadoRaw(overrides: Record<string, unknown> = {}) {
      return { idSprint: 1, tareas: 0, hitos: 0, horasEstimadas: 0, ...overrides };
    }

    it('caso 1: proyecto con varios Sprints — devuelve exclusivamente los suyos, con agregados A10.1 fusionados', async () => {
      const filas = [sprintRow({ idSprint: 2, numero: 2 }), sprintRow({ idSprint: 1, numero: 1 })];
      const prisma = makePrisma();
      prisma.sprint.findMany.mockResolvedValue(filas);
      prisma.$queryRaw.mockResolvedValue([
        agregadoRaw({ idSprint: 2, tareas: 5, hitos: 2, horasEstimadas: 20 }),
        agregadoRaw({ idSprint: 1, tareas: 3, hitos: 1, horasEstimadas: 10 }),
      ]);
      const context = makeSprintsContext();
      const authorization = makeSprintsAuthorization();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      const result = await service.listSprints(PROJECT_ID, LIDER_ID);

      expect(result).toEqual([
        { ...filas[0], tareas: 5, hitos: 2, horasEstimadas: 20 },
        { ...filas[1], tareas: 3, hitos: 1, horasEstimadas: 10 },
      ]);
      expect(authorization.assertCanListSprintHistory).toHaveBeenCalledWith(PROJECT_ID, LIDER_ID);
    });

    it('caso 2: proyecto sin Sprints — devuelve [] sin lanzar error artificial', async () => {
      const prisma = makePrisma();
      prisma.sprint.findMany.mockResolvedValue([]);
      prisma.$queryRaw.mockResolvedValue([]);
      const context = makeSprintsContext();
      const authorization = makeSprintsAuthorization();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      const result = await service.listSprints(PROJECT_ID, LIDER_ID);

      expect(result).toEqual([]);
    });

    it('caso 3: aislamiento — el where de la consulta de Sprints filtra por idProyecto, no un filtro posterior en JS', async () => {
      const prisma = makePrisma();
      prisma.sprint.findMany.mockResolvedValue([]);
      prisma.$queryRaw.mockResolvedValue([]);
      const context = makeSprintsContext();
      const authorization = makeSprintsAuthorization();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      await service.listSprints(PROJECT_ID, LIDER_ID);

      expect(prisma.sprint.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { idProyecto: PROJECT_ID } }),
      );
    });

    it('caso 4: tipado/metadata — los campos de metadata del SprintListItem corresponden a los datos persistidos', async () => {
      const fila = sprintRow({ idSprint: 5, numero: 3, estado: 'ACTIVO', fechaFinalizacionIniciada: null, fechaCierre: null });
      const prisma = makePrisma();
      prisma.sprint.findMany.mockResolvedValue([fila]);
      prisma.$queryRaw.mockResolvedValue([]);
      const context = makeSprintsContext();
      const authorization = makeSprintsAuthorization();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      const result = await service.listSprints(PROJECT_ID, LIDER_ID);

      expect(result[0]).toEqual({ ...fila, tareas: 0, hitos: 0, horasEstimadas: 0 });
    });

    it('usuario no líder: propaga la excepción de autorización sin ejecutar ninguna consulta', async () => {
      const prisma = makePrisma();
      const context = makeSprintsContext();
      const authorization = makeSprintsAuthorization();
      authorization.assertCanListSprintHistory.mockRejectedValue(
        new ForbiddenException('No eres el líder de este proyecto'),
      );
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      await expect(service.listSprints(PROJECT_ID, NO_LIDER_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.sprint.findMany).not.toHaveBeenCalled();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    describe('A10.1 — agregados de tareas/hitos/horas estimadas', () => {
      it('un Sprint sin tareas (sin fila en el agregado) recibe 0/0/0, nunca se omite de la lista', async () => {
        const fila = sprintRow({ idSprint: 9 });
        const prisma = makePrisma();
        prisma.sprint.findMany.mockResolvedValue([fila]);
        prisma.$queryRaw.mockResolvedValue([]); // ninguna fila agregada para idSprint 9
        const context = makeSprintsContext();
        const authorization = makeSprintsAuthorization();
        const service = new SprintsService(prisma, context, authorization, makeNotifications());

        const result = await service.listSprints(PROJECT_ID, LIDER_ID);

        expect(result[0]).toEqual({ ...fila, tareas: 0, hitos: 0, horasEstimadas: 0 });
      });

      it('hitos deduplica: varias tareas del mismo hito cuentan una sola vez (ya resuelto por COUNT DISTINCT en SQL, se verifica el paso-through)', async () => {
        const fila = sprintRow({ idSprint: 1 });
        const prisma = makePrisma();
        prisma.sprint.findMany.mockResolvedValue([fila]);
        // 3 tareas, 2 sobre el mismo Hito 5, 1 sobre el Hito 8 -> hitos = 2 (ya deduplicado por la SQL real).
        prisma.$queryRaw.mockResolvedValue([agregadoRaw({ idSprint: 1, tareas: 3, hitos: 2, horasEstimadas: 14 })]);
        const context = makeSprintsContext();
        const authorization = makeSprintsAuthorization();
        const service = new SprintsService(prisma, context, authorization, makeNotifications());

        const result = await service.listSprints(PROJECT_ID, LIDER_ID);

        expect(result[0].hitos).toBe(2);
        expect(result[0].tareas).toBe(3);
      });

      it('horasEstimadas preserva decimales (2.5 + 4 + 7.5 = 14)', async () => {
        const fila = sprintRow({ idSprint: 1 });
        const prisma = makePrisma();
        prisma.sprint.findMany.mockResolvedValue([fila]);
        prisma.$queryRaw.mockResolvedValue([agregadoRaw({ idSprint: 1, tareas: 3, hitos: 0, horasEstimadas: 14 })]);
        const context = makeSprintsContext();
        const authorization = makeSprintsAuthorization();
        const service = new SprintsService(prisma, context, authorization, makeNotifications());

        const result = await service.listSprints(PROJECT_ID, LIDER_ID);

        expect(result[0].horasEstimadas).toBe(14);
      });

      it('varios Sprints del mismo proyecto: cada uno recibe exclusivamente sus propios agregados, sin mezclarse', async () => {
        const filas = [sprintRow({ idSprint: 1 }), sprintRow({ idSprint: 2 })];
        const prisma = makePrisma();
        prisma.sprint.findMany.mockResolvedValue(filas);
        prisma.$queryRaw.mockResolvedValue([
          agregadoRaw({ idSprint: 1, tareas: 3, hitos: 1, horasEstimadas: 10 }),
          agregadoRaw({ idSprint: 2, tareas: 8, hitos: 4, horasEstimadas: 30 }),
        ]);
        const context = makeSprintsContext();
        const authorization = makeSprintsAuthorization();
        const service = new SprintsService(prisma, context, authorization, makeNotifications());

        const result = await service.listSprints(PROJECT_ID, LIDER_ID);

        const sprint1 = result.find((s) => s.idSprint === 1)!;
        const sprint2 = result.find((s) => s.idSprint === 2)!;
        expect(sprint1).toMatchObject({ tareas: 3, hitos: 1, horasEstimadas: 10 });
        expect(sprint2).toMatchObject({ tareas: 8, hitos: 4, horasEstimadas: 30 });
      });

      it('aislamiento: la consulta agregada parametriza projectId (sin concatenación de strings)', async () => {
        const prisma = makePrisma();
        prisma.sprint.findMany.mockResolvedValue([]);
        prisma.$queryRaw.mockResolvedValue([]);
        const context = makeSprintsContext();
        const authorization = makeSprintsAuthorization();
        const service = new SprintsService(prisma, context, authorization, makeNotifications());

        await service.listSprints(PROJECT_ID, LIDER_ID);

        const sqlArg = prisma.$queryRaw.mock.calls[0][0] as { values: unknown[]; strings: string[] };
        expect(Array.isArray(sqlArg.values)).toBe(true);
        expect(sqlArg.values).toContain(PROJECT_ID);
        expect(sqlArg.strings.join('')).not.toContain(String(PROJECT_ID));
      });

      it('query count: exactamente 2 consultas (findMany + $queryRaw agregado), sin crecer con N Sprints', async () => {
        const filas = Array.from({ length: 6 }, (_, i) => sprintRow({ idSprint: i + 1, numero: i + 1 }));
        const prisma = makePrisma();
        prisma.sprint.findMany.mockResolvedValue(filas);
        prisma.$queryRaw.mockResolvedValue([]);
        const context = makeSprintsContext();
        const authorization = makeSprintsAuthorization();
        const service = new SprintsService(prisma, context, authorization, makeNotifications());

        const result = await service.listSprints(PROJECT_ID, LIDER_ID);

        expect(result).toHaveLength(6);
        expect(prisma.sprint.findMany).toHaveBeenCalledTimes(1);
        expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('getSprintDetail', () => {
    const AUTOR_SELECT = { idUsuario: true, nombre: true, apellido: true, fotoUrl: true };

    function usuarioPublico(overrides: Record<string, unknown> = {}) {
      return { idUsuario: 40, nombre: 'Ana', apellido: 'Pérez', fotoUrl: null, ...overrides };
    }

    function sprintConTareas(tareas: unknown[], overrides: Record<string, unknown> = {}) {
      return {
        idSprint: SPRINT_ID,
        idProyecto: PROJECT_ID,
        numero: 3,
        estado: 'CERRADO',
        fechaInicio: new Date('2026-01-01'),
        fechaFinalizacionIniciada: new Date('2026-01-20'),
        fechaCierre: new Date('2026-01-25'),
        cerradoPor: LIDER_ID,
        tareas,
        ...overrides,
      };
    }

    it('caso 1: Sprint cerrado completo — reconstruye metadata, tareas, asignaciones, comentarios e hitos', async () => {
      const prisma = makePrisma();
      const tarea = {
        idTarea: 100,
        tituloTarea: 'TASK-HISTORY',
        descripcionTarea: 'desc',
        estadoTarea: 'HECHO',
        prioridad: 'MEDIA',
        idHito: 200,
        fechaCreacion: new Date('2026-01-02'),
        fechaLimite: new Date('2026-01-15'),
        tiempoEstimadoHoras: 10,
        asignaciones: [
          {
            idAsignacion: 300,
            usuario: usuarioPublico(),
            fechaAsignacion: new Date('2026-01-02'),
            desasignadaEn: new Date('2026-01-10'),
            horasReales: { toNumber: () => 5 },
          },
        ],
        comentarios: [
          {
            idComentario: 400,
            autor: usuarioPublico({ idUsuario: 41, nombre: 'Beto' }),
            contenido: 'COMMENT-HISTORY',
            creadoEn: new Date('2026-01-05'),
          },
        ],
      };
      prisma.sprint.findFirst.mockResolvedValue(sprintConTareas([tarea]));
      prisma.hito.findMany.mockResolvedValue([{ idHito: 200, tituloHito: 'MILESTONE-A', estadoHito: 'COMPLETADO' }]);
      // A12: porcentaje se deriva de TODAS las tareas vigentes del Hito en
      // el proyecto (aquí: 1 de 1 HECHO -> 100%), coherente con el
      // estadoHito COMPLETADO ya persistido/mockeado arriba.
      prisma.tarea.findMany.mockResolvedValue([{ idHito: 200, estadoTarea: 'HECHO' }]);
      const context = makeSprintsContext();
      const authorization = makeSprintsAuthorization();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      const result = await service.getSprintDetail(PROJECT_ID, SPRINT_ID, LIDER_ID);

      expect(result.idSprint).toBe(SPRINT_ID);
      expect(result.estado).toBe('CERRADO');
      expect(result.fechaCierre).toEqual(new Date('2026-01-25'));
      expect(result.cerradoPor).toBe(LIDER_ID);
      expect(result.tareas).toHaveLength(1);
      expect(result.tareas[0].idTarea).toBe(100);
      expect(result.tareas[0].asignaciones).toHaveLength(1);
      expect(result.tareas[0].asignaciones[0].horasReales).toBe(5);
      expect(result.tareas[0].comentarios).toHaveLength(1);
      expect(result.tareas[0].comentarios[0].contenido).toBe('COMMENT-HISTORY');
      expect(result.hitos).toEqual([
        { idHito: 200, tituloHito: 'MILESTONE-A', estadoHito: 'COMPLETADO', porcentaje: 100 },
      ]);
    });

    it('caso 2: una tarea con varios tramos de asignación aparece UNA vez, con todos sus tramos conservados', async () => {
      const prisma = makePrisma();
      const tarea = {
        idTarea: 100,
        tituloTarea: 'TASK-REASIGNADA',
        descripcionTarea: null,
        estadoTarea: 'HECHO',
        prioridad: 'MEDIA',
        idHito: null,
        fechaCreacion: new Date('2026-01-02'),
        fechaLimite: null,
        tiempoEstimadoHoras: null,
        asignaciones: [
          {
            idAsignacion: 301,
            usuario: usuarioPublico({ idUsuario: 41 }),
            fechaAsignacion: new Date('2026-01-02'),
            desasignadaEn: new Date('2026-01-05'),
            horasReales: { toNumber: () => 2 },
          },
          {
            idAsignacion: 302,
            usuario: usuarioPublico({ idUsuario: 42 }),
            fechaAsignacion: new Date('2026-01-05'),
            desasignadaEn: null,
            horasReales: null,
          },
        ],
        comentarios: [],
      };
      prisma.sprint.findFirst.mockResolvedValue(sprintConTareas([tarea]));
      const context = makeSprintsContext();
      const authorization = makeSprintsAuthorization();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      const result = await service.getSprintDetail(PROJECT_ID, SPRINT_ID, LIDER_ID);

      expect(result.tareas).toHaveLength(1);
      expect(result.tareas[0].asignaciones).toHaveLength(2);
      expect(result.tareas[0].asignaciones.map((a) => a.idAsignacion)).toEqual([301, 302]);
      expect(result.tareas[0].asignaciones[1].horasReales).toBeNull();
    });

    it('caso 3: el mismo Hito usado por varias tareas no se duplica en la colección top-level', async () => {
      const prisma = makePrisma();
      const tarea1 = {
        idTarea: 100,
        tituloTarea: 'T1',
        descripcionTarea: null,
        estadoTarea: 'HECHO',
        prioridad: 'MEDIA',
        idHito: 200,
        fechaCreacion: new Date('2026-01-02'),
        fechaLimite: null,
        tiempoEstimadoHoras: null,
        asignaciones: [],
        comentarios: [],
      };
      const tarea2 = { ...tarea1, idTarea: 101, tituloTarea: 'T2' };
      prisma.sprint.findFirst.mockResolvedValue(sprintConTareas([tarea1, tarea2]));
      prisma.hito.findMany.mockResolvedValue([{ idHito: 200, tituloHito: 'MILESTONE-COMPARTIDO', estadoHito: 'EN_PROGRESO' }]);
      // A12: 4 tareas del Hito EN TODO EL PROYECTO (no solo las 2 de este
      // Sprint, que están ambas HECHO) — demuestra que el porcentaje usa el
      // scope project-wide de calcularAvanceHitos/getAvance, no las tareas
      // ya cargadas del Sprint: 2 de 4 HECHO = 50%, nunca 100%.
      prisma.tarea.findMany.mockResolvedValue([
        { idHito: 200, estadoTarea: 'HECHO' },
        { idHito: 200, estadoTarea: 'HECHO' },
        { idHito: 200, estadoTarea: 'EN_PROGRESO' },
        { idHito: 200, estadoTarea: 'POR_HACER' },
      ]);
      const context = makeSprintsContext();
      const authorization = makeSprintsAuthorization();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      const result = await service.getSprintDetail(PROJECT_ID, SPRINT_ID, LIDER_ID);

      expect(result.tareas).toHaveLength(2);
      expect(result.hitos).toHaveLength(1);
      expect(result.tareas[0].idHito).toBe(200);
      expect(result.tareas[1].idHito).toBe(200);
      // hito.findMany se llama UNA vez con ambos ids deduplicados (Set),
      // nunca una consulta por tarea.
      expect(prisma.hito.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.hito.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { idHito: { in: [200] }, idProyecto: PROJECT_ID } }),
      );
      // El porcentaje se calcula UNA sola vez para el Hito compartido, no
      // una vez por cada tarea que lo referencia.
      expect(prisma.tarea.findMany).toHaveBeenCalledTimes(1);
      expect(result.hitos[0]).toEqual({
        idHito: 200,
        tituloHito: 'MILESTONE-COMPARTIDO',
        estadoHito: 'EN_PROGRESO',
        porcentaje: 50,
      });
    });

    it('A12: porcentaje por Hito con números limpios — 4 tareas del Hito, 2 completadas -> 50%', async () => {
      const prisma = makePrisma();
      const tarea = {
        idTarea: 100,
        tituloTarea: 'T1',
        descripcionTarea: null,
        estadoTarea: 'HECHO',
        prioridad: 'MEDIA',
        idHito: 300,
        fechaCreacion: new Date('2026-01-02'),
        fechaLimite: null,
        tiempoEstimadoHoras: null,
        asignaciones: [],
        comentarios: [],
      };
      prisma.sprint.findFirst.mockResolvedValue(sprintConTareas([tarea]));
      prisma.hito.findMany.mockResolvedValue([{ idHito: 300, tituloHito: 'MILESTONE-50', estadoHito: 'EN_PROGRESO' }]);
      prisma.tarea.findMany.mockResolvedValue([
        { idHito: 300, estadoTarea: 'HECHO' },
        { idHito: 300, estadoTarea: 'HECHO' },
        { idHito: 300, estadoTarea: 'POR_HACER' },
        { idHito: 300, estadoTarea: 'POR_HACER' },
      ]);
      const context = makeSprintsContext();
      const authorization = makeSprintsAuthorization();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      const result = await service.getSprintDetail(PROJECT_ID, SPRINT_ID, LIDER_ID);

      expect(result.hitos).toEqual([
        { idHito: 300, tituloHito: 'MILESTONE-50', estadoHito: 'EN_PROGRESO', porcentaje: 50 },
      ]);
    });

    it('A12: Hito sin tareas en el proyecto — porcentaje 0, sin NaN ni error', async () => {
      const prisma = makePrisma();
      const tarea = {
        idTarea: 100,
        tituloTarea: 'T1',
        descripcionTarea: null,
        estadoTarea: 'POR_HACER',
        prioridad: 'MEDIA',
        idHito: 400,
        fechaCreacion: new Date('2026-01-02'),
        fechaLimite: null,
        tiempoEstimadoHoras: null,
        asignaciones: [],
        comentarios: [],
      };
      prisma.sprint.findFirst.mockResolvedValue(sprintConTareas([tarea]));
      prisma.hito.findMany.mockResolvedValue([{ idHito: 400, tituloHito: 'MILESTONE-VACIO', estadoHito: 'PENDIENTE' }]);
      // Caso límite: la consulta project-wide no encuentra tareas vigentes
      // para el Hito (p. ej. todas soft-deleted) — nunca debe producir NaN.
      prisma.tarea.findMany.mockResolvedValue([]);
      const context = makeSprintsContext();
      const authorization = makeSprintsAuthorization();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      const result = await service.getSprintDetail(PROJECT_ID, SPRINT_ID, LIDER_ID);

      expect(result.hitos).toEqual([
        { idHito: 400, tituloHito: 'MILESTONE-VACIO', estadoHito: 'PENDIENTE', porcentaje: 0 },
      ]);
      expect(Number.isNaN(result.hitos[0].porcentaje)).toBe(false);
    });

    it('caso 4: Sprint ajeno al proyecto — propaga NotFoundException sin ejecutar la reconstrucción', async () => {
      const prisma = makePrisma();
      const context = makeSprintsContext();
      const authorization = makeSprintsAuthorization();
      authorization.assertCanViewSprintHistory.mockRejectedValue(
        new NotFoundException(`Sprint con id ${SPRINT_ID} no encontrado en el proyecto ${PROJECT_ID}`),
      );
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      await expect(
        service.getSprintDetail(PROJECT_ID, SPRINT_ID, LIDER_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.sprint.findFirst).not.toHaveBeenCalled();
    });

    it('caso 5: Sprint inexistente (autorización pasó pero la relectura no encuentra fila) — NotFoundException', async () => {
      const prisma = makePrisma();
      prisma.sprint.findFirst.mockResolvedValue(null);
      const context = makeSprintsContext();
      const authorization = makeSprintsAuthorization();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      await expect(
        service.getSprintDetail(PROJECT_ID, SPRINT_ID, LIDER_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('caso 6: la consulta de tareas está acotada por idProyecto + eliminadoEn:null — evidencia contra contaminación cross-project', async () => {
      const prisma = makePrisma();
      prisma.sprint.findFirst.mockResolvedValue(sprintConTareas([]));
      const context = makeSprintsContext();
      const authorization = makeSprintsAuthorization();
      const service = new SprintsService(prisma, context, authorization, makeNotifications());

      await service.getSprintDetail(PROJECT_ID, SPRINT_ID, LIDER_ID);

      const callArgs = prisma.sprint.findFirst.mock.calls[0][0];
      expect(callArgs.where).toEqual({ idSprint: SPRINT_ID, idProyecto: PROJECT_ID });
      expect(callArgs.include.tareas.where).toEqual({ idProyecto: PROJECT_ID, eliminadoEn: null });
      expect(callArgs.include.tareas.include.comentarios.where).toEqual({ eliminadoEn: null });
    });
  });
});
