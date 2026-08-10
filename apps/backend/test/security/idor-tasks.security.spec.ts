import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TasksService } from '../../src/tasks/tasks.service';
import { TasksAuthorizationService } from '../../src/tasks/tasks-authorization.service';
import { TasksContextService } from '../../src/tasks/tasks-context.service';

/**
 * Seguridad — IDOR (OWASP A01:2021, Broken Access Control) sobre
 * /proyectos/:id/tareas y /tareas/:id.
 *
 * Complementa test/tasks-queries-isolation.spec.ts (que ya cubre a fondo el
 * camino de LECTURA: findAll/findOne) con el camino de ESCRITURA
 * (updateEstado, remove), usando el mismo enfoque: las tres capas reales
 * (TasksService + TasksAuthorizationService + TasksContextService) contra un
 * Prisma simulado en memoria, sin bootstrapear Nest (el repo evita
 * Test.createTestingModule()/Supertest por el cuelgue documentado en
 * password-recovery-admin.e2e.spec.ts). La matriz interna de reglas ya está
 * cubierta exhaustivamente por tasks-authorization.service.spec.ts (59
 * combinaciones); aquí el objetivo es probar el ataque de punta a punta:
 * un atacante que manipula projectId/taskId en la URL no debe poder leer NI
 * escribir una tarea ajena, y el intento fallido no debe dejar ningún efecto
 * secundario (sin llamadas a tarea.update).
 */

function whereMatches(row: any, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => row[key] === value);
}

function makeAttackPrisma(data: { proyectos: any[]; tareas: any[]; participaciones: any[] }) {
  const prisma: any = {
    proyecto: {
      findFirst: vi.fn(async ({ where }: any) => data.proyectos.find((p) => whereMatches(p, where)) ?? null),
    },
    tarea: {
      findFirst: vi.fn(async ({ where }: any) => data.tareas.find((t) => whereMatches(t, where)) ?? null),
      findMany: vi.fn(async ({ where }: any) => data.tareas.filter((t) => whereMatches(t, where))),
      update: vi.fn(async ({ where, data: upd }: any) => {
        const row = data.tareas.find((t) => t.idTarea === where.idTarea);
        if (row) Object.assign(row, upd);
        return row;
      }),
    },
    participacionProyecto: {
      findFirst: vi.fn(
        async ({ where }: any) => data.participaciones.find((p) => whereMatches(p, where)) ?? null,
      ),
    },
    asignacionTarea: {
      findFirst: vi.fn(async () => null),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
  };
  prisma.$transaction = vi.fn(async (cb: (tx: any) => unknown) => cb(prisma));
  return prisma;
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
    eliminadoEn: null,
    hito: null,
    rolProyecto: null,
    asignaciones: [],
    etiquetas: [],
    _count: { comentarios: 0 },
    ...overrides,
  };
}

function makeService(prisma: any) {
  const context = new TasksContextService(prisma);
  const authorization = new TasksAuthorizationService(context);
  const relations = {} as any; // no la usan updateEstado ni remove
  const notifications = { notifyRoleMembers: vi.fn(), notifyUsers: vi.fn() } as any;
  return new TasksService(prisma, authorization, relations, notifications, context);
}

describe('IDOR — GET /proyectos/:projectId/tareas (listado ajeno)', () => {
  const LIDER_A = 100;
  const ATACANTE = 999;
  const PROYECTO_A = { idProyecto: 1, creadoPor: LIDER_A, eliminadoEn: null };

  it('un atacante sin participación en el proyecto no puede listar sus tareas (403, sin consultar tarea.findMany)', async () => {
    const prisma = makeAttackPrisma({
      proyectos: [PROYECTO_A],
      tareas: [tareaRow({ idTarea: 1, idProyecto: 1, tituloTarea: 'Confidencial A' })],
      participaciones: [],
    });
    const service = makeService(prisma);

    await expect(service.findAll(1, ATACANTE)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.tarea.findMany).not.toHaveBeenCalled();
  });

  it('iterar projectId secuencialmente (enumeración 1..N) nunca devuelve tareas de un proyecto ajeno', async () => {
    const PROYECTO_B = { idProyecto: 2, creadoPor: 200, eliminadoEn: null };
    const prisma = makeAttackPrisma({
      proyectos: [PROYECTO_A, PROYECTO_B],
      tareas: [
        tareaRow({ idTarea: 10, idProyecto: 1, tituloTarea: 'De A' }),
        tareaRow({ idTarea: 20, idProyecto: 2, tituloTarea: 'Secreta de B' }),
      ],
      participaciones: [],
    });
    const service = makeService(prisma);

    for (const projectId of [1, 2, 3, 4, 5]) {
      let caught: any;
      try {
        await service.findAll(projectId, ATACANTE);
        throw new Error(`no debía resolver para projectId=${projectId}`);
      } catch (e) {
        caught = e;
      }
      expect(caught instanceof ForbiddenException || caught instanceof NotFoundException).toBe(true);
      expect(prisma.tarea.findMany).not.toHaveBeenCalled();
    }
  });
});

describe('IDOR — PATCH /proyectos/:projectId/tareas/:taskId/estado (escritura ajena)', () => {
  const LIDER_A = 100;
  const LIDER_B = 200;
  const ASIGNADO_B = 300;
  const ATACANTE = 999;
  const PROYECTO_A = { idProyecto: 1, creadoPor: LIDER_A, eliminadoEn: null };
  const PROYECTO_B = { idProyecto: 2, creadoPor: LIDER_B, eliminadoEn: null };

  it('un usuario externo no puede cambiar el estado de una tarea de otro proyecto (403) y no se escribe nada', async () => {
    const tareaDeB = tareaRow({ idTarea: 50, idProyecto: 2, estadoTarea: 'POR_HACER' });
    const prisma = makeAttackPrisma({
      proyectos: [PROYECTO_A, PROYECTO_B],
      tareas: [tareaDeB],
      participaciones: [],
    });
    const service = makeService(prisma);

    await expect(
      service.updateEstado(2, 50, ATACANTE, { estadoTarea: 'HECHA' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.tarea.update).not.toHaveBeenCalled();
    expect(tareaDeB.estadoTarea).toBe('POR_HACER');
  });

  it('solicitar el taskId real bajo un projectId equivocado (URL manipulada) responde 404, no filtra ni escribe', async () => {
    const tareaDeB = tareaRow({ idTarea: 51, idProyecto: 2, tituloTarea: 'Oculta', estadoTarea: 'POR_HACER' });
    const prisma = makeAttackPrisma({
      proyectos: [PROYECTO_A, PROYECTO_B],
      tareas: [tareaDeB],
      participaciones: [],
    });
    const service = makeService(prisma);

    let caught: any;
    try {
      // El atacante es líder legítimo del proyecto 1, pero prueba el taskId
      // 51 (real, pero de otro proyecto) contra su propio projectId.
      await service.updateEstado(1, 51, LIDER_A, { estadoTarea: 'HECHA' } as any);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(NotFoundException);
    const serialized = JSON.stringify(caught.getResponse ? caught.getResponse() : caught.message);
    expect(serialized).not.toContain('Oculta');
    expect(prisma.tarea.update).not.toHaveBeenCalled();
    expect(tareaDeB.estadoTarea).toBe('POR_HACER');
  });

  it('un asignado activo de OTRO proyecto no hereda ese privilegio sobre una tarea de un proyecto donde no participa', async () => {
    const tareaDeA = tareaRow({ idTarea: 60, idProyecto: 1, estadoTarea: 'POR_HACER' });
    const prisma = makeAttackPrisma({
      proyectos: [PROYECTO_A, PROYECTO_B],
      tareas: [tareaDeA],
      participaciones: [],
    });
    const service = makeService(prisma);

    // ASIGNADO_B está asignado a tareas del proyecto 2, pero intenta cambiar
    // el estado de una tarea del proyecto 1.
    await expect(
      service.updateEstado(1, 60, ASIGNADO_B, { estadoTarea: 'HECHA' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.tarea.update).not.toHaveBeenCalled();
  });

  it('camino positivo de control: el líder real sí puede cambiar el estado de su propia tarea', async () => {
    const tareaDeA = tareaRow({ idTarea: 61, idProyecto: 1, estadoTarea: 'POR_HACER' });
    const prisma = makeAttackPrisma({
      proyectos: [PROYECTO_A],
      tareas: [tareaDeA],
      participaciones: [],
    });
    const service = makeService(prisma);

    const resultado = await service.updateEstado(1, 61, LIDER_A, { estadoTarea: 'HECHA' } as any);

    expect(resultado.estadoTarea).toBe('HECHA');
    expect(prisma.tarea.update).toHaveBeenCalledTimes(1);
  });
});

describe('IDOR — DELETE /proyectos/:projectId/tareas/:taskId (eliminación ajena)', () => {
  const LIDER_A = 100;
  const LIDER_B = 200;
  const PARTICIPANTE_A = 150;
  const PROYECTO_A = { idProyecto: 1, creadoPor: LIDER_A, eliminadoEn: null };
  const PROYECTO_B = { idProyecto: 2, creadoPor: LIDER_B, eliminadoEn: null };

  it('un participante activo (no líder) no puede eliminar una tarea de su propio proyecto (403)', async () => {
    const tarea = tareaRow({ idTarea: 70, idProyecto: 1, eliminadoEn: null });
    const prisma = makeAttackPrisma({
      proyectos: [PROYECTO_A],
      tareas: [tarea],
      participaciones: [
        { idParticipacion: 1, idUsuario: PARTICIPANTE_A, estadoParticipacion: 'ACTIVO', idProyecto: 1 },
      ],
    });
    const service = makeService(prisma);

    await expect(service.remove(1, 70, PARTICIPANTE_A)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.tarea.update).not.toHaveBeenCalled();
    expect(tarea.eliminadoEn).toBeNull();
  });

  it('referenciar un taskId real bajo el projectId de OTRO proyecto (URL manipulada) responde 404, no revela su existencia ni la borra', async () => {
    const tareaDeA = tareaRow({ idTarea: 71, idProyecto: 1, tituloTarea: 'Solo de A', eliminadoEn: null });
    const prisma = makeAttackPrisma({
      proyectos: [PROYECTO_A, PROYECTO_B],
      tareas: [tareaDeA],
      participaciones: [],
    });
    const service = makeService(prisma);

    // LIDER_B es líder legítimo del proyecto 2, pero la tarea 71 pertenece
    // al proyecto 1: intenta borrarla pasando projectId=2 en la URL.
    let caught: any;
    try {
      await service.remove(2, 71, LIDER_B);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(NotFoundException);
    const serialized = JSON.stringify(caught.getResponse ? caught.getResponse() : caught.message);
    expect(serialized).not.toContain('Solo de A');
    expect(prisma.tarea.update).not.toHaveBeenCalled();
    expect(tareaDeA.eliminadoEn).toBeNull();
  });
});
