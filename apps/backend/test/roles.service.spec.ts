import { describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RolesService } from '../src/roles/roles.service';

const LEADER_ID = 1;
const OTHER_USER_ID = 2;
const PROJECT_ID = 10;
const ROLE_ID = 100;
const OTHER_ROLE_ID = 101;

function proyecto(overrides: Record<string, unknown> = {}) {
  return { idProyecto: PROJECT_ID, creadoPor: LEADER_ID, tituloProyecto: 'Proyecto X', ...overrides };
}

function rolBase(overrides: Record<string, unknown> = {}) {
  return {
    idRolProyecto: ROLE_ID,
    idProyecto: PROJECT_ID,
    nombreRol: 'Frontend',
    descripcionRolProyecto: null,
    idCarreraRequerida: null,
    cupos: 2,
    horasSemanalesEstimadas: null,
    ...overrides,
  };
}

function rolConStats(overrides: Record<string, unknown> = {}) {
  return {
    ...rolBase(overrides),
    carreraRequerida: null,
    requisitos: [],
    participaciones: [],
    ...overrides,
  };
}

function makePrisma() {
  const prisma: any = {
    proyecto: { findFirst: vi.fn() },
    rolProyecto: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    participacionProyecto: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    carrera: { findUnique: vi.fn() },
    habilidad: { findMany: vi.fn() },
    requisitoHabilidadRol: { count: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    tarea: { count: vi.fn() },
    postulacion: { count: vi.fn(), create: vi.fn() },
    asignacionTarea: { findMany: vi.fn(), updateMany: vi.fn() },
    usuario: { findUnique: vi.fn() },
  };
  // El tx comparte los mismos mocks (los tests controlan los retornos).
  prisma.$transaction = vi.fn(async (fn: any) => fn(prisma));
  return prisma;
}

function makeNotifications() {
  return {
    notifyRoleMembers: vi.fn().mockResolvedValue(undefined),
    notifyUsers: vi.fn().mockResolvedValue(undefined),
  } as any;
}

function knownError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('mock', {
    code,
    clientVersion: 'test',
  });
}

// ─────────────────────── createRole (Sección 8) ───────────────────────
describe('RolesService.createRole', () => {
  it('el líder crea un rol y devuelve stats', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyecto());
    prisma.rolProyecto.create.mockResolvedValue(rolConStats());
    const service = new RolesService(prisma, makeNotifications());

    const res = await service.createRole(PROJECT_ID, { nombreRol: 'Frontend', cupos: 2 }, LEADER_ID);

    expect(res.idRolProyecto).toBe(ROLE_ID);
    expect(res.cuposDisponibles).toBe(2);
    expect(prisma.rolProyecto.create).toHaveBeenCalled();
  });

  it('un no-líder recibe 403', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyecto());
    const service = new RolesService(prisma, makeNotifications());

    await expect(
      service.createRole(PROJECT_ID, { nombreRol: 'X', cupos: 1 }, OTHER_USER_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.rolProyecto.create).not.toHaveBeenCalled();
  });

  it('proyecto inexistente ⇒ 404', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(null);
    const service = new RolesService(prisma, makeNotifications());

    await expect(
      service.createRole(PROJECT_ID, { nombreRol: 'X', cupos: 1 }, LEADER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('carrera inexistente ⇒ 400', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyecto());
    prisma.carrera.findUnique.mockResolvedValue(null);
    const service = new RolesService(prisma, makeNotifications());

    await expect(
      service.createRole(PROJECT_ID, { nombreRol: 'X', cupos: 1, idCarreraRequerida: 7 }, LEADER_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('habilidad inexistente ⇒ 400', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyecto());
    prisma.habilidad.findMany.mockResolvedValue([]); // ninguna encontrada
    const service = new RolesService(prisma, makeNotifications());

    await expect(
      service.createRole(
        PROJECT_ID,
        { nombreRol: 'X', cupos: 1, requisitos: [{ idHabilidad: 5, nivelMinimo: 'BASICO', obligatorio: true }] },
        LEADER_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ─────────────────────── updateRole (Sección 8) ───────────────────────
describe('RolesService.updateRole', () => {
  it('el líder edita el nombre conservando el idRolProyecto y notifica', async () => {
    const prisma = makePrisma();
    const notifications = makeNotifications();
    prisma.proyecto.findFirst.mockResolvedValue(proyecto());
    prisma.rolProyecto.findFirst.mockResolvedValue(rolBase());
    prisma.rolProyecto.update.mockResolvedValue(rolBase({ nombreRol: 'Frontend Web' }));
    prisma.rolProyecto.findUniqueOrThrow.mockResolvedValue(rolConStats({ nombreRol: 'Frontend Web' }));
    const service = new RolesService(prisma, notifications);

    const res = await service.updateRole(PROJECT_ID, ROLE_ID, { nombreRol: 'Frontend Web' }, LEADER_ID);

    expect(res.idRolProyecto).toBe(ROLE_ID);
    expect(res.nombreRol).toBe('Frontend Web');
    expect(notifications.notifyRoleMembers).toHaveBeenCalledWith(
      PROJECT_ID,
      ROLE_ID,
      LEADER_ID,
      expect.objectContaining({ tipoNotificacion: 'ROL_ACTUALIZADO' }),
    );
  });

  it('reducir cupos por debajo de los participantes activos ⇒ 400 (no 409)', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyecto());
    prisma.rolProyecto.findFirst.mockResolvedValue(rolBase({ cupos: 3 }));
    prisma.participacionProyecto.count.mockResolvedValue(2); // 2 activos
    const service = new RolesService(prisma, makeNotifications());

    await expect(
      service.updateRole(PROJECT_ID, ROLE_ID, { cupos: 1 }, LEADER_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.rolProyecto.update).not.toHaveBeenCalled();
  });

  it('reducción de cupos válida (>= activos) procede', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyecto());
    prisma.rolProyecto.findFirst.mockResolvedValue(rolBase({ cupos: 3 }));
    prisma.participacionProyecto.count.mockResolvedValue(2);
    prisma.rolProyecto.update.mockResolvedValue(rolBase({ cupos: 2 }));
    prisma.rolProyecto.findUniqueOrThrow.mockResolvedValue(rolConStats({ cupos: 2 }));
    const service = new RolesService(prisma, makeNotifications());

    const res = await service.updateRole(PROJECT_ID, ROLE_ID, { cupos: 2 }, LEADER_ID);
    expect(res.cupos).toBe(2);
  });

  it('rol de otro proyecto ⇒ 404', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyecto());
    prisma.rolProyecto.findFirst.mockResolvedValue(null);
    const service = new RolesService(prisma, makeNotifications());

    await expect(
      service.updateRole(PROJECT_ID, ROLE_ID, { nombreRol: 'X' }, LEADER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reemplaza el conjunto de habilidades sin expulsar participantes', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyecto());
    prisma.rolProyecto.findFirst.mockResolvedValue(rolBase());
    prisma.habilidad.findMany.mockResolvedValue([{ idHabilidad: 5 }]);
    prisma.rolProyecto.findUniqueOrThrow.mockResolvedValue(rolConStats());
    const service = new RolesService(prisma, makeNotifications());

    await service.updateRole(
      PROJECT_ID,
      ROLE_ID,
      { requisitos: [{ idHabilidad: 5, nivelMinimo: 'BASICO', obligatorio: true }] },
      LEADER_ID,
    );

    expect(prisma.requisitoHabilidadRol.deleteMany).toHaveBeenCalledWith({
      where: { idRolProyecto: ROLE_ID },
    });
    expect(prisma.requisitoHabilidadRol.createMany).toHaveBeenCalled();
    expect(prisma.participacionProyecto.update).not.toHaveBeenCalled();
  });

  it('sin cambios relevantes no notifica', async () => {
    const prisma = makePrisma();
    const notifications = makeNotifications();
    prisma.proyecto.findFirst.mockResolvedValue(proyecto());
    prisma.rolProyecto.findFirst.mockResolvedValue(rolBase({ nombreRol: 'Frontend' }));
    prisma.rolProyecto.update.mockResolvedValue(rolBase());
    prisma.rolProyecto.findUniqueOrThrow.mockResolvedValue(rolConStats());
    const service = new RolesService(prisma, notifications);

    await service.updateRole(PROJECT_ID, ROLE_ID, { nombreRol: 'Frontend' }, LEADER_ID);
    expect(notifications.notifyRoleMembers).not.toHaveBeenCalled();
  });
});

// ─────────────────────── deleteRole (Sección 9) ───────────────────────
describe('RolesService.deleteRole', () => {
  function armarVacio(prisma: any) {
    prisma.proyecto.findFirst.mockResolvedValue(proyecto());
    prisma.rolProyecto.findFirst.mockResolvedValue(rolBase());
    prisma.participacionProyecto.count.mockResolvedValue(0);
    prisma.tarea.count.mockResolvedValue(0);
    prisma.postulacion.count.mockResolvedValue(0);
    prisma.requisitoHabilidadRol.deleteMany.mockResolvedValue({ count: 0 });
    prisma.rolProyecto.delete.mockResolvedValue(rolBase());
  }

  it('elimina un rol nunca utilizado (sin relaciones)', async () => {
    const prisma = makePrisma();
    armarVacio(prisma);
    const service = new RolesService(prisma, makeNotifications());

    const res = await service.deleteRole(PROJECT_ID, ROLE_ID, LEADER_ID);
    expect(res).toEqual({ idRolProyecto: ROLE_ID, eliminado: true });
    expect(prisma.rolProyecto.delete).toHaveBeenCalled();
  });

  it('rol solo con requisitos: elimina requisitos y rol atómicamente', async () => {
    const prisma = makePrisma();
    armarVacio(prisma);
    prisma.requisitoHabilidadRol.deleteMany.mockResolvedValue({ count: 2 }); // tenía 2 habilidades
    const service = new RolesService(prisma, makeNotifications());

    const res = await service.deleteRole(PROJECT_ID, ROLE_ID, LEADER_ID);

    expect(res).toEqual({ idRolProyecto: ROLE_ID, eliminado: true });
    // Ambas operaciones dentro de la misma transacción.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.requisitoHabilidadRol.deleteMany).toHaveBeenCalledWith({
      where: { idRolProyecto: ROLE_ID },
    });
    expect(prisma.rolProyecto.delete).toHaveBeenCalledWith({
      where: { idRolProyecto: ROLE_ID },
    });
  });

  it.each([
    ['participación', 'participacionProyecto'],
    ['tarea', 'tarea'],
    ['postulación', 'postulacion'],
  ])('rechaza (400) si tiene %s (historial externo)', async (_label, modelo) => {
    const prisma = makePrisma();
    armarVacio(prisma);
    prisma[modelo].count.mockResolvedValue(1);
    const service = new RolesService(prisma, makeNotifications());

    await expect(service.deleteRole(PROJECT_ID, ROLE_ID, LEADER_ID)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.rolProyecto.delete).not.toHaveBeenCalled();
  });

  it('rollback completo: si falla el delete del rol, la transacción propaga el error', async () => {
    const prisma = makePrisma();
    armarVacio(prisma);
    // El borrado de requisitos ocurre, pero el del rol falla dentro del tx.
    prisma.rolProyecto.delete.mockRejectedValue(new Error('fallo de BD'));
    const service = new RolesService(prisma, makeNotifications());

    await expect(service.deleteRole(PROJECT_ID, ROLE_ID, LEADER_ID)).rejects.toThrow('fallo de BD');
    // La transacción envuelve ambas operaciones: un fallo revierte todo (no
    // hay borrado parcial persistido).
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('un no-líder recibe 403', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyecto());
    prisma.rolProyecto.findFirst.mockResolvedValue(rolBase());
    const service = new RolesService(prisma, makeNotifications());

    await expect(service.deleteRole(PROJECT_ID, ROLE_ID, OTHER_USER_ID)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

// ─────────────────── selfAssign / autoasignación líder (Sección 6) ───────────────────
describe('RolesService.selfAssign', () => {
  function armar(prisma: any, overrides: Record<string, unknown> = {}) {
    prisma.proyecto.findFirst.mockResolvedValue(proyecto());
    prisma.rolProyecto.findFirst.mockResolvedValue(rolBase(overrides));
  }

  it('el líder se asigna: crea ACTIVO, consume cupo, no crea Postulación', async () => {
    const prisma = makePrisma();
    armar(prisma);
    prisma.participacionProyecto.findFirst.mockResolvedValue(null); // no existente
    prisma.participacionProyecto.count.mockResolvedValue(0); // cupo disponible
    prisma.participacionProyecto.create.mockResolvedValue({ idParticipacion: 500 });
    const service = new RolesService(prisma, makeNotifications());

    const res = await service.selfAssign(PROJECT_ID, ROLE_ID, LEADER_ID);

    expect(res.yaParticipaba).toBe(false);
    expect(res.estadoParticipacion).toBe('ACTIVO');
    expect(prisma.participacionProyecto.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estadoParticipacion: 'ACTIVO', idUsuario: LEADER_ID }),
      }),
    );
    expect(prisma.postulacion.create).not.toHaveBeenCalled();
  });

  it('es idempotente: si ya participa, no crea otra fila ni notifica', async () => {
    const prisma = makePrisma();
    const notifications = makeNotifications();
    armar(prisma);
    prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 42 });
    const service = new RolesService(prisma, notifications);

    const res = await service.selfAssign(PROJECT_ID, ROLE_ID, LEADER_ID);

    expect(res.yaParticipaba).toBe(true);
    expect(prisma.participacionProyecto.create).not.toHaveBeenCalled();
    expect(prisma.participacionProyecto.count).not.toHaveBeenCalled();
    expect(notifications.notifyRoleMembers).not.toHaveBeenCalled();
  });

  it('cupo lleno ⇒ 400', async () => {
    const prisma = makePrisma();
    armar(prisma, { cupos: 1 });
    prisma.participacionProyecto.findFirst.mockResolvedValue(null);
    prisma.participacionProyecto.count.mockResolvedValue(1); // lleno
    const service = new RolesService(prisma, makeNotifications());

    await expect(service.selfAssign(PROJECT_ID, ROLE_ID, LEADER_ID)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.participacionProyecto.create).not.toHaveBeenCalled();
  });

  it('un no-líder recibe 403', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyecto());
    const service = new RolesService(prisma, makeNotifications());

    await expect(service.selfAssign(PROJECT_ID, ROLE_ID, OTHER_USER_ID)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rol inexistente (otro proyecto) ⇒ 404', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyecto());
    prisma.rolProyecto.findFirst.mockResolvedValue(null);
    const service = new RolesService(prisma, makeNotifications());

    await expect(service.selfAssign(PROJECT_ID, ROLE_ID, LEADER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('carrera concurrente (P2002) ⇒ 409', async () => {
    const prisma = makePrisma();
    armar(prisma);
    prisma.participacionProyecto.findFirst.mockResolvedValue(null);
    prisma.participacionProyecto.count.mockResolvedValue(0);
    prisma.participacionProyecto.create.mockRejectedValue(knownError('P2002'));
    const service = new RolesService(prisma, makeNotifications());

    await expect(service.selfAssign(PROJECT_ID, ROLE_ID, LEADER_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('excluye al actor de la notificación (notifyRoleMembers con actorUserId=líder)', async () => {
    const prisma = makePrisma();
    const notifications = makeNotifications();
    armar(prisma);
    prisma.participacionProyecto.findFirst.mockResolvedValue(null);
    prisma.participacionProyecto.count.mockResolvedValue(0);
    prisma.participacionProyecto.create.mockResolvedValue({ idParticipacion: 1 });
    const service = new RolesService(prisma, notifications);

    await service.selfAssign(PROJECT_ID, ROLE_ID, LEADER_ID);

    expect(notifications.notifyRoleMembers).toHaveBeenCalledWith(
      PROJECT_ID,
      ROLE_ID,
      LEADER_ID,
      expect.objectContaining({ tipoNotificacion: 'ROL_ASIGNADO_LIDER' }),
    );
  });

  it('un fallo de notificación no revierte la asignación', async () => {
    const prisma = makePrisma();
    const notifications = makeNotifications();
    notifications.notifyRoleMembers.mockRejectedValue(new Error('gateway caído'));
    armar(prisma);
    prisma.participacionProyecto.findFirst.mockResolvedValue(null);
    prisma.participacionProyecto.count.mockResolvedValue(0);
    prisma.participacionProyecto.create.mockResolvedValue({ idParticipacion: 1 });
    const service = new RolesService(prisma, notifications);

    await expect(service.selfAssign(PROJECT_ID, ROLE_ID, LEADER_ID)).resolves.toMatchObject({
      yaParticipaba: false,
    });
  });
});

// ─────────────────── leaveRole / retiro limitado (Secciones 10-16) ───────────────────
describe('RolesService.leaveRole', () => {
  function armarConDosRoles(prisma: any, tareasDelRol: number[] = []) {
    prisma.proyecto.findFirst.mockResolvedValue(proyecto());
    prisma.rolProyecto.findFirst.mockResolvedValue(rolBase());
    prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 900 });
    prisma.participacionProyecto.count.mockResolvedValue(1); // conserva otro rol
    prisma.asignacionTarea.findMany.mockResolvedValue(
      tareasDelRol.map((id) => ({ idAsignacion: id })),
    );
    prisma.asignacionTarea.updateMany.mockResolvedValue({ count: tareasDelRol.length });
    prisma.participacionProyecto.update.mockResolvedValue({ idParticipacion: 900 });
    // Notificación post-commit
    prisma.usuario.findUnique.mockResolvedValue({ nombre: 'Ana', apellido: 'Uno' });
    prisma.rolProyecto.findUnique.mockResolvedValue({ nombreRol: 'Frontend' });
    prisma.participacionProyecto.findMany.mockResolvedValue([]);
  }

  it('abandona un rol conservando otro: RETIRADO + cierra sus asignaciones', async () => {
    const prisma = makePrisma();
    armarConDosRoles(prisma, [11, 12]);
    const service = new RolesService(prisma, makeNotifications());

    const res = await service.leaveRole(PROJECT_ID, ROLE_ID, OTHER_USER_ID);

    expect(res).toMatchObject({ estadoParticipacion: 'RETIRADO', tareasDesasignadas: 2 });
    expect(prisma.participacionProyecto.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estadoParticipacion: 'RETIRADO' }),
      }),
    );
    // Solo cierra asignaciones (fija desasignadaEn), sin cambiar estado de tarea.
    expect(prisma.asignacionTarea.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idAsignacion: { in: [11, 12] } },
        data: expect.objectContaining({ desasignadaEn: expect.any(Date) }),
      }),
    );
  });

  it('cierra asignaciones solo del rol abandonado (filtra por idRolProyecto)', async () => {
    const prisma = makePrisma();
    armarConDosRoles(prisma, [11]);
    const service = new RolesService(prisma, makeNotifications());

    await service.leaveRole(PROJECT_ID, ROLE_ID, OTHER_USER_ID);

    expect(prisma.asignacionTarea.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          idUsuario: OTHER_USER_ID,
          desasignadaEn: null,
          tarea: expect.objectContaining({ idRolProyecto: ROLE_ID, eliminadoEn: null }),
        }),
      }),
    );
  });

  it('sin tareas del rol: RETIRADO igual, no llama updateMany', async () => {
    const prisma = makePrisma();
    armarConDosRoles(prisma, []);
    const service = new RolesService(prisma, makeNotifications());

    const res = await service.leaveRole(PROJECT_ID, ROLE_ID, OTHER_USER_ID);
    expect(res.tareasDesasignadas).toBe(0);
    expect(prisma.asignacionTarea.updateMany).not.toHaveBeenCalled();
  });

  it('abandonar el último rol activo ⇒ 400', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyecto());
    prisma.rolProyecto.findFirst.mockResolvedValue(rolBase());
    prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 900 });
    prisma.participacionProyecto.count.mockResolvedValue(0); // ningún otro rol
    const service = new RolesService(prisma, makeNotifications());

    await expect(service.leaveRole(PROJECT_ID, ROLE_ID, OTHER_USER_ID)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.participacionProyecto.update).not.toHaveBeenCalled();
  });

  it('no participa en el rol ⇒ 400', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyecto());
    prisma.rolProyecto.findFirst.mockResolvedValue(rolBase());
    prisma.participacionProyecto.findFirst.mockResolvedValue(null);
    const service = new RolesService(prisma, makeNotifications());

    await expect(service.leaveRole(PROJECT_ID, ROLE_ID, OTHER_USER_ID)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rol inexistente ⇒ 404', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyecto());
    prisma.rolProyecto.findFirst.mockResolvedValue(null);
    const service = new RolesService(prisma, makeNotifications());

    await expect(service.leaveRole(PROJECT_ID, ROLE_ID, OTHER_USER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('emite una notificación ROL_ABANDONADO consolidada excluyendo al actor', async () => {
    const prisma = makePrisma();
    const notifications = makeNotifications();
    armarConDosRoles(prisma, [11, 12]);
    // El líder recibe; el actor (OTHER_USER_ID) se excluye.
    prisma.participacionProyecto.findMany.mockResolvedValue([{ idUsuario: OTHER_USER_ID }]);
    const service = new RolesService(prisma, notifications);

    await service.leaveRole(PROJECT_ID, ROLE_ID, OTHER_USER_ID);

    expect(notifications.notifyUsers).toHaveBeenCalledTimes(1);
    const [destinatarios, payload] = notifications.notifyUsers.mock.calls[0];
    expect(destinatarios).toEqual([LEADER_ID]); // actor excluido, dedup
    expect(payload.tipoNotificacion).toBe('ROL_ABANDONADO');
  });

  it('incluye la cantidad de tareas afectadas en la notificación consolidada', async () => {
    const prisma = makePrisma();
    const notifications = makeNotifications();
    armarConDosRoles(prisma, [11, 12, 13]);
    prisma.participacionProyecto.findMany.mockResolvedValue([{ idUsuario: OTHER_USER_ID }]);
    const service = new RolesService(prisma, notifications);

    await service.leaveRole(PROJECT_ID, ROLE_ID, OTHER_USER_ID);

    const [, payload] = notifications.notifyUsers.mock.calls[0];
    expect(payload.datosJson.taskCount).toBe(3);
    expect(payload.mensajeNotificacion).toMatch(/3 tareas quedaron sin asignar/);
  });

  it('un fallo de notificación no revierte el retiro (best-effort)', async () => {
    const prisma = makePrisma();
    const notifications = makeNotifications();
    notifications.notifyUsers.mockRejectedValue(new Error('gateway caído'));
    armarConDosRoles(prisma, [11]);
    prisma.participacionProyecto.findMany.mockResolvedValue([{ idUsuario: LEADER_ID }]);
    const service = new RolesService(prisma, notifications);

    await expect(service.leaveRole(PROJECT_ID, ROLE_ID, OTHER_USER_ID)).resolves.toMatchObject({
      estadoParticipacion: 'RETIRADO',
      tareasDesasignadas: 1,
    });
  });

  it('no elimina la participación: solo la marca RETIRADO', async () => {
    const prisma = makePrisma();
    armarConDosRoles(prisma, []);
    const service = new RolesService(prisma, makeNotifications());

    await service.leaveRole(PROJECT_ID, ROLE_ID, OTHER_USER_ID);

    expect(prisma.participacionProyecto.delete).not.toHaveBeenCalled();
    expect(prisma.participacionProyecto.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estadoParticipacion: 'RETIRADO' }),
      }),
    );
  });

  it('el líder abandonando su propio rol no se auto-notifica', async () => {
    const prisma = makePrisma();
    const notifications = makeNotifications();
    armarConDosRoles(prisma, []);
    // Solo el líder sería destinatario, pero es el actor ⇒ cero destinatarios.
    prisma.participacionProyecto.findMany.mockResolvedValue([{ idUsuario: LEADER_ID }]);
    const service = new RolesService(prisma, notifications);

    await service.leaveRole(PROJECT_ID, ROLE_ID, LEADER_ID);
    expect(notifications.notifyUsers).not.toHaveBeenCalled();
  });
});

// ─────────────────────── listRoles (Sección 22) ───────────────────────
describe('RolesService.listRoles', () => {
  it('el líder ve stats, isMine y canLeave', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyecto());
    prisma.rolProyecto.findMany.mockResolvedValue([
      rolConStats({ idRolProyecto: ROLE_ID, cupos: 2, participaciones: [{ idUsuario: LEADER_ID }] }),
      rolConStats({ idRolProyecto: OTHER_ROLE_ID, cupos: 3, participaciones: [] }),
    ]);
    prisma.participacionProyecto.findMany.mockResolvedValue([
      { idRolProyecto: ROLE_ID },
      { idRolProyecto: OTHER_ROLE_ID },
    ]);
    const service = new RolesService(prisma, makeNotifications());

    const res = await service.listRoles(PROJECT_ID, LEADER_ID);

    expect(res.isLeader).toBe(true);
    const rol0 = res.roles[0];
    expect(rol0.isMine).toBe(true);
    expect(rol0.canLeave).toBe(true); // participa en 2 roles
    expect(rol0.cuposDisponibles).toBe(1);
  });

  it('un externo (ni líder ni participante) recibe 403', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyecto());
    prisma.rolProyecto.findMany.mockResolvedValue([]);
    prisma.participacionProyecto.findMany.mockResolvedValue([]);
    const service = new RolesService(prisma, makeNotifications());

    await expect(service.listRoles(PROJECT_ID, OTHER_USER_ID)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('un participante con un solo rol tiene canLeave=false', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyecto());
    prisma.rolProyecto.findMany.mockResolvedValue([
      rolConStats({ idRolProyecto: ROLE_ID, participaciones: [{ idUsuario: OTHER_USER_ID }] }),
    ]);
    prisma.participacionProyecto.findMany.mockResolvedValue([{ idRolProyecto: ROLE_ID }]);
    const service = new RolesService(prisma, makeNotifications());

    const res = await service.listRoles(PROJECT_ID, OTHER_USER_ID);
    expect(res.roles[0].isMine).toBe(true);
    expect(res.roles[0].canLeave).toBe(false);
  });
});
