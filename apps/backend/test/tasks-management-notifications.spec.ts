import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import type { NotificationsService } from '../src/notifications/notifications.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { CreateTaskDto } from '../src/tasks/dto/create-task.dto';
import type { TasksAuthorizationService } from '../src/tasks/tasks-authorization.service';
import type { TasksContextService } from '../src/tasks/tasks-context.service';
import type { TasksRelationsService } from '../src/tasks/tasks-relations.service';
import { TasksService } from '../src/tasks/tasks.service';

/**
 * Tarea 34: integra las mutaciones de gestión de tareas (crear, editar,
 * cambiar estado, asignar/reasignar, eliminar) con NotificationsService,
 * reutilizando `notifyRoleMembers` (Tarea 33). Regla de audiencia:
 *
 *   idRolProyecto !== null           -> miembros activos de ese rol
 *   idRolProyecto === null + asignado -> únicamente el asignado activo
 *   sin rol y sin asignado            -> nadie
 *
 * El actor siempre se excluye, los destinatarios se deduplican, y toda
 * emisión ocurre después de que la transacción de negocio se resuelve
 * (nunca dentro del callback). Desasignación y comentarios de tarea
 * conservan sus reglas específicas (Tareas 25 y 29) y no se tocan aquí.
 */

function makeTx() {
  return {
    // A12.1: findMany se usa exclusivamente por syncHitoEstado cuando la
    // tarea creada/eliminada tiene idHito != null. Por defecto [] para no
    // romper los tests preexistentes (idHito: null en las fixtures de
    // este archivo).
    tarea: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    asignacionTarea: { create: vi.fn(), updateMany: vi.fn() },
    tareaEtiqueta: { createMany: vi.fn(), deleteMany: vi.fn() },
    // Por defecto el proyecto tiene un Sprint ACTIVO (FND-03.B): irrelevante
    // para estos tests de notificaciones, que no ejercitan ese rechazo.
    sprint: { findFirst: vi.fn().mockResolvedValue({ idSprint: 1 }) },
    // A12.1: presente únicamente si algún test futuro crea/elimina una
    // tarea con idHito != null; ausente (undefined) en el resto.
    hito: undefined as { update: ReturnType<typeof vi.fn> } | undefined,
  };
}

function makePrisma(tx = makeTx()) {
  return {
    tx,
    usuario: { findUnique: vi.fn().mockResolvedValue({ nombre: 'Actor', apellido: 'Prueba' }) },
    proyecto: { findUnique: vi.fn().mockResolvedValue({ tituloProyecto: 'Proyecto X' }) },
    $transaction: vi.fn(async (callback: (transaction: ReturnType<typeof makeTx>) => unknown) => callback(tx)),
  };
}

function makeNotifications() {
  return {
    notifyFromTemplate: vi.fn().mockResolvedValue(undefined),
    notifyUsers: vi.fn().mockResolvedValue(undefined),
    notifyRoleMembers: vi.fn().mockResolvedValue(undefined),
  };
}

function makeService(
  prisma: unknown,
  authorization: unknown,
  relations: unknown,
  notifications: unknown,
  context: unknown,
) {
  return new TasksService(
    prisma as PrismaService,
    authorization as TasksAuthorizationService,
    relations as TasksRelationsService,
    notifications as NotificationsService,
    context as TasksContextService,
  );
}

function tareaRow(overrides: Record<string, unknown> = {}) {
  return {
    idTarea: 42,
    idProyecto: 5,
    idHito: null,
    idRolProyecto: null,
    tituloTarea: 'Tarea de prueba',
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

function asignacionActiva(idUsuario: number) {
  return [
    {
      idAsignacion: 1,
      idUsuario,
      fechaAsignacion: new Date('2026-01-02T00:00:00.000Z'),
      usuario: { idUsuario, nombre: 'Asignado', apellido: 'Prueba', fotoUrl: null },
    },
  ];
}

const ACTOR_ID = 1;
const PROJECT_ID = 5;
const ROLE_ID = 6;

describe('TasksService — notificaciones de creación (Tarea 34)', () => {
  function makeCreateSetup(opts: { rowOverrides?: Record<string, unknown>; dto?: Record<string, unknown> } = {}) {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    const auth = { assertCanCreateTask: vi.fn().mockResolvedValue(undefined) };
    const relations = {
      validateCreateTaskRelations: vi.fn().mockResolvedValue({ hito: undefined, rolProyecto: undefined, etiquetas: undefined }),
    };
    const notifications = makeNotifications();
    tx.tarea.create.mockResolvedValue({ idTarea: 42 });
    tx.tarea.findFirst.mockResolvedValue(tareaRow(opts.rowOverrides));
    const service = makeService(prisma, auth, relations, notifications, {});
    const dto = { tituloTarea: 'Tarea de prueba', fechaLimite: '2026-12-25', prioridad: 'MEDIA', ...opts.dto };
    return { tx, prisma, notifications, service, dto };
  }

  it('con rol y asignado: notifica solo a notifyRoleMembers, nunca al asignado individualmente', async () => {
    const { notifications, service, dto } = makeCreateSetup({
      rowOverrides: { idRolProyecto: ROLE_ID, asignaciones: asignacionActiva(3) },
      dto: { idRolProyecto: ROLE_ID, idUsuarioAsignado: 3 },
    });

    await service.create(PROJECT_ID, ACTOR_ID, dto as unknown as CreateTaskDto);

    expect(notifications.notifyRoleMembers).toHaveBeenCalledTimes(1);
    expect(notifications.notifyRoleMembers).toHaveBeenCalledWith(
      PROJECT_ID,
      ROLE_ID,
      ACTOR_ID,
      expect.objectContaining({ tipoNotificacion: 'TAREA_ACTUALIZADA' }),
    );
    expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
  });

  it('con rol sin asignado: notifyRoleMembers de todas formas', async () => {
    const { notifications, service, dto } = makeCreateSetup({
      rowOverrides: { idRolProyecto: ROLE_ID },
      dto: { idRolProyecto: ROLE_ID },
    });

    await service.create(PROJECT_ID, ACTOR_ID, dto as unknown as CreateTaskDto);

    expect(notifications.notifyRoleMembers).toHaveBeenCalledTimes(1);
  });

  it('sin rol con asignado: notifyFromTemplate([asignado], TAREA_ASIGNADA, ...)', async () => {
    const { notifications, service, dto } = makeCreateSetup({
      rowOverrides: { asignaciones: asignacionActiva(3) },
      dto: { idUsuarioAsignado: 3 },
    });

    await service.create(PROJECT_ID, ACTOR_ID, dto as unknown as CreateTaskDto);

    expect(notifications.notifyFromTemplate).toHaveBeenCalledTimes(1);
    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([3], 'TAREA_ASIGNADA', expect.any(Object));
    expect(notifications.notifyRoleMembers).not.toHaveBeenCalled();
  });

  it('sin rol sin asignado: ninguna notificación', async () => {
    const { notifications, service, dto } = makeCreateSetup();

    await service.create(PROJECT_ID, ACTOR_ID, dto as unknown as CreateTaskDto);

    expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    expect(notifications.notifyRoleMembers).not.toHaveBeenCalled();
    expect(notifications.notifyUsers).not.toHaveBeenCalled();
  });

  it('actor igual al asignado (sin rol): ninguna notificación (excluido dentro de _notifyAssignment)', async () => {
    const { notifications, service, dto } = makeCreateSetup({
      rowOverrides: { asignaciones: asignacionActiva(ACTOR_ID) },
      dto: { idUsuarioAsignado: ACTOR_ID },
    });

    await service.create(PROJECT_ID, ACTOR_ID, dto as unknown as CreateTaskDto);

    expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
  });

  it('fallo transaccional: ninguna notificación', async () => {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    const auth = { assertCanCreateTask: vi.fn().mockRejectedValue(new ForbiddenException('no autorizado')) };
    const relations = { validateCreateTaskRelations: vi.fn() };
    const notifications = makeNotifications();
    const service = makeService(prisma, auth, relations, notifications, {});

    await expect(
      service.create(PROJECT_ID, ACTOR_ID, {
        tituloTarea: 'x',
        fechaLimite: '2026-12-25',
        prioridad: 'MEDIA',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    expect(notifications.notifyRoleMembers).not.toHaveBeenCalled();
  });

  it('fallo de notificación (con rol) no revierte la creación: create() resuelve con éxito', async () => {
    const { notifications, service, dto } = makeCreateSetup({
      rowOverrides: { idRolProyecto: ROLE_ID },
      dto: { idRolProyecto: ROLE_ID },
    });
    notifications.notifyRoleMembers.mockRejectedValue(new Error('fallo de notificación'));

    const resultado = await service.create(PROJECT_ID, ACTOR_ID, dto as unknown as CreateTaskDto);

    expect(resultado.idTarea).toBe(42);
  });
});

describe('TasksService — notificaciones de edición (Tarea 34)', () => {
  function makeUpdateSetup(rowOverrides: Record<string, unknown> = {}) {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    const auth = { assertCanEditTask: vi.fn().mockResolvedValue(undefined) };
    const relations = {
      validateRelatedResources: vi.fn().mockResolvedValue({ hito: undefined, rolProyecto: undefined, etiquetas: undefined }),
    };
    const context = { getActiveAssignment: vi.fn().mockResolvedValue(null) };
    const notifications = makeNotifications();
    tx.tarea.findFirst.mockResolvedValue(tareaRow(rowOverrides));
    const service = makeService(prisma, auth, relations, notifications, context);
    return { tx, prisma, notifications, service };
  }

  it('conserva rol: notifica a notifyRoleMembers con el rol final', async () => {
    const { notifications, service } = makeUpdateSetup({ idRolProyecto: ROLE_ID });

    await service.update(PROJECT_ID, 42, ACTOR_ID, { tituloTarea: 'Nuevo título' });

    expect(notifications.notifyRoleMembers).toHaveBeenCalledWith(
      PROJECT_ID,
      ROLE_ID,
      ACTOR_ID,
      expect.objectContaining({ tipoNotificacion: 'TAREA_ACTUALIZADA' }),
    );
  });

  it('cambia de rol A a B: notifica solo miembros de B, nunca de A', async () => {
    const ROLE_B = 9;
    const { notifications, service } = makeUpdateSetup({ idRolProyecto: ROLE_B });

    await service.update(PROJECT_ID, 42, ACTOR_ID, { idRolProyecto: ROLE_B });

    expect(notifications.notifyRoleMembers).toHaveBeenCalledTimes(1);
    expect(notifications.notifyRoleMembers).toHaveBeenCalledWith(PROJECT_ID, ROLE_B, ACTOR_ID, expect.anything());
  });

  it('elimina el rol pero conserva asignado activo: notifica solo al asignado', async () => {
    const { notifications, service } = makeUpdateSetup({ idRolProyecto: null, asignaciones: asignacionActiva(3) });

    await service.update(PROJECT_ID, 42, ACTOR_ID, { idRolProyecto: null });

    expect(notifications.notifyRoleMembers).not.toHaveBeenCalled();
    expect(notifications.notifyUsers).toHaveBeenCalledWith([3], expect.objectContaining({ tipoNotificacion: 'TAREA_ACTUALIZADA' }));
  });

  it('elimina el rol sin asignado: ninguna notificación', async () => {
    const { notifications, service } = makeUpdateSetup({ idRolProyecto: null });

    await service.update(PROJECT_ID, 42, ACTOR_ID, { idRolProyecto: null });

    expect(notifications.notifyRoleMembers).not.toHaveBeenCalled();
    expect(notifications.notifyUsers).not.toHaveBeenCalled();
  });

  it('error de update: ninguna notificación', async () => {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    const auth = { assertCanEditTask: vi.fn().mockResolvedValue(undefined) };
    const relations = {
      validateRelatedResources: vi.fn().mockResolvedValue({ hito: undefined, rolProyecto: undefined, etiquetas: undefined }),
    };
    const notifications = makeNotifications();
    tx.tarea.update.mockRejectedValue(new Error('fallo de escritura'));
    const service = makeService(prisma, auth, relations, notifications, { getActiveAssignment: vi.fn() });

    await expect(
      service.update(PROJECT_ID, 42, ACTOR_ID, { tituloTarea: 'x' }),
    ).rejects.toThrow('fallo de escritura');

    expect(notifications.notifyRoleMembers).not.toHaveBeenCalled();
    expect(notifications.notifyUsers).not.toHaveBeenCalled();
  });

  it('fallo de notificación no revierte la edición: update() resuelve con la tarea editada', async () => {
    const { notifications, service } = makeUpdateSetup({ idRolProyecto: ROLE_ID });
    notifications.notifyRoleMembers.mockRejectedValue(new Error('fallo'));

    const resultado = await service.update(PROJECT_ID, 42, ACTOR_ID, { tituloTarea: 'x' });

    expect(resultado.idTarea).toBe(42);
  });
});

describe('TasksService — notificaciones de cambio de estado (Tarea 34)', () => {
  function makeEstadoSetup(rowOverrides: Record<string, unknown> = {}) {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    const auth = { assertCanChangeTaskState: vi.fn().mockResolvedValue(undefined) };
    const notifications = makeNotifications();
    tx.tarea.findFirst.mockResolvedValue(tareaRow(rowOverrides));
    const service = makeService(prisma, auth, {}, notifications, {});
    return { tx, notifications, service };
  }

  it('tarea con rol: notifica a notifyRoleMembers', async () => {
    const { notifications, service } = makeEstadoSetup({ idRolProyecto: ROLE_ID, estadoTarea: 'HECHO' });

    await service.updateEstado(PROJECT_ID, 42, ACTOR_ID, { estadoTarea: 'HECHO' });

    expect(notifications.notifyRoleMembers).toHaveBeenCalledWith(
      PROJECT_ID,
      ROLE_ID,
      ACTOR_ID,
      expect.objectContaining({ tipoNotificacion: 'TAREA_ACTUALIZADA', datosJson: expect.objectContaining({ estado: 'HECHO' }) }),
    );
  });

  it('tarea sin rol, asignada: notifica al asignado', async () => {
    const { notifications, service } = makeEstadoSetup({ asignaciones: asignacionActiva(3) });

    await service.updateEstado(PROJECT_ID, 42, ACTOR_ID, { estadoTarea: 'HECHO' });

    expect(notifications.notifyUsers).toHaveBeenCalledWith([3], expect.anything());
  });

  it('el propio asignado cambia su estado: se excluye a sí mismo, cero notificaciones', async () => {
    const { notifications, service } = makeEstadoSetup({ asignaciones: asignacionActiva(ACTOR_ID) });

    await service.updateEstado(PROJECT_ID, 42, ACTOR_ID, { estadoTarea: 'HECHO' });

    expect(notifications.notifyUsers).not.toHaveBeenCalled();
  });

  it('error al cambiar estado: ninguna notificación', async () => {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    const auth = { assertCanChangeTaskState: vi.fn().mockResolvedValue(undefined) };
    const notifications = makeNotifications();
    tx.tarea.update.mockRejectedValue(new Error('fallo'));
    const service = makeService(prisma, auth, {}, notifications, {});

    await expect(
      service.updateEstado(PROJECT_ID, 42, ACTOR_ID, { estadoTarea: 'HECHO' }),
    ).rejects.toThrow('fallo');

    expect(notifications.notifyRoleMembers).not.toHaveBeenCalled();
    expect(notifications.notifyUsers).not.toHaveBeenCalled();
  });

  it('mismo estado: el método sigue escribiendo siempre (sin atajo de idempotencia), así que también notifica — comportamiento documentado, no una regla nueva', async () => {
    const { tx, notifications, service } = makeEstadoSetup({ estadoTarea: 'POR_HACER', asignaciones: asignacionActiva(3) });

    await service.updateEstado(PROJECT_ID, 42, ACTOR_ID, { estadoTarea: 'POR_HACER' });

    expect(tx.tarea.update).toHaveBeenCalledTimes(1);
    expect(notifications.notifyUsers).toHaveBeenCalledTimes(1);
  });
});

describe('TasksService — notificaciones de asignación y reasignación (Tarea 34)', () => {
  function makeAssignSetup(opts: {
    tareaAutorizada?: Record<string, unknown>;
    asignacionActivaPrevia?: { idAsignacion: number; idUsuario: number } | null;
    filaFinal?: Record<string, unknown>;
  } = {}) {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    const auth = {
      assertCanAssignTask: vi.fn().mockResolvedValue({ idTarea: 42, idProyecto: PROJECT_ID, idRolProyecto: null, ...opts.tareaAutorizada }),
    };
    const relations = { assertUserAssignableToProject: vi.fn().mockResolvedValue(undefined) };
    const context = { getActiveAssignment: vi.fn().mockResolvedValue(opts.asignacionActivaPrevia ?? null) };
    const notifications = makeNotifications();
    tx.tarea.findFirst.mockResolvedValue(tareaRow(opts.filaFinal));
    const service = makeService(prisma, auth, relations, notifications, context);
    return { tx, prisma, notifications, service };
  }

  it('tarea con rol: notifica a notifyRoleMembers (asignación inicial)', async () => {
    const { notifications, service } = makeAssignSetup({
      tareaAutorizada: { idRolProyecto: ROLE_ID },
      filaFinal: { idRolProyecto: ROLE_ID },
    });

    await service.assign(PROJECT_ID, 42, ACTOR_ID, { idUsuario: 3 });

    expect(notifications.notifyRoleMembers).toHaveBeenCalledWith(
      PROJECT_ID,
      ROLE_ID,
      ACTOR_ID,
      expect.objectContaining({ tipoNotificacion: 'TAREA_ASIGNADA' }),
    );
    expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
  });

  it('tarea sin rol: notifica únicamente al nuevo asignado', async () => {
    const { notifications, service } = makeAssignSetup({ filaFinal: { asignaciones: asignacionActiva(3) } });

    await service.assign(PROJECT_ID, 42, ACTOR_ID, { idUsuario: 3 });

    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([3], 'TAREA_ASIGNADA', expect.any(Object));
    expect(notifications.notifyRoleMembers).not.toHaveBeenCalled();
  });

  it('idempotencia (mismo usuario ya asignado): cero notificaciones', async () => {
    const { tx, notifications, service } = makeAssignSetup({
      asignacionActivaPrevia: { idAsignacion: 1, idUsuario: 3 },
    });

    await service.assign(PROJECT_ID, 42, ACTOR_ID, { idUsuario: 3 });

    expect(tx.asignacionTarea.create).not.toHaveBeenCalled();
    expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    expect(notifications.notifyRoleMembers).not.toHaveBeenCalled();
  });

  it('actor igual al nuevo asignado (sin rol): cero notificaciones', async () => {
    const { notifications, service } = makeAssignSetup({ filaFinal: { asignaciones: asignacionActiva(ACTOR_ID) } });

    await service.assign(PROJECT_ID, 42, ACTOR_ID, { idUsuario: ACTOR_ID });

    expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
  });

  it('reasignación sin rol: notifica solo al nuevo asignado, nunca al anterior', async () => {
    const { notifications, service } = makeAssignSetup({
      asignacionActivaPrevia: { idAsignacion: 1, idUsuario: 99 },
      filaFinal: { asignaciones: asignacionActiva(3) },
    });

    await service.assign(PROJECT_ID, 42, ACTOR_ID, { idUsuario: 3 });

    expect(notifications.notifyFromTemplate).toHaveBeenCalledTimes(1);
    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([3], 'TAREA_ASIGNADA', expect.any(Object));
    const destinatarios = notifications.notifyFromTemplate.mock.calls[0][0];
    expect(destinatarios).not.toContain(99);
  });

  it('reasignación con rol: notifica solo miembros del rol, no al anterior ni al nuevo individualmente', async () => {
    const { notifications, service } = makeAssignSetup({
      tareaAutorizada: { idRolProyecto: ROLE_ID },
      asignacionActivaPrevia: { idAsignacion: 1, idUsuario: 99 },
      filaFinal: { idRolProyecto: ROLE_ID },
    });

    await service.assign(PROJECT_ID, 42, ACTOR_ID, { idUsuario: 3 });

    expect(notifications.notifyRoleMembers).toHaveBeenCalledTimes(1);
    expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
  });

  it('fallo transaccional (candidato no asignable): ninguna notificación', async () => {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    const auth = { assertCanAssignTask: vi.fn().mockResolvedValue({ idTarea: 42, idProyecto: PROJECT_ID, idRolProyecto: null }) };
    const relations = { assertUserAssignableToProject: vi.fn().mockRejectedValue(new Error('no asignable')) };
    const notifications = makeNotifications();
    const context = { getActiveAssignment: vi.fn() };
    const service = makeService(prisma, auth, relations, notifications, context);

    await expect(service.assign(PROJECT_ID, 42, ACTOR_ID, { idUsuario: 3 })).rejects.toThrow(
      'no asignable',
    );

    expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    expect(notifications.notifyRoleMembers).not.toHaveBeenCalled();
  });

  it('colisión 409 (operación perdedora): ninguna notificación', async () => {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    const auth = { assertCanAssignTask: vi.fn().mockResolvedValue({ idTarea: 42, idProyecto: PROJECT_ID, idRolProyecto: null }) };
    const relations = { assertUserAssignableToProject: vi.fn().mockResolvedValue(undefined) };
    const notifications = makeNotifications();
    const context = { getActiveAssignment: vi.fn().mockResolvedValue(null) };
    const { Prisma } = await import('@prisma/client');
    tx.asignacionTarea.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.2',
        meta: { modelName: 'AsignacionTarea', target: ['id_tarea'] },
      }),
    );
    const service = makeService(prisma, auth, relations, notifications, context);

    await expect(service.assign(PROJECT_ID, 42, ACTOR_ID, { idUsuario: 3 })).rejects.toThrow();

    expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    expect(notifications.notifyRoleMembers).not.toHaveBeenCalled();
  });
});

describe('TasksService — desasignación conserva su regla específica (Tarea 34, sin cambios de la Tarea 25)', () => {
  function makeUnassignSetup(opts: {
    tareaAutorizada?: Record<string, unknown>;
    asignacionActiva?: { idAsignacion: number; idUsuario: number } | null;
    closedCount?: number;
  } = {}) {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    const auth = {
      assertCanUnassignTask: vi.fn().mockResolvedValue({
        idTarea: 42,
        idProyecto: PROJECT_ID,
        tituloTarea: 'Tarea de prueba',
        idRolProyecto: null,
        ...opts.tareaAutorizada,
      }),
    };
    const context = { getActiveAssignment: vi.fn().mockResolvedValue(opts.asignacionActiva ?? null) };
    const notifications = makeNotifications();
    tx.asignacionTarea.updateMany.mockResolvedValue({ count: opts.closedCount ?? 1 });
    const service = makeService(prisma, auth, {}, notifications, context);
    return { tx, notifications, service };
  }

  it('tarea con rol: la desasignación sigue notificando solo al usuario anterior, nunca a notifyRoleMembers', async () => {
    const { notifications, service } = makeUnassignSetup({
      tareaAutorizada: { idRolProyecto: ROLE_ID },
      asignacionActiva: { idAsignacion: 1, idUsuario: 3 },
    });

    await service.unassign(PROJECT_ID, 42, ACTOR_ID);

    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([3], 'TAREA_ACTUALIZADA', expect.any(Object));
    expect(notifications.notifyRoleMembers).not.toHaveBeenCalled();
  });

  it('desasignación efectiva sin rol: notifica solo al usuario anterior', async () => {
    const { notifications, service } = makeUnassignSetup({ asignacionActiva: { idAsignacion: 1, idUsuario: 3 } });

    await service.unassign(PROJECT_ID, 42, ACTOR_ID);

    expect(notifications.notifyFromTemplate).toHaveBeenCalledTimes(1);
    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([3], 'TAREA_ACTUALIZADA', expect.any(Object));
  });

  it('sin asignación activa: cero notificaciones (no-op idempotente)', async () => {
    const { notifications, service } = makeUnassignSetup({ asignacionActiva: null });

    await service.unassign(PROJECT_ID, 42, ACTOR_ID);

    expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
  });

  it('carrera con count: 0: cero notificaciones', async () => {
    const { notifications, service } = makeUnassignSetup({
      asignacionActiva: { idAsignacion: 1, idUsuario: 3 },
      closedCount: 0,
    });

    await service.unassign(PROJECT_ID, 42, ACTOR_ID);

    expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
  });

  it('actor igual al usuario anterior: cero notificaciones', async () => {
    const { notifications, service } = makeUnassignSetup({ asignacionActiva: { idAsignacion: 1, idUsuario: ACTOR_ID } });

    await service.unassign(PROJECT_ID, 42, ACTOR_ID);

    expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
  });

  it('fallo de notificación no revierte la desasignación ya comprometida', async () => {
    const { tx, notifications, service } = makeUnassignSetup({ asignacionActiva: { idAsignacion: 1, idUsuario: 3 } });
    notifications.notifyFromTemplate.mockRejectedValue(new Error('gateway caído'));

    await expect(service.unassign(PROJECT_ID, 42, ACTOR_ID)).resolves.toBeUndefined();
    expect(tx.asignacionTarea.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe('TasksService — notificaciones de soft delete (Tarea 34)', () => {
  function makeDeleteSetup(opts: {
    tareaAutorizada?: Record<string, unknown>;
    asignacionActiva?: { idUsuario: number } | null;
  } = {}) {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    const auth = {
      assertCanDeleteTask: vi.fn().mockResolvedValue({
        idTarea: 42,
        idProyecto: PROJECT_ID,
        tituloTarea: 'Tarea de prueba',
        idRolProyecto: null,
        idHito: null,
        ...opts.tareaAutorizada,
      }),
    };
    const context = { getActiveAssignment: vi.fn().mockResolvedValue(opts.asignacionActiva ?? null) };
    const notifications = makeNotifications();
    const service = makeService(prisma, auth, {}, notifications, context);
    return { tx, notifications, service };
  }

  it('tarea con rol: notifica a notifyRoleMembers', async () => {
    const { notifications, service } = makeDeleteSetup({ tareaAutorizada: { idRolProyecto: ROLE_ID } });

    await service.remove(PROJECT_ID, 42, ACTOR_ID);

    expect(notifications.notifyRoleMembers).toHaveBeenCalledWith(
      PROJECT_ID,
      ROLE_ID,
      ACTOR_ID,
      expect.objectContaining({ tipoNotificacion: 'TAREA_ACTUALIZADA' }),
    );
  });

  it('tarea sin rol con asignado previo: notifica solo al asignado previo (snapshot anterior al cierre)', async () => {
    const { notifications, service } = makeDeleteSetup({ asignacionActiva: { idUsuario: 3 } });

    await service.remove(PROJECT_ID, 42, ACTOR_ID);

    expect(notifications.notifyUsers).toHaveBeenCalledWith([3], expect.objectContaining({ tipoNotificacion: 'TAREA_ACTUALIZADA' }));
  });

  it('tarea sin rol ni asignado: ninguna notificación', async () => {
    const { notifications, service } = makeDeleteSetup();

    await service.remove(PROJECT_ID, 42, ACTOR_ID);

    expect(notifications.notifyRoleMembers).not.toHaveBeenCalled();
    expect(notifications.notifyUsers).not.toHaveBeenCalled();
  });

  it('actor igual al asignado previo: cero notificaciones', async () => {
    const { notifications, service } = makeDeleteSetup({ asignacionActiva: { idUsuario: ACTOR_ID } });

    await service.remove(PROJECT_ID, 42, ACTOR_ID);

    expect(notifications.notifyUsers).not.toHaveBeenCalled();
  });

  it('fallo transaccional: ninguna notificación', async () => {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    const auth = { assertCanDeleteTask: vi.fn().mockRejectedValue(new ForbiddenException('no autorizado')) };
    const notifications = makeNotifications();
    const context = { getActiveAssignment: vi.fn() };
    const service = makeService(prisma, auth, {}, notifications, context);

    await expect(service.remove(PROJECT_ID, 42, ACTOR_ID)).rejects.toBeInstanceOf(ForbiddenException);

    expect(notifications.notifyRoleMembers).not.toHaveBeenCalled();
    expect(notifications.notifyUsers).not.toHaveBeenCalled();
  });

  it('fallo de notificación no revierte la eliminación ya comprometida', async () => {
    const { tx, notifications, service } = makeDeleteSetup({ tareaAutorizada: { idRolProyecto: ROLE_ID } });
    notifications.notifyRoleMembers.mockRejectedValue(new Error('fallo'));

    await expect(service.remove(PROJECT_ID, 42, ACTOR_ID)).resolves.toBeUndefined();
    expect(tx.tarea.update).toHaveBeenCalledTimes(1);
  });
});

describe('TasksService — orden verificable: nunca se notifica mientras la transacción sigue activa (Tarea 34)', () => {
  it('create() con rol: notifyRoleMembers se llama después de que $transaction resuelve', async () => {
    const orden: string[] = [];
    const tx = makeTx();
    const prisma = makePrisma(tx);
    let dentroDeTransaccion = true;
    prisma.$transaction = vi.fn(
      async (callback: (transaction: ReturnType<typeof makeTx>) => unknown) => {
      const resultado = await callback(tx);
      dentroDeTransaccion = false;
      orden.push('transaccion_resuelta');
      return resultado;
      },
    );
    const auth = { assertCanCreateTask: vi.fn().mockResolvedValue(undefined) };
    const relations = {
      validateCreateTaskRelations: vi.fn().mockResolvedValue({ hito: undefined, rolProyecto: undefined, etiquetas: undefined }),
    };
    const notifications = makeNotifications();
    notifications.notifyRoleMembers.mockImplementation(async () => {
      if (dentroDeTransaccion) {
        throw new Error('notifyRoleMembers se llamó DENTRO de la transacción');
      }
      orden.push('notificacion');
    });
    tx.tarea.create.mockResolvedValue({ idTarea: 42 });
    tx.tarea.findFirst.mockResolvedValue(tareaRow({ idRolProyecto: ROLE_ID }));
    const service = makeService(prisma, auth, relations, notifications, {});

    await service.create(PROJECT_ID, ACTOR_ID, {
      tituloTarea: 'x',
      fechaLimite: '2026-12-25',
      prioridad: 'MEDIA',
      idRolProyecto: ROLE_ID,
    });

    expect(orden).toEqual(['transaccion_resuelta', 'notificacion']);
  });

  it('assign() sin rol: notifyUsers (vía _notifyAssignment) se llama después de que $transaction resuelve', async () => {
    const orden: string[] = [];
    const tx = makeTx();
    const prisma = makePrisma(tx);
    let dentroDeTransaccion = true;
    prisma.$transaction = vi.fn(
      async (callback: (transaction: ReturnType<typeof makeTx>) => unknown) => {
      const resultado = await callback(tx);
      dentroDeTransaccion = false;
      orden.push('transaccion_resuelta');
      return resultado;
      },
    );
    const auth = {
      assertCanAssignTask: vi.fn().mockResolvedValue({ idTarea: 42, idProyecto: PROJECT_ID, idRolProyecto: null }),
    };
    const relations = { assertUserAssignableToProject: vi.fn().mockResolvedValue(undefined) };
    const context = { getActiveAssignment: vi.fn().mockResolvedValue(null) };
    const notifications = makeNotifications();
    notifications.notifyFromTemplate.mockImplementation(async () => {
      if (dentroDeTransaccion) {
        throw new Error('notifyFromTemplate se llamó DENTRO de la transacción');
      }
      orden.push('notificacion');
    });
    tx.tarea.findFirst.mockResolvedValue(tareaRow({ asignaciones: asignacionActiva(3) }));
    const service = makeService(prisma, auth, relations, notifications, context);

    await service.assign(PROJECT_ID, 42, ACTOR_ID, { idUsuario: 3 });

    expect(orden).toEqual(['transaccion_resuelta', 'notificacion']);
  });
});
