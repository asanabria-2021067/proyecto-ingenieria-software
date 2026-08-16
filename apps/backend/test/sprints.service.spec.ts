import { describe, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
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
});
