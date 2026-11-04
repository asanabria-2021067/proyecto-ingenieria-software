import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { makeTimeRecordsDouble } from './helpers/time-records.fixture';
import { makeProjectPolicyDouble, makeProjectReadPolicyDouble, makeProjectTransactionDouble } from './helpers/project-policy.double';
import { TasksService } from '../src/tasks/tasks.service';
import { TasksContextService } from '../src/tasks/tasks-context.service';
import { assertPadreValido } from '../src/tasks/tasks-writes.helpers';
import { ordenarTareas, type TareaPublica } from '../src/tasks/tasks.mapper';
import { ListTasksQueryDto } from '../src/tasks/dto/list-tasks-query.dto';
import { SetResponsablesDto } from '../src/tasks/dto/set-responsables.dto';
import { CreateTaskDto } from '../src/tasks/dto/create-task.dto';

const errores = async (clase: new () => object, plano: object) => validate(plainToInstance(clase, plano));

function tarea(idTarea: number, extra: Partial<TareaPublica>): TareaPublica {
  return {
    idTarea,
    tituloTarea: `t${idTarea}`,
    estadoTarea: 'POR_HACER',
    prioridad: 'MEDIA',
    fechaLimite: null,
    responsables: [],
    ...extra,
  } as TareaPublica;
}

const persona = (idUsuario: number, nombre: string, apellido: string) => ({ idUsuario, nombre, apellido, fotoUrl: null });

describe('MEJ-112: orden por columna del listado', () => {
  const lista = [
    tarea(1, { tituloTarea: 'Beta', estadoTarea: 'HECHO', prioridad: 'BAJA', fechaLimite: '2026-12-10', responsables: [persona(2, 'Luis', 'Zeta')] }),
    tarea(2, { tituloTarea: 'alfa', estadoTarea: 'POR_HACER', prioridad: 'ALTA', fechaLimite: null, responsables: [] }),
    tarea(3, { tituloTarea: 'Gamma', estadoTarea: 'EN_REVISION', prioridad: 'MEDIA', fechaLimite: '2026-12-01', responsables: [persona(3, 'Ana', 'Acosta')] }),
  ];
  const ids = (columna: Parameters<typeof ordenarTareas>[1], dir: 'asc' | 'desc') =>
    ordenarTareas(lista, columna, dir).map((t) => t.idTarea);

  it('ordena por titulo sin distinguir mayusculas', () => {
    expect(ids('titulo', 'asc')).toEqual([2, 1, 3]);
    expect(ids('titulo', 'desc')).toEqual([3, 1, 2]);
  });

  it('ordena por estado y prioridad segun el flujo de negocio, no alfabeticamente', () => {
    expect(ids('estado', 'asc')).toEqual([2, 3, 1]);
    expect(ids('prioridad', 'asc')).toEqual([2, 3, 1]);
    expect(ids('prioridad', 'desc')).toEqual([1, 3, 2]);
  });

  it('las tareas sin fecha o sin responsable van siempre al final, en ambas direcciones', () => {
    expect(ids('fechaLimite', 'asc')).toEqual([3, 1, 2]);
    expect(ids('fechaLimite', 'desc')).toEqual([1, 3, 2]);
    expect(ids('responsable', 'asc')).toEqual([3, 1, 2]);
    expect(ids('responsable', 'desc')).toEqual([1, 3, 2]);
  });

  it('no muta la lista original', () => {
    const copia = lista.map((t) => t.idTarea);
    ordenarTareas(lista, 'titulo', 'desc');
    expect(lista.map((t) => t.idTarea)).toEqual(copia);
  });
});

describe('MEJ-112: ListTasksQueryDto valida contra lista blanca', () => {
  it('acepta columnas permitidas, direccion y filtros combinados', async () => {
    const dto = { ordenarPor: 'responsable', direccion: 'desc', estado: 'HECHO', prioridad: 'ALTA', idUsuario: 3, idRolProyecto: 2, idHito: 1, idTareaPadre: 9 };
    expect(await errores(ListTasksQueryDto, dto)).toHaveLength(0);
  });

  it.each([
    { ordenarPor: 'eliminadoEn' },
    { ordenarPor: 'titulo; DROP TABLE tarea' },
    { direccion: 'sideways' },
    { estado: 'INVENTADO' },
    { idUsuario: 0 },
  ])('rechaza %o', async (dto) => {
    expect((await errores(ListTasksQueryDto, dto)).length).toBeGreaterThan(0);
  });
});

describe('MEJ-112: filtros del listado (TasksContextService.taskFiltersWhere)', () => {
  const ctx = new TasksContextService({} as never);

  it('sin filtros no agrega condiciones', () => {
    expect(ctx.taskFiltersWhere({})).toEqual({});
  });

  it('el responsable incluye al principal activo y a los adicionales', () => {
    expect(ctx.taskFiltersWhere({ idUsuario: 7 })).toEqual({
      AND: [
        {
          OR: [
            { asignaciones: { some: { idUsuario: 7, desasignadaEn: null } } },
            { responsables: { some: { idUsuario: 7 } } },
          ],
        },
      ],
    });
  });

  it('el rol coincide con el rol de la tarea o con el rol activo de algun responsable', () => {
    const usuario = { participaciones: { some: { idRolProyecto: 4, estadoParticipacion: 'ACTIVO' } } };
    expect(ctx.taskFiltersWhere({ idRolProyecto: 4 })).toEqual({
      AND: [
        {
          OR: [
            { idRolProyecto: 4 },
            { asignaciones: { some: { desasignadaEn: null, usuario } } },
            { responsables: { some: { usuario } } },
          ],
        },
      ],
    });
  });

  it('combina todos los filtros con AND', () => {
    const where = ctx.taskFiltersWhere({ estado: 'HECHO', prioridad: 'ALTA', idHito: 2, idUsuario: 1, idRolProyecto: 3, idTareaPadre: 5 });
    expect((where.AND as unknown[]).length).toBe(6);
  });

  it('el alcance ownOnly tambien reconoce a los responsables adicionales', () => {
    expect(ctx.taskScopeWhere(5, { sprintWhere: {}, ownOnly: true })).toEqual({
      OR: [{ asignaciones: { some: { idUsuario: 5 } } }, { responsables: { some: { idUsuario: 5 } } }],
    });
  });
});

describe('MEJ-106: subtareas de un solo nivel', () => {
  it('acepta como padre una tarea raiz del proyecto', async () => {
    const tx = { tarea: { findFirst: vi.fn().mockResolvedValue({ idTareaPadre: null }) } };
    await expect(assertPadreValido(tx as never, 1, 10)).resolves.toBeUndefined();
    expect(tx.tarea.findFirst).toHaveBeenCalledWith({
      where: { idTarea: 10, idProyecto: 1, eliminadoEn: null },
      select: { idTareaPadre: true },
    });
  });

  it('rechaza una hija como padre (no hay nietas)', async () => {
    const tx = { tarea: { findFirst: vi.fn().mockResolvedValue({ idTareaPadre: 3 }) } };
    await expect(assertPadreValido(tx as never, 1, 10)).rejects.toThrow('Una subtarea no puede tener subtareas');
  });

  it('rechaza un padre inexistente, eliminado o de otro proyecto', async () => {
    const tx = { tarea: { findFirst: vi.fn().mockResolvedValue(null) } };
    await expect(assertPadreValido(tx as never, 1, 10)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('CreateTaskDto acepta idTareaPadre y la lista de responsables adicionales con tope', async () => {
    const base = { tituloTarea: 'Hija', fechaLimite: '2999-01-01', prioridad: 'ALTA', idHito: 1 };
    expect(await errores(CreateTaskDto, { ...base, idTareaPadre: 4, idsResponsablesAdicionales: [2, 3] })).toHaveLength(0);
    expect((await errores(CreateTaskDto, { ...base, idTareaPadre: 0 })).length).toBeGreaterThan(0);
    const muchos = Array.from({ length: 10 }, (_, i) => i + 1);
    expect((await errores(CreateTaskDto, { ...base, idsResponsablesAdicionales: muchos })).length).toBeGreaterThan(0);
  });
});

function construir(txExtra: Record<string, unknown> = {}, auth: Record<string, unknown> = {}) {
  const tx = {
    tarea: { count: vi.fn().mockResolvedValue(0), findFirst: vi.fn() },
    tareaResponsable: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    asignacionTarea: { updateMany: vi.fn() },
    ...txExtra,
  };
  const authorization = {
    assertCanAssignTask: vi.fn().mockResolvedValue({ idTarea: 5, idProyecto: 1, idSprint: 8, idRolProyecto: null }),
    assertCanDeleteTask: vi.fn().mockResolvedValue({ idTarea: 5, idProyecto: 1, idSprint: 8, idHito: null, tituloTarea: 'T', idRolProyecto: null }),
    ...auth,
  };
  const relations = { assertUserAssignableToProject: vi.fn().mockResolvedValue(1) };
  const context = { getActiveAssignment: vi.fn().mockResolvedValue({ idAsignacion: 1, idUsuario: 2 }) };
  const notifier = { notifyAssignment: vi.fn().mockResolvedValue(undefined), notifyTaskAudience: vi.fn(), resolveTaskNotificationAudience: vi.fn(), logger: { error: vi.fn() } };
  const service = new TasksService(
    {} as never,
    authorization as never,
    relations as never,
    {} as never,
    context as never,
    makeProjectTransactionDouble({ tx }),
    makeProjectPolicyDouble(),
    makeProjectReadPolicyDouble(),
    makeTimeRecordsDouble(),
    undefined,
    undefined,
    notifier as never,
    {} as never,
  );
  return { service, tx, authorization, relations, notifier, context };
}

describe('MEJ-106: borrar una tarea con subtareas', () => {
  it('se bloquea con 409 si tiene subtareas vigentes y no escribe nada', async () => {
    const { service, tx } = construir({ tarea: { count: vi.fn().mockResolvedValue(2), update: vi.fn() } });
    await expect(service.remove(1, 5, 9)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.asignacionTarea.updateMany).not.toHaveBeenCalled();
    expect((tx.tarea as unknown as { update: ReturnType<typeof vi.fn> }).update).not.toHaveBeenCalled();
  });
});

describe('MEJ-109: responsables adicionales', () => {
  const filaFinal = {
    idTarea: 5, idProyecto: 1, idHito: null, idRolProyecto: null, tituloTarea: 'T', descripcionTarea: null,
    estadoTarea: 'POR_HACER', prioridad: 'MEDIA', creadaPor: 1, fechaCreacion: new Date(), fechaLimite: null,
    actualizadaEn: null, tiempoEstimadoHoras: null, puntosHistoria: null, asignaciones: [], rolProyecto: null,
    hito: null, etiquetas: [], checklist: [], subtareas: [], responsables: [], idTareaPadre: null,
    _count: { comentarios: 0, enlaces: 0 },
  };

  it('solo quien puede asignar la tarea puede cambiar los responsables (403) y no se escribe nada', async () => {
    const { service, tx, relations } = construir({}, { assertCanAssignTask: vi.fn().mockRejectedValue(new ForbiddenException('no')) });
    await expect(service.setResponsables(1, 5, 9, { idsUsuarios: [3] })).rejects.toBeInstanceOf(ForbiddenException);
    expect(relations.assertUserAssignableToProject).not.toHaveBeenCalled();
    expect(tx.tareaResponsable.createMany).not.toHaveBeenCalled();
  });

  it('valida solo a los nuevos, excluye al principal, reemplaza el conjunto y notifica a los nuevos', async () => {
    const { service, tx, relations, notifier } = construir({
      tarea: { findFirst: vi.fn().mockResolvedValue(filaFinal) },
      tareaResponsable: {
        findMany: vi.fn().mockResolvedValue([{ idUsuario: 3 }, { idUsuario: 4 }]),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    });

    // 2 es el principal (se descarta), 3 ya era responsable, 6 es nuevo, 4 se quita.
    await service.setResponsables(1, 5, 9, { idsUsuarios: [2, 3, 6, 6] });

    expect(relations.assertUserAssignableToProject).toHaveBeenCalledTimes(1);
    expect(relations.assertUserAssignableToProject).toHaveBeenCalledWith(1, 6, null, tx, { nuevaAsignacion: true, actorId: 9 });
    expect(tx.tareaResponsable.deleteMany).toHaveBeenCalledWith({ where: { idTarea: 5, idUsuario: { notIn: [3, 6] } } });
    expect(tx.tareaResponsable.createMany).toHaveBeenCalledWith({ data: [{ idTarea: 5, idUsuario: 6 }] });
    expect(notifier.notifyAssignment).toHaveBeenCalledTimes(1);
    expect(notifier.notifyAssignment).toHaveBeenCalledWith(expect.objectContaining({ idTarea: 5 }), 9, 6);
  });

  it('una lista vacia quita a todos los adicionales sin notificar', async () => {
    const { service, tx, notifier } = construir({
      tarea: { findFirst: vi.fn().mockResolvedValue(filaFinal) },
      tareaResponsable: {
        findMany: vi.fn().mockResolvedValue([{ idUsuario: 3 }]),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    });
    await service.setResponsables(1, 5, 9, { idsUsuarios: [] });
    expect(tx.tareaResponsable.deleteMany).toHaveBeenCalledWith({ where: { idTarea: 5, idUsuario: { notIn: [] } } });
    expect(notifier.notifyAssignment).not.toHaveBeenCalled();
  });

  it('SetResponsablesDto limita a 9 y rechaza duplicados o ids invalidos', async () => {
    expect(await errores(SetResponsablesDto, { idsUsuarios: [1, 2] })).toHaveLength(0);
    expect((await errores(SetResponsablesDto, { idsUsuarios: [1, 1] })).length).toBeGreaterThan(0);
    expect((await errores(SetResponsablesDto, { idsUsuarios: [0] })).length).toBeGreaterThan(0);
    expect((await errores(SetResponsablesDto, { idsUsuarios: Array.from({ length: 10 }, (_, i) => i + 1) })).length).toBeGreaterThan(0);
    expect((await errores(SetResponsablesDto, {})).length).toBeGreaterThan(0);
  });
});
