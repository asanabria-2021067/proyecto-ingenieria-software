import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { TasksService } from '../src/tasks/tasks.service';
import { TasksContextService } from '../src/tasks/tasks-context.service';
import { TasksAuthorizationService } from '../src/tasks/tasks-authorization.service';
import { TasksRelationsService } from '../src/tasks/tasks-relations.service';

/**
 * A diferencia de tasks-update.service.spec.ts (que mockea
 * TasksAuthorizationService/TasksRelationsService/TasksContextService), esta
 * suite conecta TasksService a las implementaciones REALES de esos tres
 * servicios y solo falsea la capa de Prisma con un almacén en memoria. El
 * objetivo es verificar los mensajes y códigos de estado que produce el
 * negocio real (no los que un mock decida devolver), sin tocar los archivos
 * protegidos de la Tarea 20.
 */

const PROJECT_ID = 5;
const OTHER_PROJECT_ID = 9;
const LEADER_ID = 2;
const TASK_ID = 42;
const ASSIGNEE_ID = 3;
const ROL_ACTUAL = 6; // Fullstack, proyecto 5
const ROL_NUEVO = 7; // QA, proyecto 5
const ROL_OTRO_PROYECTO = 8; // pertenece al proyecto 9
const FECHA_ASIGNACION = new Date('2026-01-01T00:00:00.000Z');
const FECHA_CREACION = new Date('2025-12-01T00:00:00.000Z');

interface Fixture {
  proyectos: { idProyecto: number; creadoPor: number; eliminadoEn: null }[];
  roles: { idRolProyecto: number; idProyecto: number; nombreRol: string }[];
  usuarios: { idUsuario: number; nombre: string; apellido: string; fotoUrl: null }[];
  participaciones: {
    idParticipacion: number;
    idUsuario: number;
    idRolProyecto: number;
    estadoParticipacion: string;
  }[];
  tareas: {
    idTarea: number;
    idProyecto: number;
    idHito: number | null;
    idRolProyecto: number | null;
    tituloTarea: string;
    descripcionTarea: string | null;
    estadoTarea: string;
    prioridad: string;
    creadaPor: number;
    fechaCreacion: Date;
    fechaLimite: Date | null;
    actualizadaEn: Date | null;
    tiempoEstimadoHoras: number | null;
    horasReales: number | null;
    eliminadoEn: null;
  }[];
  asignaciones: {
    idAsignacion: number;
    idTarea: number;
    idUsuario: number;
    fechaAsignacion: Date;
    desasignadaEn: Date | null;
    asignadoPor: number;
  }[];
  etiquetas: { idEtiqueta: number; idProyecto: number; nombreEtiqueta: string; nombreNormalizado: string; color: string }[];
  tareaEtiquetas: { idTarea: number; idEtiqueta: number }[];
}

function baseFixture(): Fixture {
  return {
    proyectos: [{ idProyecto: PROJECT_ID, creadoPor: LEADER_ID, eliminadoEn: null }],
    roles: [
      { idRolProyecto: ROL_ACTUAL, idProyecto: PROJECT_ID, nombreRol: 'Fullstack' },
      { idRolProyecto: ROL_NUEVO, idProyecto: PROJECT_ID, nombreRol: 'QA' },
      { idRolProyecto: ROL_OTRO_PROYECTO, idProyecto: OTHER_PROJECT_ID, nombreRol: 'Otro' },
    ],
    usuarios: [
      { idUsuario: LEADER_ID, nombre: 'Carlos', apellido: 'Mendoza', fotoUrl: null },
      { idUsuario: ASSIGNEE_ID, nombre: 'Ana', apellido: 'García', fotoUrl: null },
    ],
    participaciones: [],
    tareas: [
      {
        idTarea: TASK_ID,
        idProyecto: PROJECT_ID,
        idHito: null,
        idRolProyecto: ROL_ACTUAL,
        tituloTarea: 'Original',
        descripcionTarea: null,
        estadoTarea: 'POR_HACER',
        prioridad: 'MEDIA',
        creadaPor: LEADER_ID,
        fechaCreacion: FECHA_CREACION,
        fechaLimite: null,
        actualizadaEn: null,
        tiempoEstimadoHoras: null,
        horasReales: null,
        eliminadoEn: null,
      },
    ],
    asignaciones: [
      {
        idAsignacion: 1,
        idTarea: TASK_ID,
        idUsuario: ASSIGNEE_ID,
        fechaAsignacion: FECHA_ASIGNACION,
        desasignadaEn: null,
        asignadoPor: LEADER_ID,
      },
    ],
    etiquetas: [
      { idEtiqueta: 2, idProyecto: PROJECT_ID, nombreEtiqueta: 'a', nombreNormalizado: 'a', color: '#111111' },
      { idEtiqueta: 3, idProyecto: PROJECT_ID, nombreEtiqueta: 'b', nombreNormalizado: 'b', color: '#222222' },
    ],
    tareaEtiquetas: [{ idTarea: TASK_ID, idEtiqueta: 2 }],
  };
}

function buildTaskSelectShape(row: Fixture['tareas'][number], state: Fixture) {
  const rol = row.idRolProyecto ? state.roles.find((r) => r.idRolProyecto === row.idRolProyecto) : null;
  const asignacionesActivas = state.asignaciones
    .filter((a) => a.idTarea === row.idTarea && a.desasignadaEn === null)
    .map((a) => ({
      idAsignacion: a.idAsignacion,
      idUsuario: a.idUsuario,
      fechaAsignacion: a.fechaAsignacion,
      usuario: state.usuarios.find((u) => u.idUsuario === a.idUsuario)!,
    }));
  const etiquetas = state.tareaEtiquetas
    .filter((te) => te.idTarea === row.idTarea)
    .map((te) => ({ etiqueta: state.etiquetas.find((e) => e.idEtiqueta === te.idEtiqueta)! }));

  return {
    idTarea: row.idTarea,
    idProyecto: row.idProyecto,
    idHito: row.idHito,
    idRolProyecto: row.idRolProyecto,
    tituloTarea: row.tituloTarea,
    descripcionTarea: row.descripcionTarea,
    estadoTarea: row.estadoTarea,
    prioridad: row.prioridad,
    creadaPor: row.creadaPor,
    fechaCreacion: row.fechaCreacion,
    fechaLimite: row.fechaLimite,
    actualizadaEn: row.actualizadaEn,
    tiempoEstimadoHoras: row.tiempoEstimadoHoras,
    horasReales: row.horasReales ?? null,
    hito: null,
    rolProyecto: rol ? { idRolProyecto: rol.idRolProyecto, nombreRol: rol.nombreRol } : null,
    asignaciones: asignacionesActivas,
    etiquetas,
    _count: { comentarios: 0 },
  };
}

function makeFakeDb(state: Fixture) {
  const asignacionTareaEscrituraProhibida = {
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    findFirst: vi.fn(async ({ where }: any) =>
      state.asignaciones.find(
        (a) =>
          a.idTarea === where.idTarea &&
          (where.desasignadaEn === undefined || a.desasignadaEn === where.desasignadaEn),
      ) ?? null,
    ),
  };

  const db: any = {
    proyecto: {
      findFirst: vi.fn(async ({ where }: any) =>
        state.proyectos.find(
          (p) => p.idProyecto === where.idProyecto && (where.eliminadoEn === undefined || p.eliminadoEn === where.eliminadoEn),
        ) ?? null,
      ),
    },
    tarea: {
      findFirst: vi.fn(async ({ where, select }: any) => {
        const row = state.tareas.find(
          (t) =>
            t.idTarea === where.idTarea &&
            (where.idProyecto === undefined || t.idProyecto === where.idProyecto) &&
            (where.eliminadoEn === undefined || t.eliminadoEn === where.eliminadoEn),
        );
        if (!row) return null;
        return select ? buildTaskSelectShape(row, state) : row;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = state.tareas.find((t) => t.idTarea === where.idTarea)!;
        Object.assign(row, data);
        return row;
      }),
    },
    rolProyecto: {
      findUnique: vi.fn(async ({ where }: any) => state.roles.find((r) => r.idRolProyecto === where.idRolProyecto) ?? null),
    },
    usuario: {
      findUnique: vi.fn(async ({ where }: any) => state.usuarios.find((u) => u.idUsuario === where.idUsuario) ?? null),
    },
    participacionProyecto: {
      findFirst: vi.fn(async ({ where }: any) => {
        return (
          state.participaciones.find((p) => {
            if (p.idUsuario !== where.idUsuario) return false;
            if (where.idRolProyecto !== undefined && p.idRolProyecto !== where.idRolProyecto) return false;
            if (where.estadoParticipacion !== undefined && p.estadoParticipacion !== where.estadoParticipacion) {
              return false;
            }
            if (where.rolProyecto?.idProyecto !== undefined) {
              const rol = state.roles.find((r) => r.idRolProyecto === p.idRolProyecto);
              if (!rol || rol.idProyecto !== where.rolProyecto.idProyecto) return false;
            }
            return true;
          }) ?? null
        );
      }),
    },
    etiqueta: {
      findMany: vi.fn(async ({ where }: any) =>
        state.etiquetas.filter((e) => (where.idEtiqueta.in as number[]).includes(e.idEtiqueta)),
      ),
    },
    tareaEtiqueta: {
      deleteMany: vi.fn(async ({ where }: any) => {
        state.tareaEtiquetas = state.tareaEtiquetas.filter((te) => te.idTarea !== where.idTarea);
      }),
      createMany: vi.fn(async ({ data }: any) => {
        state.tareaEtiquetas.push(...data);
      }),
    },
    asignacionTarea: asignacionTareaEscrituraProhibida,
  };

  db.$transaction = vi.fn(async (callback: any) => callback(db));

  return db;
}

function makeService(state: Fixture) {
  const db = makeFakeDb(state);
  const tasksContext = new TasksContextService(db);
  const tasksAuthorization = new TasksAuthorizationService(tasksContext);
  const tasksRelations = new TasksRelationsService(db, tasksContext);
  const notifications = {} as any;
  const service = new TasksService(db, tasksAuthorization, tasksRelations, notifications, tasksContext);
  return { db, service };
}

function expectNoAssignmentWrites(db: any) {
  expect(db.asignacionTarea.create).not.toHaveBeenCalled();
  expect(db.asignacionTarea.update).not.toHaveBeenCalled();
  expect(db.asignacionTarea.updateMany).not.toHaveBeenCalled();
  expect(db.asignacionTarea.delete).not.toHaveBeenCalled();
  expect(db.asignacionTarea.deleteMany).not.toHaveBeenCalled();
}

describe('Compatibilidad real del asignado activo al cambiar idRolProyecto (Tarea 20)', () => {
  describe('nuevo rol numérico', () => {
    it('asignado activo y compatible con el rol nuevo: permitido, la tarea se actualiza', async () => {
      const fixture = baseFixture();
      fixture.participaciones.push({
        idParticipacion: 1,
        idUsuario: ASSIGNEE_ID,
        idRolProyecto: ROL_NUEVO,
        estadoParticipacion: 'ACTIVO',
      });
      const { db, service } = makeService(fixture);

      const resultado = await service.update(PROJECT_ID, TASK_ID, LEADER_ID, {
        idRolProyecto: ROL_NUEVO,
      } as any);

      expect(resultado.idRolProyecto).toBe(ROL_NUEVO);
      expect(fixture.asignaciones[0]).toEqual({
        idAsignacion: 1,
        idTarea: TASK_ID,
        idUsuario: ASSIGNEE_ID,
        fechaAsignacion: FECHA_ASIGNACION,
        desasignadaEn: null,
        asignadoPor: LEADER_ID,
      });
      expectNoAssignmentWrites(db);
    });

    it('asignado activo en otro rol del mismo proyecto: 400, mensaje real de TasksRelationsService', async () => {
      const fixture = baseFixture();
      fixture.participaciones.push({
        idParticipacion: 1,
        idUsuario: ASSIGNEE_ID,
        idRolProyecto: ROL_ACTUAL,
        estadoParticipacion: 'ACTIVO',
      });
      const { db, service } = makeService(fixture);

      try {
        await service.update(PROJECT_ID, TASK_ID, LEADER_ID, { idRolProyecto: ROL_NUEVO } as any);
        throw new Error('no debía resolver');
      } catch (e: any) {
        expect(e).toBeInstanceOf(BadRequestException);
        expect(e).not.toBeInstanceOf(ConflictException);
        expect(e.getStatus()).toBe(400);
        expect(e.message).toBe('El usuario no tiene una participación activa en el rol de la tarea');
      }
      expect(fixture.tareas[0].idRolProyecto).toBe(ROL_ACTUAL);
      expect(db.tarea.update).not.toHaveBeenCalled();
      expectNoAssignmentWrites(db);
    });

    it('asignado con participación inactiva en el rol nuevo: 400', async () => {
      const fixture = baseFixture();
      fixture.participaciones.push({
        idParticipacion: 1,
        idUsuario: ASSIGNEE_ID,
        idRolProyecto: ROL_NUEVO,
        estadoParticipacion: 'INACTIVO',
      });
      const { db, service } = makeService(fixture);

      try {
        await service.update(PROJECT_ID, TASK_ID, LEADER_ID, { idRolProyecto: ROL_NUEVO } as any);
        throw new Error('no debía resolver');
      } catch (e: any) {
        expect(e).toBeInstanceOf(BadRequestException);
        expect(e.getStatus()).toBe(400);
      }
      expect(db.tarea.update).not.toHaveBeenCalled();
    });

    it('asignado activo únicamente en un rol de otro proyecto: 400', async () => {
      const fixture = baseFixture();
      fixture.participaciones.push({
        idParticipacion: 1,
        idUsuario: ASSIGNEE_ID,
        idRolProyecto: ROL_OTRO_PROYECTO,
        estadoParticipacion: 'ACTIVO',
      });
      const { db, service } = makeService(fixture);

      await expect(
        service.update(PROJECT_ID, TASK_ID, LEADER_ID, { idRolProyecto: ROL_NUEVO } as any),
      ).rejects.toMatchObject({ status: 400 });
      expect(db.tarea.update).not.toHaveBeenCalled();
    });

    it('líder asignado a la tarea pero sin ninguna participación en el nuevo rol: 400', async () => {
      const fixture = baseFixture();
      fixture.asignaciones[0].idUsuario = LEADER_ID; // el líder es el asignado activo
      // Sin filas de participación para el líder: assertUserAssignableToProject no lo exime.
      const { db, service } = makeService(fixture);

      await expect(
        service.update(PROJECT_ID, TASK_ID, LEADER_ID, { idRolProyecto: ROL_NUEVO } as any),
      ).rejects.toMatchObject({ status: 400 });
      expect(db.tarea.update).not.toHaveBeenCalled();
    });

    it('rol inexistente: conserva NotFoundException (404), no consulta la asignación', async () => {
      const fixture = baseFixture();
      const { db, service } = makeService(fixture);

      try {
        await service.update(PROJECT_ID, TASK_ID, LEADER_ID, { idRolProyecto: 999 } as any);
        throw new Error('no debía resolver');
      } catch (e: any) {
        expect(e).toBeInstanceOf(NotFoundException);
        expect(e.getStatus()).toBe(404);
      }
      expect(db.asignacionTarea.findFirst).not.toHaveBeenCalled();
      expect(db.tarea.update).not.toHaveBeenCalled();
    });

    it('rol de otro proyecto: conserva BadRequestException (400), no consulta la asignación', async () => {
      const fixture = baseFixture();
      const { db, service } = makeService(fixture);

      try {
        await service.update(PROJECT_ID, TASK_ID, LEADER_ID, { idRolProyecto: ROL_OTRO_PROYECTO } as any);
        throw new Error('no debía resolver');
      } catch (e: any) {
        expect(e).toBeInstanceOf(BadRequestException);
        expect(e.getStatus()).toBe(400);
        expect(e.message).toContain('pertenece a otro proyecto');
      }
      expect(db.asignacionTarea.findFirst).not.toHaveBeenCalled();
      expect(db.tarea.update).not.toHaveBeenCalled();
    });
  });

  describe('retiro del rol (idRolProyecto: null)', () => {
    it('asignado con participación activa en cualquier rol del proyecto: permitido', async () => {
      const fixture = baseFixture();
      fixture.participaciones.push({
        idParticipacion: 1,
        idUsuario: ASSIGNEE_ID,
        idRolProyecto: ROL_ACTUAL,
        estadoParticipacion: 'ACTIVO',
      });
      const { db, service } = makeService(fixture);

      const resultado = await service.update(PROJECT_ID, TASK_ID, LEADER_ID, {
        idRolProyecto: null,
      } as any);

      expect(resultado.idRolProyecto).toBeNull();
      expect(fixture.asignaciones[0]).toEqual({
        idAsignacion: 1,
        idTarea: TASK_ID,
        idUsuario: ASSIGNEE_ID,
        fechaAsignacion: FECHA_ASIGNACION,
        desasignadaEn: null,
        asignadoPor: LEADER_ID,
      });
      expectNoAssignmentWrites(db);
    });

    it('asignado sin ninguna participación activa: 400, mensaje de proyecto', async () => {
      const fixture = baseFixture();
      fixture.participaciones.push({
        idParticipacion: 1,
        idUsuario: ASSIGNEE_ID,
        idRolProyecto: ROL_ACTUAL,
        estadoParticipacion: 'INACTIVO',
      });
      const { db, service } = makeService(fixture);

      try {
        await service.update(PROJECT_ID, TASK_ID, LEADER_ID, { idRolProyecto: null } as any);
        throw new Error('no debía resolver');
      } catch (e: any) {
        expect(e).toBeInstanceOf(BadRequestException);
        expect(e.getStatus()).toBe(400);
        expect(e.message).toBe('El usuario no tiene una participación activa en el proyecto');
      }
      expect(db.tarea.update).not.toHaveBeenCalled();
    });

    it('asignado activo únicamente en otro proyecto: 400', async () => {
      const fixture = baseFixture();
      fixture.participaciones.push({
        idParticipacion: 1,
        idUsuario: ASSIGNEE_ID,
        idRolProyecto: ROL_OTRO_PROYECTO,
        estadoParticipacion: 'ACTIVO',
      });
      const { db, service } = makeService(fixture);

      await expect(
        service.update(PROJECT_ID, TASK_ID, LEADER_ID, { idRolProyecto: null } as any),
      ).rejects.toMatchObject({ status: 400 });
      expect(db.tarea.update).not.toHaveBeenCalled();
    });
  });

  describe('otros casos', () => {
    it('idRolProyecto omitido: no consulta la asignación activa, edita otros campos sin tocarla', async () => {
      const fixture = baseFixture();
      const { db, service } = makeService(fixture);

      const resultado = await service.update(PROJECT_ID, TASK_ID, LEADER_ID, {
        tituloTarea: 'Nuevo título',
      } as any);

      expect(resultado.tituloTarea).toBe('Nuevo título');
      expect(resultado.idRolProyecto).toBe(ROL_ACTUAL);
      expect(db.asignacionTarea.findFirst).not.toHaveBeenCalled();
    });

    it('tarea sin asignación activa: permite el cambio de rol sin validar compatibilidad', async () => {
      const fixture = baseFixture();
      fixture.asignaciones = [];
      const { db, service } = makeService(fixture);

      const resultado = await service.update(PROJECT_ID, TASK_ID, LEADER_ID, {
        idRolProyecto: ROL_NUEVO,
      } as any);

      expect(resultado.idRolProyecto).toBe(ROL_NUEVO);
      expect(db.participacionProyecto.findFirst).not.toHaveBeenCalled();
    });

    it('la consulta de asignación activa y la validación de participación ocurren dentro de $transaction (mismo cliente)', async () => {
      const fixture = baseFixture();
      fixture.participaciones.push({
        idParticipacion: 1,
        idUsuario: ASSIGNEE_ID,
        idRolProyecto: ROL_NUEVO,
        estadoParticipacion: 'ACTIVO',
      });
      const { db, service } = makeService(fixture);

      await service.update(PROJECT_ID, TASK_ID, LEADER_ID, { idRolProyecto: ROL_NUEVO } as any);

      expect(db.$transaction).toHaveBeenCalledTimes(1);
      expect(db.asignacionTarea.findFirst).toHaveBeenCalledTimes(1);
      expect(db.participacionProyecto.findFirst).toHaveBeenCalledTimes(1);
    });

    it('la compatibilidad se valida antes de cualquier escritura: rechazo no llama tarea.update ni tareaEtiqueta', async () => {
      const fixture = baseFixture();
      fixture.participaciones.push({
        idParticipacion: 1,
        idUsuario: ASSIGNEE_ID,
        idRolProyecto: ROL_ACTUAL,
        estadoParticipacion: 'ACTIVO',
      });
      const { db, service } = makeService(fixture);

      await expect(
        service.update(PROJECT_ID, TASK_ID, LEADER_ID, {
          idRolProyecto: ROL_NUEVO,
          idsEtiquetas: [3],
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(db.tarea.update).not.toHaveBeenCalled();
      expect(db.tareaEtiqueta.deleteMany).not.toHaveBeenCalled();
      expect(db.tareaEtiqueta.createMany).not.toHaveBeenCalled();
    });

    it('payload combinado (título + rol + etiquetas) con asignado incompatible: revierte todo, 400, sin cambios parciales', async () => {
      const fixture = baseFixture();
      fixture.participaciones.push({
        idParticipacion: 1,
        idUsuario: ASSIGNEE_ID,
        idRolProyecto: ROL_ACTUAL,
        estadoParticipacion: 'ACTIVO',
      });
      const estadoOriginal = { ...fixture.tareas[0] };
      const etiquetasOriginales = fixture.tareaEtiquetas.map((te) => ({ ...te }));
      const asignacionOriginal = { ...fixture.asignaciones[0] };
      const { db, service } = makeService(fixture);

      try {
        await service.update(PROJECT_ID, TASK_ID, LEADER_ID, {
          tituloTarea: 'Título que no debe persistir',
          idRolProyecto: ROL_NUEVO,
          idsEtiquetas: [2, 3],
        } as any);
        throw new Error('no debía resolver');
      } catch (e: any) {
        expect(e).toBeInstanceOf(BadRequestException);
        expect(e.getStatus()).toBe(400);
      }

      expect(fixture.tareas[0]).toEqual(estadoOriginal);
      expect(fixture.tareaEtiquetas).toEqual(etiquetasOriginales);
      expect(fixture.asignaciones[0]).toEqual(asignacionOriginal);
      expect(db.tarea.update).not.toHaveBeenCalled();
      expect(db.tareaEtiqueta.deleteMany).not.toHaveBeenCalled();
      expect(db.tareaEtiqueta.createMany).not.toHaveBeenCalled();
      expectNoAssignmentWrites(db);
    });
  });
});
