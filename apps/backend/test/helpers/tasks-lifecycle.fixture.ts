import { vi } from 'vitest';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Prisma } from '@prisma/client';
import { TasksService } from '../../src/tasks/tasks.service';
import { TasksContextService } from '../../src/tasks/tasks-context.service';
import { TasksAuthorizationService } from '../../src/tasks/tasks-authorization.service';
import { TasksRelationsService } from '../../src/tasks/tasks-relations.service';
import { ProjectsService } from '../../src/projects/projects.service';
import { ComentariosService } from '../../src/comentarios/comentarios.service';

/**
 * Fake Prisma estatal y transaccional para la Tarea 27 (suite integral del
 * ciclo de vida del backend de tareas).
 *
 * Deliberadamente NO es un mock sin estado: mantiene tablas en memoria
 * (arrays planos, similares a filas reales) y un `$transaction` que
 * confirma los cambios al resolver y los REVIERTE por completo si el
 * callback lanza — igual que Prisma real — mediante una instantánea
 * (`structuredClone`) tomada antes de ejecutar el callback. `tx` es
 * siempre el mismo objeto que `prisma` (no hay un cliente transaccional
 * distinto), lo cual es válido para este fake: todas las escrituras de
 * producción ya pasan `tx` explícitamente a las capas centralizadas
 * (TasksContextService, TasksAuthorizationService, TasksRelationsService),
 * así que este fake nunca necesita distinguir "dentro" de "fuera" de una
 * transacción para decidir qué tabla leer.
 *
 * Ninguna regla de autorización, de asignabilidad, de fórmula de avance o
 * de mapeo de conflictos vive aquí: el fake solo modela persistencia y
 * atomicidad. Todas esas reglas se ejecutan mediante las clases reales de
 * producción (TasksContextService, TasksAuthorizationService,
 * TasksRelationsService, TasksService, ProjectsService, ComentariosService).
 */

// ---------------------------------------------------------------------------
// Tipos de fila (subconjunto de campos realmente usado por los servicios)
// ---------------------------------------------------------------------------

export interface UsuarioRow {
  idUsuario: number;
  nombre: string;
  apellido: string;
  fotoUrl: string | null;
}

export interface ProyectoRow {
  idProyecto: number;
  tituloProyecto: string;
  descripcionProyecto: string;
  tipoProyecto: string;
  estadoProyecto: string;
  modalidadProyecto: string;
  fechaPublicacion: Date | null;
  creadoPor: number;
  fechaCreacion: Date;
  fechaActualizacion: Date | null;
  eliminadoEn: Date | null;
}

export interface RolProyectoRow {
  idRolProyecto: number;
  idProyecto: number;
  nombreRol: string;
}

export interface HitoRow {
  idHito: number;
  idProyecto: number;
  tituloHito: string;
  estadoHito: string;
}

export interface EtiquetaRow {
  idEtiqueta: number;
  idProyecto: number;
  nombreEtiqueta: string;
  nombreNormalizado: string;
  color: string;
}

export interface ParticipacionRow {
  idParticipacion: number;
  idUsuario: number;
  idRolProyecto: number;
  estadoParticipacion: 'ACTIVO' | 'RETIRADO' | 'COMPLETADO';
}

export interface TareaRow {
  idTarea: number;
  idProyecto: number;
  idHito: number | null;
  idRolProyecto: number | null;
  tituloTarea: string;
  descripcionTarea: string | null;
  estadoTarea: string;
  prioridad: string;
  tiempoEstimadoHoras: number | null;
  creadaPor: number;
  fechaCreacion: Date;
  fechaLimite: Date | null;
  actualizadaEn: Date | null;
  eliminadoEn: Date | null;
}

export interface AsignacionRow {
  idAsignacion: number;
  idTarea: number;
  idUsuario: number;
  fechaAsignacion: Date;
  desasignadaEn: Date | null;
  asignadoPor: number;
}

export interface TareaEtiquetaRow {
  idTarea: number;
  idEtiqueta: number;
}

export interface ComentarioRow {
  idComentario: number;
  idAutor: number;
  contenido: string;
  idProyecto: number | null;
  idTarea: number | null;
  idHito: number | null;
  creadoEn: Date;
  editadoEn: Date | null;
  eliminadoEn: Date | null;
}

export interface EvidenciaRow {
  idEvidencia: number;
  idTarea: number;
  idUsuarioCargador: number;
  tipoEvidencia: string;
  urlRecurso: string;
  fechaEnvio: Date;
}

export interface FixtureState {
  usuarios: UsuarioRow[];
  proyectos: ProyectoRow[];
  roles: RolProyectoRow[];
  hitos: HitoRow[];
  etiquetas: EtiquetaRow[];
  participaciones: ParticipacionRow[];
  tareas: TareaRow[];
  asignaciones: AsignacionRow[];
  tareaEtiquetas: TareaEtiquetaRow[];
  comentarios: ComentarioRow[];
  evidencias: EvidenciaRow[];
  nextId: Record<string, number>;
}

// ---------------------------------------------------------------------------
// IDs deterministas del fixture (Proyecto A / Proyecto B)
// ---------------------------------------------------------------------------

export const FIXTURE_IDS = {
  usuarios: {
    liderA: 1,
    a1: 2,
    a2: 3,
    a3Diseno: 4,
    inactivoA: 5,
    externo: 6,
    liderB: 7,
    participanteB: 8,
  },
  proyectos: { A: 1, B: 2 },
  roles: { desarrolloA: 10, disenoA: 11, desarrolloB: 20 },
  hitos: { A: 100, B: 200 },
  etiquetas: { aUrgente: 1000, aBackend: 1001, bOtra: 2000 },
} as const;

function nextId(state: FixtureState, table: string): number {
  const current = state.nextId[table] ?? 1;
  state.nextId[table] = current + 1;
  return current;
}

/** Fecha futura estable usada en todo el fixture (el validador del DTO exige un día posterior al actual). */
export const FECHA_FUTURA = '2027-06-15';

export function createFixtureState(): FixtureState {
  const { usuarios: U, proyectos: P, roles: R, hitos: H, etiquetas: E } = FIXTURE_IDS;

  return {
    usuarios: [
      { idUsuario: U.liderA, nombre: 'Ana', apellido: 'Líder', fotoUrl: null },
      { idUsuario: U.a1, nombre: 'Beto', apellido: 'Desarrollo1', fotoUrl: null },
      { idUsuario: U.a2, nombre: 'Carla', apellido: 'Desarrollo2', fotoUrl: null },
      { idUsuario: U.a3Diseno, nombre: 'Dario', apellido: 'Diseno', fotoUrl: null },
      { idUsuario: U.inactivoA, nombre: 'Elena', apellido: 'Retirada', fotoUrl: null },
      { idUsuario: U.externo, nombre: 'Fabio', apellido: 'Externo', fotoUrl: null },
      { idUsuario: U.liderB, nombre: 'Gina', apellido: 'LiderB', fotoUrl: null },
      { idUsuario: U.participanteB, nombre: 'Hugo', apellido: 'ParticipanteB', fotoUrl: null },
    ],
    proyectos: [
      {
        idProyecto: P.A,
        tituloProyecto: 'Proyecto A',
        descripcionProyecto: 'Proyecto A de la suite integral',
        tipoProyecto: 'ACADEMICO_HORAS_BECA',
        estadoProyecto: 'EN_PROGRESO',
        modalidadProyecto: 'MIXTA',
        fechaPublicacion: null,
        creadoPor: U.liderA,
        fechaCreacion: new Date('2026-01-01T00:00:00.000Z'),
        fechaActualizacion: null,
        eliminadoEn: null,
      },
      {
        idProyecto: P.B,
        tituloProyecto: 'Proyecto B',
        descripcionProyecto: 'Proyecto B de la suite integral (relaciones cruzadas)',
        tipoProyecto: 'ACADEMICO_HORAS_BECA',
        estadoProyecto: 'EN_PROGRESO',
        modalidadProyecto: 'MIXTA',
        fechaPublicacion: null,
        creadoPor: U.liderB,
        fechaCreacion: new Date('2026-01-01T00:00:00.000Z'),
        fechaActualizacion: null,
        eliminadoEn: null,
      },
    ],
    roles: [
      { idRolProyecto: R.desarrolloA, idProyecto: P.A, nombreRol: 'Desarrollo' },
      { idRolProyecto: R.disenoA, idProyecto: P.A, nombreRol: 'Diseño' },
      // Mismo nombre que el rol de Desarrollo de A, pero id y proyecto distintos:
      // detecta cruces de rol si algún código confiara en el nombre.
      { idRolProyecto: R.desarrolloB, idProyecto: P.B, nombreRol: 'Desarrollo' },
    ],
    hitos: [
      { idHito: H.A, idProyecto: P.A, tituloHito: 'Hito A', estadoHito: 'PENDIENTE' },
      { idHito: H.B, idProyecto: P.B, tituloHito: 'Hito B', estadoHito: 'PENDIENTE' },
    ],
    etiquetas: [
      { idEtiqueta: E.aUrgente, idProyecto: P.A, nombreEtiqueta: 'urgente', nombreNormalizado: 'urgente', color: '#EF4444' },
      { idEtiqueta: E.aBackend, idProyecto: P.A, nombreEtiqueta: 'backend', nombreNormalizado: 'backend', color: '#10B981' },
      { idEtiqueta: E.bOtra, idProyecto: P.B, nombreEtiqueta: 'otra', nombreNormalizado: 'otra', color: '#3B82F6' },
    ],
    participaciones: [
      { idParticipacion: 1, idUsuario: U.a1, idRolProyecto: R.desarrolloA, estadoParticipacion: 'ACTIVO' },
      { idParticipacion: 2, idUsuario: U.a2, idRolProyecto: R.desarrolloA, estadoParticipacion: 'ACTIVO' },
      { idParticipacion: 3, idUsuario: U.a3Diseno, idRolProyecto: R.disenoA, estadoParticipacion: 'ACTIVO' },
      { idParticipacion: 4, idUsuario: U.inactivoA, idRolProyecto: R.desarrolloA, estadoParticipacion: 'RETIRADO' },
      { idParticipacion: 5, idUsuario: U.participanteB, idRolProyecto: R.desarrolloB, estadoParticipacion: 'ACTIVO' },
    ],
    tareas: [],
    asignaciones: [],
    tareaEtiquetas: [],
    comentarios: [],
    evidencias: [],
    nextId: {},
  };
}

// ---------------------------------------------------------------------------
// Proyección de selects anidados (TASK_SELECT y los dos selects de Proyecto)
// ---------------------------------------------------------------------------

function buildUsuarioResumen(state: FixtureState, idUsuario: number) {
  const usuario = state.usuarios.find((u) => u.idUsuario === idUsuario)!;
  return {
    idUsuario: usuario.idUsuario,
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    fotoUrl: usuario.fotoUrl,
  };
}

/** Misma forma que TASK_SELECT en tasks.service.ts — debe mantenerse en sincronía si esa constante cambia. */
function buildTareaSelectShape(row: TareaRow, state: FixtureState) {
  const rol = row.idRolProyecto ? state.roles.find((r) => r.idRolProyecto === row.idRolProyecto) ?? null : null;
  const hito = row.idHito ? state.hitos.find((h) => h.idHito === row.idHito) ?? null : null;

  const asignacionesActivas = state.asignaciones
    .filter((a) => a.idTarea === row.idTarea && a.desasignadaEn === null)
    .map((a) => ({
      idAsignacion: a.idAsignacion,
      idUsuario: a.idUsuario,
      fechaAsignacion: a.fechaAsignacion,
      usuario: buildUsuarioResumen(state, a.idUsuario),
    }));

  const etiquetas = state.tareaEtiquetas
    .filter((te) => te.idTarea === row.idTarea)
    .map((te) => {
      const etiqueta = state.etiquetas.find((e) => e.idEtiqueta === te.idEtiqueta)!;
      return {
        etiqueta: {
          idEtiqueta: etiqueta.idEtiqueta,
          nombreEtiqueta: etiqueta.nombreEtiqueta,
          nombreNormalizado: etiqueta.nombreNormalizado,
          color: etiqueta.color,
        },
      };
    });

  const cantidadComentarios = state.comentarios.filter(
    (c) => c.idTarea === row.idTarea && c.eliminadoEn === null,
  ).length;

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
    hito: hito ? { idHito: hito.idHito, tituloHito: hito.tituloHito } : null,
    rolProyecto: rol ? { idRolProyecto: rol.idRolProyecto, nombreRol: rol.nombreRol } : null,
    asignaciones: asignacionesActivas,
    etiquetas,
    _count: { comentarios: cantidadComentarios },
  };
}

/**
 * Cubre a la vez el select de ProjectsService.getAvance (creadoPor, tareas,
 * hitos) y el de ProjectsService.findMine (proyectoListSelect + roles +
 * tareas + hitos + revisiones), distinguiendo por las claves presentes.
 */
function buildProyectoSelectShape(row: ProyectoRow, state: FixtureState, select: Record<string, unknown>) {
  const result: Record<string, unknown> = {};

  for (const key of Object.keys(select)) {
    if (key === '_count') continue;
    const spec = select[key];

    if (spec === true) {
      result[key] = (row as unknown as Record<string, unknown>)[key];
      continue;
    }

    if (key === 'tareas') {
      const tareaSpec = spec as { where?: { eliminadoEn?: null } };
      let tareas = state.tareas.filter((t) => t.idProyecto === row.idProyecto);
      if (tareaSpec?.where?.eliminadoEn === null) {
        tareas = tareas.filter((t) => t.eliminadoEn === null);
      }
      result.tareas = tareas.map((t) => ({ estadoTarea: t.estadoTarea }));
      continue;
    }

    if (key === 'hitos') {
      result.hitos = state.hitos
        .filter((h) => h.idProyecto === row.idProyecto)
        .map((h) => ({ estadoHito: h.estadoHito }));
      continue;
    }

    if (key === 'roles') {
      result.roles = state.roles
        .filter((r) => r.idProyecto === row.idProyecto)
        .map((rol) => ({
          idRolProyecto: rol.idRolProyecto,
          _count: {
            postulaciones: 0,
            participaciones: state.participaciones.filter(
              (p) => p.idRolProyecto === rol.idRolProyecto && p.estadoParticipacion === 'ACTIVO',
            ).length,
          },
        }));
      continue;
    }

    if (key === 'organizaciones' || key === 'intereses' || key === 'revisiones') {
      result[key] = [];
      continue;
    }

    result[key] = (row as unknown as Record<string, unknown>)[key];
  }

  if (select._count) {
    result._count = { roles: state.roles.filter((r) => r.idProyecto === row.idProyecto).length };
  }

  return result;
}

function matchesParticipacionWhere(
  p: ParticipacionRow,
  state: FixtureState,
  where: {
    idUsuario: number;
    idRolProyecto?: number;
    estadoParticipacion?: string;
    rolProyecto?: { idProyecto: number };
  },
): boolean {
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
}

// ---------------------------------------------------------------------------
// Fake Prisma
// ---------------------------------------------------------------------------

export type FakeDb = ReturnType<typeof makeFakeDb>;

interface TxStore {
  undoLog: Array<() => void>;
}

/**
 * `tx` es siempre el mismo objeto que `prisma` en este fake (ver comentario
 * de cabecera): no hay un cliente transaccional distinto que permita
 * distinguir "dentro" de "fuera" de una transacción por identidad de
 * objeto. Para que dos `$transaction` REALMENTE simultáneas (como las
 * pruebas de colisión 409, section 11 y 14 de la Tarea 27) no se pisen la
 * una a la otra al revertir, el rollback no puede ser un snapshot/restore
 * de arrays completos (eso descartaría también los cambios ya comprometidos
 * por la otra transacción concurrente). En su lugar, cada mutación registra
 * su propia función de deshacer en un log ligado al contexto asíncrono de
 * SU llamada a `$transaction` mediante `AsyncLocalStorage`, para que el
 * entrelazado real de dos promesas concurrentes (awaits intercalados) siga
 * atribuyendo cada escritura a la transacción correcta sin importar el
 * orden de ejecución. Los contadores de `nextId` deliberadamente NO se
 * revierten: en PostgreSQL real las secuencias no son transaccionales.
 */
const txStorage = new AsyncLocalStorage<TxStore>();

function recordUndo(fn: () => void): void {
  txStorage.getStore()?.undoLog.push(fn);
}

export function makeFakeDb(state: FixtureState) {
  const pendingFailures = new Map<string, Error | (() => Error)>();

  function maybeFail(path: string): void {
    const failure = pendingFailures.get(path);
    if (failure === undefined) return;
    pendingFailures.delete(path);
    throw typeof failure === 'function' ? failure() : failure;
  }

  const db = {
    /**
     * Programa que la PRÓXIMA llamada a `path` (p.ej. 'tareaEtiqueta.createMany')
     * lance `error` (o un Error genérico si se omite). Se consume una sola vez.
     */
    __failNext(path: string, error?: Error): void {
      pendingFailures.set(path, error ?? new Error(`fallo inducido en ${path} (Tarea 27)`));
    },

    async $transaction<T>(callback: (tx: typeof db) => Promise<T>): Promise<T> {
      const store: TxStore = { undoLog: [] };
      return txStorage.run(store, async () => {
        try {
          return await callback(db);
        } catch (error) {
          for (let i = store.undoLog.length - 1; i >= 0; i--) {
            store.undoLog[i]();
          }
          throw error;
        }
      });
    },

    proyecto: {
      findFirst: vi.fn(async (args: any) => {
        maybeFail('proyecto.findFirst');
        const where = args.where ?? {};
        const row = state.proyectos.find(
          (p) =>
            p.idProyecto === where.idProyecto &&
            (where.eliminadoEn === undefined || p.eliminadoEn === where.eliminadoEn),
        );
        if (!row) return null;
        return args.select ? buildProyectoSelectShape(row, state, args.select) : row;
      }),
      findUnique: vi.fn(async (args: any) => {
        maybeFail('proyecto.findUnique');
        const row = state.proyectos.find((p) => p.idProyecto === args.where.idProyecto);
        if (!row) return null;
        if (!args.select) return row;
        const result: Record<string, unknown> = {};
        for (const key of Object.keys(args.select)) {
          result[key] = (row as unknown as Record<string, unknown>)[key];
        }
        return result;
      }),
      findMany: vi.fn(async (args: any) => {
        maybeFail('proyecto.findMany');
        const where = args.where ?? {};
        const rows = state.proyectos.filter(
          (p) =>
            (where.creadoPor === undefined || p.creadoPor === where.creadoPor) &&
            (where.eliminadoEn === undefined || p.eliminadoEn === where.eliminadoEn),
        );
        return rows.map((row) => (args.select ? buildProyectoSelectShape(row, state, args.select) : row));
      }),
    },

    tarea: {
      findFirst: vi.fn(async (args: any) => {
        maybeFail('tarea.findFirst');
        const where = args.where ?? {};
        const row = state.tareas.find(
          (t) =>
            t.idTarea === where.idTarea &&
            (where.idProyecto === undefined || t.idProyecto === where.idProyecto) &&
            (where.eliminadoEn === undefined || t.eliminadoEn === where.eliminadoEn),
        );
        if (!row) return null;
        return args.select ? buildTareaSelectShape(row, state) : row;
      }),
      findMany: vi.fn(async (args: any) => {
        maybeFail('tarea.findMany');
        const where = args.where ?? {};
        const rows = state.tareas.filter(
          (t) =>
            (where.idProyecto === undefined || t.idProyecto === where.idProyecto) &&
            (where.eliminadoEn === undefined || t.eliminadoEn === where.eliminadoEn),
        );
        return rows.map((row) => (args.select ? buildTareaSelectShape(row, state) : row));
      }),
      create: vi.fn(async (args: any) => {
        maybeFail('tarea.create');
        const row: TareaRow = {
          idTarea: nextId(state, 'tarea'),
          actualizadaEn: null,
          eliminadoEn: null,
          fechaCreacion: new Date(),
          ...args.data,
        };
        state.tareas.push(row);
        recordUndo(() => {
          state.tareas = state.tareas.filter((t) => t !== row);
        });
        return row;
      }),
      update: vi.fn(async (args: any) => {
        maybeFail('tarea.update');
        const row = state.tareas.find((t) => t.idTarea === args.where.idTarea);
        if (!row) throw new Error(`fixture: tarea ${args.where.idTarea} no encontrada`);
        const before = { ...row };
        recordUndo(() => Object.assign(row, before));
        Object.assign(row, args.data);
        return row;
      }),
    },

    asignacionTarea: {
      findFirst: vi.fn(async (args: any) => {
        maybeFail('asignacionTarea.findFirst');
        const where = args.where ?? {};
        return (
          state.asignaciones.find(
            (a) =>
              a.idTarea === where.idTarea &&
              (where.desasignadaEn === undefined || a.desasignadaEn === where.desasignadaEn),
          ) ?? null
        );
      }),
      create: vi.fn(async (args: any) => {
        maybeFail('asignacionTarea.create');
        // Simula el índice parcial asignacion_tarea_activa_unique (Tarea 9):
        // a lo sumo una fila activa por tarea. Misma forma de error real
        // reproducida y documentada en la Tarea 26.
        if (args.data.desasignadaEn === null) {
          const activaExistente = state.asignaciones.find(
            (a) => a.idTarea === args.data.idTarea && a.desasignadaEn === null,
          );
          if (activaExistente) {
            throw new Prisma.PrismaClientKnownRequestError(
              'Unique constraint failed on the fields: (`id_tarea`)',
              {
                code: 'P2002',
                clientVersion: '6.19.2',
                meta: { modelName: 'AsignacionTarea', target: ['id_tarea'] },
              },
            );
          }
        }
        const row: AsignacionRow = {
          idAsignacion: nextId(state, 'asignacion'),
          fechaAsignacion: new Date(),
          ...args.data,
        };
        state.asignaciones.push(row);
        recordUndo(() => {
          state.asignaciones = state.asignaciones.filter((a) => a !== row);
        });
        return row;
      }),
      updateMany: vi.fn(async (args: any) => {
        maybeFail('asignacionTarea.updateMany');
        const where = args.where ?? {};
        const matches = state.asignaciones.filter(
          (a) =>
            (where.idAsignacion === undefined || a.idAsignacion === where.idAsignacion) &&
            (where.idTarea === undefined || a.idTarea === where.idTarea) &&
            (where.idUsuario === undefined || a.idUsuario === where.idUsuario) &&
            (where.desasignadaEn === undefined || a.desasignadaEn === where.desasignadaEn),
        );
        for (const row of matches) {
          const before = { ...row };
          recordUndo(() => Object.assign(row, before));
          Object.assign(row, args.data);
        }
        return { count: matches.length };
      }),
    },

    tareaEtiqueta: {
      createMany: vi.fn(async (args: any) => {
        maybeFail('tareaEtiqueta.createMany');
        const nuevas: TareaEtiquetaRow[] = args.data;
        state.tareaEtiquetas = [...state.tareaEtiquetas, ...nuevas];
        recordUndo(() => {
          state.tareaEtiquetas = state.tareaEtiquetas.filter((te) => !nuevas.includes(te));
        });
        return { count: nuevas.length };
      }),
      deleteMany: vi.fn(async (args: any) => {
        maybeFail('tareaEtiqueta.deleteMany');
        const eliminadas = state.tareaEtiquetas.filter((te) => te.idTarea === args.where.idTarea);
        state.tareaEtiquetas = state.tareaEtiquetas.filter((te) => te.idTarea !== args.where.idTarea);
        recordUndo(() => {
          state.tareaEtiquetas = [...state.tareaEtiquetas, ...eliminadas];
        });
        return { count: eliminadas.length };
      }),
    },

    hito: {
      findUnique: vi.fn(async (args: any) => {
        maybeFail('hito.findUnique');
        return state.hitos.find((h) => h.idHito === args.where.idHito) ?? null;
      }),
    },

    rolProyecto: {
      findUnique: vi.fn(async (args: any) => {
        maybeFail('rolProyecto.findUnique');
        return state.roles.find((r) => r.idRolProyecto === args.where.idRolProyecto) ?? null;
      }),
    },

    etiqueta: {
      findMany: vi.fn(async (args: any) => {
        maybeFail('etiqueta.findMany');
        const ids: number[] = args.where.idEtiqueta.in;
        return state.etiquetas.filter((e) => ids.includes(e.idEtiqueta));
      }),
    },

    usuario: {
      findUnique: vi.fn(async (args: any) => {
        maybeFail('usuario.findUnique');
        const row = state.usuarios.find((u) => u.idUsuario === args.where.idUsuario);
        if (!row) return null;
        if (!args.select) return row;
        const result: Record<string, unknown> = {};
        for (const key of Object.keys(args.select)) {
          result[key] = (row as unknown as Record<string, unknown>)[key];
        }
        return result;
      }),
    },

    participacionProyecto: {
      findFirst: vi.fn(async (args: any) => {
        maybeFail('participacionProyecto.findFirst');
        const match = state.participaciones.find((p) => matchesParticipacionWhere(p, state, args.where));
        return match ? { idParticipacion: match.idParticipacion } : null;
      }),
    },

    comentario: {
      create: vi.fn(async (args: any) => {
        maybeFail('comentario.create');
        const row: ComentarioRow = {
          idComentario: nextId(state, 'comentario'),
          creadoEn: new Date(),
          editadoEn: null,
          eliminadoEn: null,
          idProyecto: null,
          idTarea: null,
          idHito: null,
          ...args.data,
        };
        state.comentarios.push(row);
        return row;
      }),
    },
  };

  return db;
}

// ---------------------------------------------------------------------------
// Wiring de servicios reales
// ---------------------------------------------------------------------------

export interface LifecycleEnv {
  state: FixtureState;
  db: FakeDb;
  tasksContext: TasksContextService;
  tasksAuthorization: TasksAuthorizationService;
  tasksRelations: TasksRelationsService;
  tasksService: TasksService;
  projectsService: ProjectsService;
  comentariosService: ComentariosService;
  notifications: {
    notifyFromTemplate: ReturnType<typeof vi.fn>;
    notifyProjectActiveParticipants: ReturnType<typeof vi.fn>;
    notifyUsers: ReturnType<typeof vi.fn>;
    notifyRoleMembers: ReturnType<typeof vi.fn>;
  };
}

/** Construye un entorno fresco (estado + fake db + servicios REALES) para un escenario de la suite integral. */
export function setupLifecycleEnv(): LifecycleEnv {
  const state = createFixtureState();
  const db = makeFakeDb(state);

  const tasksContext = new TasksContextService(db as any);
  const tasksAuthorization = new TasksAuthorizationService(tasksContext);
  const tasksRelations = new TasksRelationsService(db as any, tasksContext);
  const notifications = {
    notifyFromTemplate: vi.fn().mockResolvedValue(undefined),
    notifyProjectActiveParticipants: vi.fn().mockResolvedValue(undefined),
    notifyUsers: vi.fn().mockResolvedValue(undefined),
    /**
     * Tarea 34: réplica mínima de NotificationsService.notifyRoleMembers
     * (Tarea 33) contra el mismo `state` del fixture (participaciones +
     * roles), no contra el `db` Prisma-fake: solo se necesita resolver
     * "miembros activos de este rol en este proyecto" para las pruebas de
     * integración de notificaciones de gestión de tareas, sin duplicar la
     * semántica transaccional ni el resto del comportamiento Prisma
     * simulado. Excluye al actor y deduplica, igual que el servicio real,
     * y delega en el mismo `notifyUsers` mockeado (nunca persiste ni emite
     * por su cuenta).
     */
    notifyRoleMembers: vi.fn(
      async (projectId: number, roleId: number, actorUserId: number, input: any) => {
        const activos = state.participaciones.filter((p) => {
          if (p.idRolProyecto !== roleId) return false;
          if (p.estadoParticipacion !== 'ACTIVO') return false;
          const rol = state.roles.find((r) => r.idRolProyecto === p.idRolProyecto);
          return !!rol && rol.idProyecto === projectId;
        });
        const recipientIds = [
          ...new Set(activos.map((p) => p.idUsuario).filter((id) => id !== actorUserId)),
        ];
        if (recipientIds.length === 0) return;
        await notifications.notifyUsers(recipientIds, input);
      },
    ),
  };
  const tasksService = new TasksService(
    db as any,
    tasksAuthorization,
    tasksRelations,
    notifications as any,
    tasksContext,
  );

  const projectsNotifications = {
    isAdmin: vi.fn().mockResolvedValue(false),
    notifyAdminsFromTemplate: vi.fn().mockResolvedValue(undefined),
    notifyFromTemplate: vi.fn().mockResolvedValue(undefined),
  };
  const projectsService = new ProjectsService(db as any, projectsNotifications as any, {} as any);

  const comentariosService = new ComentariosService(db as any, notifications as any);

  return {
    state,
    db,
    tasksContext,
    tasksAuthorization,
    tasksRelations,
    tasksService,
    projectsService,
    comentariosService,
    notifications,
  };
}
