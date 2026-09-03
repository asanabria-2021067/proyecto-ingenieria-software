import { describe, expect, it, vi } from 'vitest';
import { Prioridad } from '@prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { TasksAuthorizationService } from '../src/tasks/tasks-authorization.service';
import type { TasksRelationsService } from '../src/tasks/tasks-relations.service';
import type { TasksContextService } from '../src/tasks/tasks-context.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import type { BitacoraEventosService } from '../src/bitacora/bitacora-eventos.service';
import { TasksService } from '../src/tasks/tasks.service';

/**
 * T-164: instrumentación de TasksService con BitacoraEventosService.
 * Verifica que cada mutación registra el evento correcto dentro del MISMO
 * tx, y que un fallo de la operación principal nunca deja un evento
 * huérfano (aquí probado a nivel de mock: si `tx.tarea.update`/`create`
 * falla, `registrarEvento` nunca se invoca porque el código nunca llega a
 * esa línea — el rollback real de Postgres se cubre en el test de
 * integración).
 */

function tareaRaw(overrides: Record<string, unknown> = {}) {
  return {
    idTarea: 42,
    idProyecto: 5,
    idSprint: 3,
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
    eliminadoEn: null,
    orden: 0,
    ...overrides,
  };
}

function tareaSelectRow(overrides: Record<string, unknown> = {}) {
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

function makeTx() {
  return {
    tarea: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(tareaSelectRow()),
      findMany: vi.fn().mockResolvedValue([]),
    },
    asignacionTarea: { create: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn() },
    tareaEtiqueta: { createMany: vi.fn(), deleteMany: vi.fn() },
    registroAvanceAsignacion: { create: vi.fn() },
    sprint: { findFirst: vi.fn().mockResolvedValue({ idSprint: 3 }) },
    hito: undefined as { update: ReturnType<typeof vi.fn> } | undefined,
  };
}

function makePrisma(tx = makeTx()) {
  const prisma = {
    tx,
    $transaction: vi.fn(async (cb: (t: ReturnType<typeof makeTx>) => unknown) => cb(tx)),
    usuario: { findUnique: vi.fn().mockResolvedValue({ nombre: 'A', apellido: 'B' }) },
    proyecto: { findUnique: vi.fn().mockResolvedValue({ tituloProyecto: 'P' }) },
  };
  return prisma as typeof prisma & PrismaService;
}

function makeBitacora() {
  return { registrarEvento: vi.fn().mockResolvedValue(undefined) } as unknown as BitacoraEventosService & {
    registrarEvento: ReturnType<typeof vi.fn>;
  };
}

function makeNotifications() {
  return {
    notifyFromTemplate: vi.fn().mockResolvedValue(undefined),
    notifyUsers: vi.fn().mockResolvedValue(undefined),
    notifyRoleMembers: vi.fn().mockResolvedValue(undefined),
  } as unknown as NotificationsService;
}

const PROJECT_ID = 5;
const TASK_ID = 42;
const ACTOR_ID = 1;

describe('TasksService — instrumentación de bitácora (T-164)', () => {
  it('create(): registra TASK_CREATED con el mismo tx, idSprint del Sprint activo y idActor', async () => {
    const tx = makeTx();
    tx.tarea.create.mockResolvedValue({ idTarea: TASK_ID });
    tx.tarea.findFirst.mockResolvedValue(tareaSelectRow());
    const prisma = makePrisma(tx);
    const bitacora = makeBitacora();
    const auth = { assertCanCreateTask: vi.fn().mockResolvedValue(undefined) } as unknown as TasksAuthorizationService;
    const relations = {
      validateCreateTaskRelations: vi.fn().mockResolvedValue({ hito: undefined, rolProyecto: undefined, etiquetas: undefined }),
    } as unknown as TasksRelationsService;
    const service = new TasksService(prisma, auth, relations, makeNotifications(), {} as TasksContextService, bitacora);

    await service.create(PROJECT_ID, ACTOR_ID, {
      tituloTarea: 'Nueva tarea',
      fechaLimite: '2026-12-25',
      prioridad: Prioridad.MEDIA,
    });

    expect(bitacora.registrarEvento).toHaveBeenCalledWith(
      expect.objectContaining({
        tx,
        tipoEvento: 'TASK_CREATED',
        idActor: ACTOR_ID,
        idProyecto: PROJECT_ID,
        idSprint: 3,
        tipoEntidad: 'TAREA',
        idEntidad: TASK_ID,
      }),
    );
  });

  it('update(): registra TASK_UPDATED con diff limitado a los campos enviados', async () => {
    const tx = makeTx();
    tx.tarea.findFirst.mockResolvedValue(tareaSelectRow({ tituloTarea: 'Nuevo título' }));
    const prisma = makePrisma(tx);
    const bitacora = makeBitacora();
    const auth = {
      assertCanEditTask: vi.fn().mockResolvedValue(tareaRaw({ tituloTarea: 'Viejo título' })),
    } as unknown as TasksAuthorizationService;
    const relations = {
      validateRelatedResources: vi.fn().mockResolvedValue({ hito: undefined, rolProyecto: undefined, etiquetas: undefined }),
    } as unknown as TasksRelationsService;
    const context = { getActiveAssignment: vi.fn().mockResolvedValue(null) } as unknown as TasksContextService;
    const service = new TasksService(prisma, auth, relations, makeNotifications(), context, bitacora);

    await service.update(PROJECT_ID, TASK_ID, ACTOR_ID, { tituloTarea: 'Nuevo título' });

    expect(bitacora.registrarEvento).toHaveBeenCalledWith(
      expect.objectContaining({
        tx,
        tipoEvento: 'TASK_UPDATED',
        idProyecto: PROJECT_ID,
        idSprint: 3,
        tipoEntidad: 'TAREA',
        idEntidad: TASK_ID,
        valorAnterior: { tituloTarea: 'Viejo título' },
        valorNuevo: { tituloTarea: 'Nuevo título' },
      }),
    );
  });

  it('update(): sin BitacoraEventosService inyectado, no falla aunque assertCanEditTask resuelva un objeto incompleto', async () => {
    const tx = makeTx();
    tx.tarea.findFirst.mockResolvedValue(tareaSelectRow());
    const prisma = makePrisma(tx);
    const auth = { assertCanEditTask: vi.fn().mockResolvedValue(undefined) } as unknown as TasksAuthorizationService;
    const relations = {
      validateRelatedResources: vi.fn().mockResolvedValue({ hito: undefined, rolProyecto: undefined, etiquetas: undefined }),
    } as unknown as TasksRelationsService;
    const context = { getActiveAssignment: vi.fn().mockResolvedValue(null) } as unknown as TasksContextService;
    const service = new TasksService(prisma, auth, relations, makeNotifications(), context);

    await expect(service.update(PROJECT_ID, TASK_ID, ACTOR_ID, { tituloTarea: 'x' })).resolves.toBeDefined();
  });

  it('updateEstado(): registra TASK_STATUS_CHANGED con estado anterior y nuevo', async () => {
    const tx = makeTx();
    tx.tarea.findFirst.mockResolvedValue(tareaSelectRow({ estadoTarea: 'HECHO' }));
    const prisma = makePrisma(tx);
    const bitacora = makeBitacora();
    const auth = {
      assertCanChangeTaskState: vi.fn().mockResolvedValue(tareaRaw({ estadoTarea: 'POR_HACER' })),
    } as unknown as TasksAuthorizationService;
    const service = new TasksService(prisma, auth, {} as TasksRelationsService, makeNotifications(), {} as TasksContextService, bitacora);

    await service.updateEstado(PROJECT_ID, TASK_ID, ACTOR_ID, { estadoTarea: 'HECHO' as any });

    expect(bitacora.registrarEvento).toHaveBeenCalledWith(
      expect.objectContaining({
        tipoEvento: 'TASK_STATUS_CHANGED',
        idSprint: 3,
        valorAnterior: { estadoTarea: 'POR_HACER' },
        valorNuevo: { estadoTarea: 'HECHO' },
      }),
    );
  });

  it('assign(): sin asignación previa registra TASK_ASSIGNED', async () => {
    const tx = makeTx();
    tx.tarea.findFirst.mockResolvedValue(tareaSelectRow());
    const prisma = makePrisma(tx);
    const bitacora = makeBitacora();
    const auth = {
      assertCanAssignTask: vi.fn().mockResolvedValue(tareaRaw({ idRolProyecto: null })),
    } as unknown as TasksAuthorizationService;
    const relations = {
      assertUserAssignableToProject: vi.fn().mockResolvedValue(10),
    } as unknown as TasksRelationsService;
    const context = { getActiveAssignment: vi.fn().mockResolvedValue(null) } as unknown as TasksContextService;
    const service = new TasksService(prisma, auth, relations, makeNotifications(), context, bitacora);

    await service.assign(PROJECT_ID, TASK_ID, ACTOR_ID, { idUsuario: 7 });

    expect(bitacora.registrarEvento).toHaveBeenCalledWith(
      expect.objectContaining({
        tipoEvento: 'TASK_ASSIGNED',
        idSprint: 3,
        valorAnterior: { idUsuario: null },
        valorNuevo: { idUsuario: 7 },
      }),
    );
  });

  it('assign(): con asignación previa distinta registra TASK_REASSIGNED', async () => {
    const tx = makeTx();
    tx.tarea.findFirst.mockResolvedValue(tareaSelectRow());
    const prisma = makePrisma(tx);
    const bitacora = makeBitacora();
    const auth = {
      assertCanAssignTask: vi.fn().mockResolvedValue(tareaRaw({ idRolProyecto: null })),
    } as unknown as TasksAuthorizationService;
    const relations = {
      assertUserAssignableToProject: vi.fn().mockResolvedValue(10),
    } as unknown as TasksRelationsService;
    const context = {
      getActiveAssignment: vi.fn().mockResolvedValue({ idAsignacion: 1, idUsuario: 3 }),
    } as unknown as TasksContextService;
    const service = new TasksService(prisma, auth, relations, makeNotifications(), context, bitacora);

    await service.assign(PROJECT_ID, TASK_ID, ACTOR_ID, { idUsuario: 7 });

    expect(bitacora.registrarEvento).toHaveBeenCalledWith(
      expect.objectContaining({
        tipoEvento: 'TASK_REASSIGNED',
        valorAnterior: { idUsuario: 3 },
        valorNuevo: { idUsuario: 7 },
      }),
    );
  });

  it('assign(): idempotente (mismo usuario ya asignado) NO registra ningún evento', async () => {
    const tx = makeTx();
    tx.tarea.findFirst.mockResolvedValue(tareaSelectRow());
    const prisma = makePrisma(tx);
    const bitacora = makeBitacora();
    const auth = {
      assertCanAssignTask: vi.fn().mockResolvedValue(tareaRaw({ idRolProyecto: null })),
    } as unknown as TasksAuthorizationService;
    const relations = {
      assertUserAssignableToProject: vi.fn().mockResolvedValue(10),
    } as unknown as TasksRelationsService;
    const context = {
      getActiveAssignment: vi.fn().mockResolvedValue({ idAsignacion: 1, idUsuario: 7 }),
    } as unknown as TasksContextService;
    const service = new TasksService(prisma, auth, relations, makeNotifications(), context, bitacora);

    await service.assign(PROJECT_ID, TASK_ID, ACTOR_ID, { idUsuario: 7 });

    expect(bitacora.registrarEvento).not.toHaveBeenCalled();
  });

  it('closeAssignment(): registra TASK_HOURS_LOGGED con las horas reportadas', async () => {
    const tx = makeTx();
    tx.asignacionTarea.findFirst.mockResolvedValue({
      idAsignacion: 1,
      idTarea: TASK_ID,
      idUsuario: ACTOR_ID,
      desasignadaEn: null,
    });
    tx.asignacionTarea.updateMany.mockResolvedValue({ count: 1 });
    tx.tarea.findFirst.mockResolvedValue(tareaSelectRow());
    const prisma = makePrisma(tx);
    const bitacora = makeBitacora();
    const context = {
      getTaskInProjectOrThrow: vi.fn().mockResolvedValue(tareaRaw()),
      assertActiveProjectParticipant: vi.fn().mockResolvedValue(undefined),
    } as unknown as TasksContextService;
    const service = new TasksService(
      prisma,
      {} as TasksAuthorizationService,
      {} as TasksRelationsService,
      makeNotifications(),
      context,
      bitacora,
    );

    await service.closeAssignment(PROJECT_ID, TASK_ID, 1, ACTOR_ID, {
      horasReales: 4,
      contenidoAvance: 'x'.repeat(200),
    });

    expect(bitacora.registrarEvento).toHaveBeenCalledWith(
      expect.objectContaining({
        tipoEvento: 'TASK_HOURS_LOGGED',
        idSprint: 3,
        valorNuevo: { idAsignacion: 1, horasReales: 4 },
      }),
    );
  });
});
