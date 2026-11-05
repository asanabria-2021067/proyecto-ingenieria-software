import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { EjemploProyectoController } from '../src/sprints/ejemplo-proyecto.controller';
import { EjemploProyectoService } from '../src/sprints/ejemplo-proyecto.service';

const LIDER = 10;

function setup(opts: { ejemplo?: boolean; operable?: boolean; tareas?: number[]; sprintEjemploActivo?: boolean; reconocimientos?: number } = {}) {
  const tx = {
    sprint: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.esEjemplo) {
          if (where.estado) return opts.sprintEjemploActivo ? { idSprint: 3 } : null;
          return opts.ejemplo ? { idSprint: 3 } : null;
        }
        return { numero: 2 };
      }),
      create: vi.fn().mockResolvedValue({ idSprint: 8 }),
      delete: vi.fn().mockResolvedValue({}),
    },
    tarea: {
      createMany: vi.fn().mockResolvedValue({ count: 4 }),
      findMany: vi.fn().mockResolvedValue((opts.tareas ?? []).map((idTarea) => ({ idTarea }))),
      updateMany: vi.fn().mockResolvedValue({}),
    },
    asignacionTarea: { updateMany: vi.fn().mockResolvedValue({}) },
    reconocimientoCompanero: { count: vi.fn().mockResolvedValue(opts.reconocimientos ?? 0) },
    instantaneaSprint: { deleteMany: vi.fn().mockResolvedValue({}) },
  };
  const prisma = { sprint: { findFirst: vi.fn().mockResolvedValue(opts.ejemplo ? { idSprint: 3 } : null) } };
  const projectTx = {
    run: vi.fn(async (_p: number, _u: number, _o: string, cb: (c: unknown) => unknown) => cb({ tx, project: { idProyecto: 1 } })),
  };
  const policy = { assertWriteTx: vi.fn().mockResolvedValue(undefined) };
  const esLider = async (_p: number, userId: number) => {
    if (userId !== LIDER) throw new ForbiddenException('No eres el líder de este proyecto');
  };
  const authorization = { assertCanStartSprint: vi.fn(esLider) };
  const context = {
    assertProjectLeader: vi.fn(esLider),
    getCurrentSprint: vi.fn().mockResolvedValue(opts.operable ? { idSprint: 5 } : null),
  };
  const service = new EjemploProyectoService(
    prisma as never,
    projectTx as never,
    policy as never,
    authorization as never,
    context as never,
  );
  return { service, tx, policy };
}

describe('MEJ-89 contenido de ejemplo del primer proyecto', () => {
  it('el líder crea un Sprint de ejemplo con tareas marcadas como ejemplo', async () => {
    const { service, tx, policy } = setup();
    expect(await service.crear(1, LIDER)).toEqual({ creado: true, idSprint: 8 });
    expect(policy.assertWriteTx).toHaveBeenCalledWith(tx, { idProyecto: 1 }, 'SPRINT_START', LIDER);
    expect(tx.sprint.create.mock.calls[0][0].data).toMatchObject({ idProyecto: 1, numero: 3, estado: 'ACTIVO', esEjemplo: true });
    const tareas = tx.tarea.createMany.mock.calls[0][0].data;
    expect(tareas.length).toBeGreaterThanOrEqual(3);
    expect(tareas.every((t: Record<string, unknown>) => t.esEjemplo === true && t.idSprint === 8 && t.creadaPor === LIDER)).toBe(true);
  });

  it('un no líder no crea, no borra ni consulta el ejemplo', async () => {
    const { service, tx } = setup();
    await expect(service.crear(1, 99)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.eliminar(1, 99)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.estado(1, 99)).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.sprint.create).not.toHaveBeenCalled();
    expect(tx.tarea.updateMany).not.toHaveBeenCalled();
    expect(tx.sprint.delete).not.toHaveBeenCalled();
  });

  it('es idempotente: si ya existe devuelve el mismo Sprint sin crear nada', async () => {
    const { service, tx } = setup({ ejemplo: true });
    expect(await service.crear(1, LIDER)).toEqual({ creado: false, idSprint: 3 });
    expect(tx.sprint.create).not.toHaveBeenCalled();
    expect(tx.tarea.createMany).not.toHaveBeenCalled();
  });

  it('con otro Sprint activo da 409', async () => {
    const { service, tx } = setup({ operable: true });
    await expect(service.crear(1, LIDER)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.sprint.create).not.toHaveBeenCalled();
  });

  it('eliminar borra las tareas de ejemplo y el Sprint de ejemplo activo, y devuelve a backlog lo ajeno', async () => {
    const { service, tx } = setup({ tareas: [1, 2, 3, 4], sprintEjemploActivo: true });
    expect(await service.eliminar(1, LIDER)).toEqual({ tareasEliminadas: 4, sprintEliminado: true });
    expect(tx.tarea.findMany.mock.calls[0][0].where).toMatchObject({ idProyecto: 1, esEjemplo: true });
    expect(tx.tarea.updateMany.mock.calls[0][0]).toMatchObject({ where: { idTarea: { in: [1, 2, 3, 4] } } });
    expect(tx.tarea.updateMany.mock.calls[0][0].data.eliminadoEn).toBeInstanceOf(Date);
    expect(tx.tarea.updateMany.mock.calls[1][0]).toEqual({ where: { idSprint: 3 }, data: { idSprint: null } });
    expect(tx.sprint.delete).toHaveBeenCalledWith({ where: { idSprint: 3 } });
  });

  it('eliminar aplica la política de estado del proyecto, igual que crear', async () => {
    const { service, tx, policy } = setup({ tareas: [1], sprintEjemploActivo: true });
    await service.eliminar(1, LIDER);
    expect(policy.assertWriteTx).toHaveBeenCalledWith(tx, { idProyecto: 1 }, 'SPRINT_START', LIDER);
  });

  it('eliminar conserva el Sprint si ya tiene reconocimientos (datos reales) y borra solo las tareas de ejemplo', async () => {
    const { service, tx } = setup({ tareas: [1, 2], sprintEjemploActivo: true, reconocimientos: 2 });
    expect(await service.eliminar(1, LIDER)).toEqual({ tareasEliminadas: 2, sprintEliminado: false });
    expect(tx.reconocimientoCompanero.count).toHaveBeenCalledWith({ where: { idSprint: 3 } });
    expect(tx.sprint.delete).not.toHaveBeenCalled();
    expect(tx.instantaneaSprint.deleteMany).not.toHaveBeenCalled();
  });

  it('eliminar sin ejemplo no hace nada', async () => {
    const { service, tx } = setup();
    expect(await service.eliminar(1, LIDER)).toEqual({ tareasEliminadas: 0, sprintEliminado: false });
    expect(tx.sprint.delete).not.toHaveBeenCalled();
  });

  it('estado informa si existe el ejemplo', async () => {
    expect(await setup({ ejemplo: true }).service.estado(1, LIDER)).toEqual({ existe: true, idSprint: 3 });
    expect(await setup().service.estado(1, LIDER)).toEqual({ existe: false, idSprint: null });
  });

  it('las rutas exigen JwtAuthGuard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, EjemploProyectoController)).toContain(JwtAuthGuard);
  });
});
