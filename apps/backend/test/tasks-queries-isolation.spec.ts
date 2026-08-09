import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TasksService } from '../src/tasks/tasks.service';
import { TasksAuthorizationService } from '../src/tasks/tasks-authorization.service';
import { TasksContextService } from '../src/tasks/tasks-context.service';

/**
 * Integración de las tres capas reales (TasksService + TasksAuthorizationService
 * + TasksContextService) sobre un Prisma simulado en memoria, para demostrar
 * aislamiento genuino entre proyectos y ausencia de filtración de datos —
 * no solo mocks de autorización que "dicen que sí" sin evaluar reglas reales.
 * No se vuelve a probar aquí la matriz interna de TasksContextService ni de
 * TasksAuthorizationService (ya cubierta en sus propios specs); se usan tal
 * cual para construir un escenario de aislamiento realista.
 */

function whereMatches(row: any, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'rolProyecto' && value && typeof value === 'object') {
      const nested = value as { idProyecto?: number };
      return row.idProyecto === nested.idProyecto;
    }
    return row[key] === value;
  });
}

function makeIsolatedPrisma(data: {
  proyectos: any[];
  tareas: any[];
  participaciones: any[];
}) {
  return {
    proyecto: {
      findFirst: vi.fn(async ({ where }: any) => data.proyectos.find((p) => whereMatches(p, where)) ?? null),
    },
    tarea: {
      findFirst: vi.fn(async ({ where }: any) => data.tareas.find((t) => whereMatches(t, where)) ?? null),
      findMany: vi.fn(async ({ where }: any) => data.tareas.filter((t) => whereMatches(t, where))),
    },
    participacionProyecto: {
      findFirst: vi.fn(
        async ({ where }: any) => data.participaciones.find((p) => whereMatches(p, where)) ?? null,
      ),
    },
  } as any;
}

function tareaRow(overrides: Record<string, unknown>) {
  return {
    idTarea: 1,
    idProyecto: 1,
    idHito: null,
    idRolProyecto: null,
    tituloTarea: 'Tarea',
    descripcionTarea: null,
    estadoTarea: 'POR_HACER',
    prioridad: 'MEDIA',
    creadaPor: 1,
    fechaCreacion: new Date('2026-01-01T00:00:00.000Z'),
    fechaLimite: null,
    actualizadaEn: null,
    tiempoEstimadoHoras: null,
    horasReales: null,
    eliminadoEn: null,
    hito: null,
    rolProyecto: null,
    asignaciones: [],
    etiquetas: [],
    _count: { comentarios: 0 },
    ...overrides,
  };
}

function makeStack(prisma: any) {
  const context = new TasksContextService(prisma);
  const authorization = new TasksAuthorizationService(context);
  const service = new TasksService(prisma, authorization);
  return service;
}

describe('Aislamiento entre proyectos (integración con implementaciones reales)', () => {
  const LIDER_A = 100;
  const LIDER_B = 200;
  const PROYECTO_A = { idProyecto: 1, creadoPor: LIDER_A, eliminadoEn: null };
  const PROYECTO_B = { idProyecto: 2, creadoPor: LIDER_B, eliminadoEn: null };
  const TAREA_DE_B = tareaRow({ idTarea: 50, idProyecto: 2, tituloTarea: 'Secreta de B', creadaPor: LIDER_B });

  it('una tarea de otro proyecto solicitada bajo el proyecto equivocado responde 404, no 200 con datos ajenos', async () => {
    const prisma = makeIsolatedPrisma({
      proyectos: [PROYECTO_A, PROYECTO_B],
      tareas: [TAREA_DE_B],
      participaciones: [],
    });
    const service = makeStack(prisma);

    let caught: any;
    try {
      await service.findOne(1, 50, LIDER_A);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(NotFoundException);
    expect(caught.getStatus()).toBe(404);
  });

  it('no se filtra ningún campo de la tarea ajena (título, creador, etc.) en el error', async () => {
    const prisma = makeIsolatedPrisma({
      proyectos: [PROYECTO_A, PROYECTO_B],
      tareas: [TAREA_DE_B],
      participaciones: [],
    });
    const service = makeStack(prisma);

    let caught: any;
    try {
      await service.findOne(1, 50, LIDER_A);
    } catch (e) {
      caught = e;
    }

    const serialized = JSON.stringify(caught?.getResponse ? caught.getResponse() : caught?.message);
    expect(serialized).not.toContain('Secreta de B');
    expect(serialized).not.toContain(String(LIDER_B));
  });

  it('tarea inexistente y tarea de otro proyecto producen el mismo resultado observable (misma taskId/projectId)', async () => {
    const prismaInexistente = makeIsolatedPrisma({
      proyectos: [PROYECTO_A],
      tareas: [], // ninguna tarea con idTarea 50 existe en absoluto
      participaciones: [],
    });
    const prismaOtroProyecto = makeIsolatedPrisma({
      proyectos: [PROYECTO_A, PROYECTO_B],
      tareas: [TAREA_DE_B], // idTarea 50 existe, pero en el proyecto 2
      participaciones: [],
    });

    const servicioInexistente = makeStack(prismaInexistente);
    const servicioOtroProyecto = makeStack(prismaOtroProyecto);

    let errorInexistente: any;
    let errorOtroProyecto: any;
    try {
      await servicioInexistente.findOne(1, 50, LIDER_A);
    } catch (e) {
      errorInexistente = e;
    }
    try {
      await servicioOtroProyecto.findOne(1, 50, LIDER_A);
    } catch (e) {
      errorOtroProyecto = e;
    }

    expect(errorInexistente).toBeInstanceOf(NotFoundException);
    expect(errorOtroProyecto).toBeInstanceOf(NotFoundException);
    expect(errorInexistente.getStatus()).toBe(errorOtroProyecto.getStatus());
    expect(errorInexistente.message).toBe(errorOtroProyecto.message);
  });

  it('la consulta de autorización usa idTarea + idProyecto + eliminadoEn en una sola llamada (sin findUnique global previo)', async () => {
    const prisma = makeIsolatedPrisma({
      proyectos: [PROYECTO_A, PROYECTO_B],
      tareas: [TAREA_DE_B],
      participaciones: [],
    });
    const service = makeStack(prisma);

    await expect(service.findOne(1, 50, LIDER_A)).rejects.toBeInstanceOf(NotFoundException);

    // Como la autorización ya falla, TasksService.findOne nunca llega a su
    // propia consulta final: tarea.findFirst se invoca una sola vez en todo
    // el flujo (desde TasksContextService.getTaskInProjectOrThrow), y esa
    // única llamada combina los tres filtros en el mismo where.
    expect(prisma.tarea.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.tarea.findFirst).toHaveBeenCalledWith({
      where: { idTarea: 50, idProyecto: 1, eliminadoEn: null },
    });
  });

  it('un líder puede leer una tarea real de su propio proyecto (camino positivo de control)', async () => {
    const tareaDeA = tareaRow({ idTarea: 60, idProyecto: 1, tituloTarea: 'Tarea real de A' });
    const prisma = makeIsolatedPrisma({
      proyectos: [PROYECTO_A],
      tareas: [tareaDeA],
      participaciones: [],
    });
    const service = makeStack(prisma);

    const resultado = await service.findOne(1, 60, LIDER_A);

    expect(resultado.idTarea).toBe(60);
    expect(resultado.tituloTarea).toBe('Tarea real de A');
  });

  it('un participante activo (no líder) puede leer una tarea de un proyecto donde participa', async () => {
    const tareaDeA = tareaRow({ idTarea: 61, idProyecto: 1 });
    const prisma = makeIsolatedPrisma({
      proyectos: [PROYECTO_A],
      tareas: [tareaDeA],
      participaciones: [
        { idParticipacion: 1, idUsuario: 300, estadoParticipacion: 'ACTIVO', idProyecto: 1 },
      ],
    });
    const service = makeStack(prisma);

    const resultado = await service.findOne(1, 61, 300);

    expect(resultado.idTarea).toBe(61);
  });

  it('un usuario externo (ni líder ni participante) recibe 403 al leer una tarea real y existente', async () => {
    const tareaDeA = tareaRow({ idTarea: 62, idProyecto: 1 });
    const prisma = makeIsolatedPrisma({
      proyectos: [PROYECTO_A],
      tareas: [tareaDeA],
      participaciones: [],
    });
    const service = makeStack(prisma);

    let caught: any;
    try {
      await service.findOne(1, 62, 999);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(ForbiddenException);
    expect(caught.getStatus()).toBe(403);
  });

  it('listar tareas de un proyecto inexistente responde 404 y nunca consulta tarea.findMany', async () => {
    const prisma = makeIsolatedPrisma({ proyectos: [], tareas: [], participaciones: [] });
    const service = makeStack(prisma);

    await expect(service.findAll(999, LIDER_A)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.tarea.findMany).not.toHaveBeenCalled();
  });

  it('listar tareas sin participación activa responde 403 y nunca consulta tarea.findMany', async () => {
    const prisma = makeIsolatedPrisma({
      proyectos: [PROYECTO_A],
      tareas: [tareaRow({ idTarea: 1, idProyecto: 1 })],
      participaciones: [],
    });
    const service = makeStack(prisma);

    await expect(service.findAll(1, 999)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.tarea.findMany).not.toHaveBeenCalled();
  });

  it('listar tareas como líder solo devuelve tareas del proyecto solicitado, nunca de otro', async () => {
    const tareaDeA = tareaRow({ idTarea: 70, idProyecto: 1 });
    const prisma = makeIsolatedPrisma({
      proyectos: [PROYECTO_A, PROYECTO_B],
      tareas: [tareaDeA, TAREA_DE_B],
      participaciones: [],
    });
    const service = makeStack(prisma);

    const resultado = await service.findAll(1, LIDER_A);

    expect(resultado.map((t) => t.idTarea)).toEqual([70]);
  });
});
