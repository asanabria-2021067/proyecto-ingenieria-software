import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { TasksController } from '../src/tasks/tasks.controller';
import { TasksService } from '../src/tasks/tasks.service';

// Integration test for HT-05 (T-223): flujo completo del modulo de tareas
// (Kanban) -- crear, mover entre columnas, asignar, actualizar, eliminar.
// Real TasksController + real TasksService wired together, against an
// in-memory Prisma double. Follows the same pattern as
// proyectos-destacados.e2e.spec.ts / password-recovery-admin.e2e.spec.ts
// (no Nest TestingModule / Supertest -- see the note in the latter file).

function createFakePrisma() {
  let nextTareaId = 1;
  let nextAsignacionId = 1;
  const proyectos = new Map<number, any>();
  const usuarios = new Map<number, any>();
  const tareas = new Map<number, any>();
  const asignaciones = new Map<string, any>();
  const comentarios = new Map<number, any>();

  function tareaConAsignaciones(t: any) {
    return { ...t, asignaciones: [...asignaciones.values()].filter((a) => a.idTarea === t.idTarea) };
  }

  const prisma = {
    proyecto: {
      findUnique: async ({ where }: any) => proyectos.get(where.idProyecto) ?? null,
    },
    usuario: {
      findUnique: async ({ where }: any) => usuarios.get(where.idUsuario) ?? null,
    },
    tarea: {
      create: async ({ data }: any) => {
        const row = {
          idTarea: nextTareaId++,
          idProyecto: data.idProyecto,
          idHito: data.idHito ?? null,
          tituloTarea: data.tituloTarea,
          descripcionTarea: data.descripcionTarea ?? null,
          estadoTarea: 'POR_HACER',
          prioridad: data.prioridad ?? 'MEDIA',
          creadaPor: data.creadaPor,
          fechaCreacion: new Date(),
          actualizadaEn: null,
        };
        tareas.set(row.idTarea, row);
        return { ...row };
      },
      findMany: async ({ where }: any) => {
        return [...tareas.values()]
          .filter((t) => !where?.idProyecto || t.idProyecto === where.idProyecto)
          .map(tareaConAsignaciones);
      },
      findUnique: async ({ where }: any) => {
        const t = tareas.get(where.idTarea);
        return t ? tareaConAsignaciones(t) : null;
      },
      update: async ({ where, data }: any) => {
        const t = tareas.get(where.idTarea);
        for (const key of Object.keys(data)) {
          if (data[key] !== undefined) t[key] = data[key];
        }
        return tareaConAsignaciones(t);
      },
      delete: async ({ where }: any) => {
        const t = tareas.get(where.idTarea);
        tareas.delete(where.idTarea);
        return t;
      },
    },
    asignacionTarea: {
      findUnique: async ({ where }: any) => {
        const { idTarea, idUsuario } = where.idTarea_idUsuario;
        return asignaciones.get(`${idTarea}:${idUsuario}`) ?? null;
      },
      create: async ({ data }: any) => {
        const row = { idAsignacion: nextAsignacionId++, fechaAsignacion: new Date(), ...data };
        asignaciones.set(`${data.idTarea}:${data.idUsuario}`, row);
        return { ...row };
      },
      deleteMany: async ({ where }: any) => {
        let count = 0;
        for (const [key, row] of asignaciones) {
          if (row.idTarea === where.idTarea) {
            asignaciones.delete(key);
            count++;
          }
        }
        return { count };
      },
    },
    comentario: {
      deleteMany: async ({ where }: any) => {
        let count = 0;
        for (const [key, row] of comentarios) {
          if (row.idTarea === where.idTarea) {
            comentarios.delete(key);
            count++;
          }
        }
        return { count };
      },
    },
    $transaction: async (queries: Promise<any>[]) => Promise.all(queries),
  };

  return {
    prisma,
    asignacionesInternas: asignaciones,
    seedProyecto(idProyecto: number) {
      proyectos.set(idProyecto, { idProyecto });
    },
    seedUsuario(idUsuario: number) {
      usuarios.set(idUsuario, { idUsuario });
    },
    seedComentario(idComentario: number, idTarea: number) {
      comentarios.set(idComentario, { idComentario, idTarea });
    },
  };
}

describe('HT-05: flujo completo del modulo de tareas (Kanban)', () => {
  const ID_PROYECTO = 1;
  const LIDER = 10;
  const MIEMBRO = 20;

  let fake: ReturnType<typeof createFakePrisma>;
  let tasksService: TasksService;
  let controller: TasksController;

  beforeEach(() => {
    fake = createFakePrisma();
    fake.seedProyecto(ID_PROYECTO);
    fake.seedUsuario(LIDER);
    fake.seedUsuario(MIEMBRO);

    tasksService = new TasksService(fake.prisma as any);
    controller = new TasksController(tasksService, {} as any);
  });

  it('flujo completo: crear -> mover de columna -> asignar -> actualizar -> eliminar', async () => {
    const tarea = await controller.create(
      { idProyecto: ID_PROYECTO, tituloTarea: 'Diseñar wireframes', descripcionTarea: 'Pantallas iniciales' } as any,
      { userId: LIDER },
    );
    expect(tarea.idTarea).toBeDefined();
    expect(tarea.estadoTarea).toBe('POR_HACER');

    const movida = await controller.update(tarea.idTarea, { estadoTarea: 'EN_PROGRESO' } as any);
    expect(movida.estadoTarea).toBe('EN_PROGRESO');

    const asignacion = await controller.assign(tarea.idTarea, { idUsuario: MIEMBRO } as any, { userId: LIDER });
    expect(asignacion.idUsuario).toBe(MIEMBRO);
    expect(asignacion.asignadoPor).toBe(LIDER);

    const actualizada = await controller.update(tarea.idTarea, {
      tituloTarea: 'Diseñar wireframes de alta fidelidad',
      estadoTarea: 'EN_REVISION',
    } as any);
    expect(actualizada.tituloTarea).toBe('Diseñar wireframes de alta fidelidad');
    expect(actualizada.estadoTarea).toBe('EN_REVISION');

    const listado = await controller.findAll(String(ID_PROYECTO));
    expect(listado).toHaveLength(1);
    expect(listado[0].asignaciones).toHaveLength(1);

    const resultado = await controller.remove(tarea.idTarea);
    expect(resultado.mensaje).toMatch(/eliminada/i);
    await expect(controller.findOne(tarea.idTarea)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rechaza crear una tarea en un proyecto inexistente', async () => {
    await expect(
      controller.create({ idProyecto: 999, tituloTarea: 'X' } as any, { userId: LIDER }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rechaza actualizar/asignar/eliminar una tarea inexistente', async () => {
    await expect(controller.update(999, { estadoTarea: 'HECHO' } as any)).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.assign(999, { idUsuario: MIEMBRO } as any, { userId: LIDER })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(controller.remove(999)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rechaza asignar una tarea a un usuario inexistente', async () => {
    const tarea = await controller.create({ idProyecto: ID_PROYECTO, tituloTarea: 'X' } as any, { userId: LIDER });
    await expect(controller.assign(tarea.idTarea, { idUsuario: 999 } as any, { userId: LIDER })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rechaza asignar dos veces al mismo usuario a la misma tarea', async () => {
    const tarea = await controller.create({ idProyecto: ID_PROYECTO, tituloTarea: 'X' } as any, { userId: LIDER });
    await controller.assign(tarea.idTarea, { idUsuario: MIEMBRO } as any, { userId: LIDER });

    await expect(controller.assign(tarea.idTarea, { idUsuario: MIEMBRO } as any, { userId: LIDER })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('al eliminar una tarea, tambien elimina sus asignaciones y comentarios (evita error de FK)', async () => {
    const tarea = await controller.create({ idProyecto: ID_PROYECTO, tituloTarea: 'X' } as any, { userId: LIDER });
    await controller.assign(tarea.idTarea, { idUsuario: MIEMBRO } as any, { userId: LIDER });
    fake.seedComentario(1, tarea.idTarea);

    await controller.remove(tarea.idTarea);

    expect([...fake.asignacionesInternas.values()].filter((a) => a.idTarea === tarea.idTarea)).toHaveLength(0);
  });
});
