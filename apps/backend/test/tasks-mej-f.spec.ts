import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EstadoTarea, RepeticionTarea } from '@prisma/client';
import {
  assertBloqueanteValido,
  assertNoBloqueada,
  sumarRepeticion,
} from '../src/tasks/tasks-writes.helpers';
import { TasksExtrasService } from '../src/tasks/tasks-extras.service';
import { TasksRecurrenceService, hoyGuatemala } from '../src/tasks/tasks-recurrence.service';
import { EvidenceService } from '../src/evidence/evidence.service';
import { PlantillasTareaService } from '../src/tasks/plantillas-tarea.service';

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('MEJ-47: sumarRepeticion', () => {
  it('diaria suma un dia y semanal siete', () => {
    expect(iso(sumarRepeticion(dia('2026-12-31'), RepeticionTarea.DIARIA))).toBe('2027-01-01');
    expect(iso(sumarRepeticion(dia('2026-11-25'), RepeticionTarea.SEMANAL))).toBe('2026-12-02');
  });

  it('mensual conserva el dia y se ajusta al ultimo dia del mes corto', () => {
    expect(iso(sumarRepeticion(dia('2026-11-15'), RepeticionTarea.MENSUAL))).toBe('2026-12-15');
    expect(iso(sumarRepeticion(dia('2026-01-31'), RepeticionTarea.MENSUAL))).toBe('2026-02-28');
    expect(iso(sumarRepeticion(dia('2028-01-31'), RepeticionTarea.MENSUAL))).toBe('2028-02-29');
    expect(iso(sumarRepeticion(dia('2026-12-31'), RepeticionTarea.MENSUAL))).toBe('2027-01-31');
  });

  it('hoyGuatemala usa el dia calendario UTC-6', () => {
    expect(iso(hoyGuatemala(new Date('2026-11-12T05:30:00.000Z')))).toBe('2026-11-11');
    expect(iso(hoyGuatemala(new Date('2026-11-12T06:00:00.000Z')))).toBe('2026-11-12');
  });
});

/** Fake de tx.tarea.findFirst sobre un mapa idTarea -> fila. */
function txConTareas(filas: Record<number, { idProyecto: number; idTareaBloqueante: number | null; estadoTarea?: EstadoTarea; tituloTarea?: string }>) {
  return {
    tarea: {
      findFirst: vi.fn(async ({ where }: { where: { idTarea: number; estadoTarea?: unknown } }) => {
        const fila = filas[where.idTarea];
        if (!fila) return null;
        if (where.estadoTarea && fila.estadoTarea === EstadoTarea.HECHO) return null;
        return { ...fila, tituloTarea: fila.tituloTarea ?? `T${where.idTarea}` };
      }),
    },
  } as never;
}

describe('MEJ-48: assertBloqueanteValido', () => {
  const filas = {
    1: { idProyecto: 7, idTareaBloqueante: null },
    2: { idProyecto: 7, idTareaBloqueante: 1 },
    3: { idProyecto: 7, idTareaBloqueante: 2 },
    9: { idProyecto: 8, idTareaBloqueante: null },
  };

  it('acepta una tarea del mismo proyecto sin ciclo', async () => {
    await expect(assertBloqueanteValido(txConTareas(filas), 7, 4, 3)).resolves.toBeUndefined();
    await expect(assertBloqueanteValido(txConTareas(filas), 7, null, 3)).resolves.toBeUndefined();
  });

  it('rechaza bloquearse a si misma', async () => {
    await expect(assertBloqueanteValido(txConTareas(filas), 7, 2, 2)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza un ciclo directo e indirecto', async () => {
    // 1 bloqueada por 3: 3 -> 2 -> 1 -> 3
    await expect(assertBloqueanteValido(txConTareas(filas), 7, 1, 3)).rejects.toThrow(/ciclo/);
    await expect(assertBloqueanteValido(txConTareas(filas), 7, 1, 2)).rejects.toThrow(/ciclo/);
  });

  it('rechaza una tarea de otro proyecto o inexistente', async () => {
    await expect(assertBloqueanteValido(txConTareas(filas), 7, 4, 9)).rejects.toThrow(/no existe en este proyecto/);
    await expect(assertBloqueanteValido(txConTareas(filas), 7, 4, 404)).rejects.toThrow(/no existe en este proyecto/);
  });
});

describe('MEJ-48: assertNoBloqueada', () => {
  const filas = {
    1: { idProyecto: 7, idTareaBloqueante: null, estadoTarea: EstadoTarea.EN_PROGRESO, tituloTarea: 'Base' },
    2: { idProyecto: 7, idTareaBloqueante: null, estadoTarea: EstadoTarea.HECHO, tituloTarea: 'Lista' },
  };

  it('no consulta nada sin bloqueante ni para POR_HACER', async () => {
    const tx = txConTareas(filas);
    await assertNoBloqueada(tx, [{ idTareaBloqueante: null }], EstadoTarea.EN_PROGRESO);
    await assertNoBloqueada(tx, [{ idTareaBloqueante: 1 }], EstadoTarea.POR_HACER);
    expect((tx as unknown as { tarea: { findFirst: ReturnType<typeof vi.fn> } }).tarea.findFirst).not.toHaveBeenCalled();
  });

  it('bloquea el paso a En progreso, En revision y Hecho mientras el bloqueante no este Hecho', async () => {
    for (const estado of [EstadoTarea.EN_PROGRESO, EstadoTarea.EN_REVISION, EstadoTarea.HECHO]) {
      await expect(
        assertNoBloqueada(txConTareas(filas), [{ tituloTarea: 'Mia', idTareaBloqueante: 1 }], estado),
      ).rejects.toBeInstanceOf(ConflictException);
    }
  });

  it('permite avanzar cuando el bloqueante ya esta Hecho o fue eliminado', async () => {
    await expect(
      assertNoBloqueada(txConTareas(filas), [{ idTareaBloqueante: 2 }], EstadoTarea.EN_PROGRESO),
    ).resolves.toBeUndefined();
    await expect(
      assertNoBloqueada(txConTareas(filas), [{ idTareaBloqueante: 404 }], EstadoTarea.EN_PROGRESO),
    ).resolves.toBeUndefined();
  });
});

function fakeProjectTx(tx: unknown) {
  return { run: vi.fn(async (_p: number, _u: number, _op: string, fn: (ctx: unknown) => unknown) => fn({ tx, project: { idProyecto: 1 } })) };
}

describe('MEJ-6: checklist (TasksExtrasService)', () => {
  function crear(opts: { autoriza?: boolean; items?: number; existe?: boolean } = {}) {
    const { autoriza = true, items = 0, existe = true } = opts;
    const tx = {
      tareaChecklistItem: {
        count: vi.fn(async () => items),
        create: vi.fn(async () => ({})),
        findMany: vi.fn(async () => [{ idItem: 1, texto: 'a', completado: false }]),
        updateMany: vi.fn(async () => ({ count: existe ? 1 : 0 })),
        deleteMany: vi.fn(async () => ({ count: existe ? 1 : 0 })),
      },
    };
    const auth = {
      assertCanChangeTaskState: vi.fn(async () => {
        if (!autoriza) throw new ForbiddenException('no');
        return { idSprint: 3 };
      }),
      assertCanReadTask: vi.fn(),
    };
    const policy = { assertWriteTx: vi.fn(async () => undefined) };
    const service = new TasksExtrasService({} as never, fakeProjectTx(tx) as never, policy as never, auth as never);
    return { service, tx, auth, policy };
  }

  it('crea al final, valida la politica de escritura y devuelve la lista', async () => {
    const { service, tx, policy } = crear({ items: 2 });
    const lista = await service.addItem(1, 5, 9, { texto: 'Revisar' });
    expect(tx.tareaChecklistItem.create).toHaveBeenCalledWith({ data: { idTarea: 5, texto: 'Revisar', orden: 2 } });
    expect(policy.assertWriteTx).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'TAREA_WRITE', 9, { sprintId: 3 });
    expect(lista).toHaveLength(1);
  });

  it('rechaza el elemento 51', async () => {
    const { service, tx } = crear({ items: 50 });
    await expect(service.addItem(1, 5, 9, { texto: 'x' })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.tareaChecklistItem.create).not.toHaveBeenCalled();
  });

  it('quien no es lider ni asignado no puede escribir (403) y nada se guarda', async () => {
    const { service, tx } = crear({ autoriza: false });
    await expect(service.addItem(1, 5, 9, { texto: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.updateItem(1, 5, 1, 9, { completado: true })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.removeItem(1, 5, 1, 9)).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.tareaChecklistItem.create).not.toHaveBeenCalled();
    expect(tx.tareaChecklistItem.updateMany).not.toHaveBeenCalled();
    expect(tx.tareaChecklistItem.deleteMany).not.toHaveBeenCalled();
  });

  it('actualiza solo los campos enviados y 404 si el elemento es de otra tarea', async () => {
    const ok = crear();
    await ok.service.updateItem(1, 5, 1, 9, { completado: true });
    expect(ok.tx.tareaChecklistItem.updateMany).toHaveBeenCalledWith({
      where: { idItem: 1, idTarea: 5 },
      data: { completado: true },
    });
    const faltante = crear({ existe: false });
    await expect(faltante.service.updateItem(1, 5, 1, 9, { texto: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(faltante.service.removeItem(1, 5, 1, 9)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('MEJ-10: historial de la tarea', () => {
  it('traduce los eventos de bitacora a texto y exige poder leer la tarea', async () => {
    const f = (idAuditoria: number, accion: string, valorAnterior: unknown, valorNuevo: unknown) => ({
      idAuditoria,
      accion,
      fechaEvento: new Date('2026-11-10T10:00:00.000Z'),
      detalleJson: { idProyecto: 1, valorAnterior, valorNuevo },
      usuario: { idUsuario: 1, nombre: 'Ana', apellido: 'Paz' },
    });
    const prisma = {
      bitacoraAuditoria: {
        findMany: vi.fn(async () => [
          f(5, 'TASK_UPDATED', { fechaLimite: '2026-12-01' }, { fechaLimite: '2026-12-05' }),
          f(4, 'TASK_REASSIGNED', { idUsuario: 2 }, { idUsuario: 3 }),
          f(3, 'TASK_ASSIGNED', { idUsuario: null }, { idUsuario: 2 }),
          f(2, 'TASK_STATUS_CHANGED', { estadoTarea: 'POR_HACER' }, { estadoTarea: 'EN_PROGRESO' }),
          f(1, 'TASK_CREATED', null, { tituloTarea: 'x' }),
        ]),
      },
      usuario: {
        findMany: vi.fn(async () => [
          { idUsuario: 2, nombre: 'Luis', apellido: 'Gil' },
          { idUsuario: 3, nombre: 'Eva', apellido: 'Soto' },
        ]),
      },
    };
    const auth = { assertCanReadTask: vi.fn(async () => ({})) };
    const service = new TasksExtrasService(prisma as never, {} as never, {} as never, auth as never);

    const historial = await service.historial(1, 8, 9);

    expect(auth.assertCanReadTask).toHaveBeenCalledWith(1, 8, 9);
    expect(prisma.bitacoraAuditoria.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tipoObjeto: 'TAREA', idObjeto: '8' }) }),
    );
    expect(historial.map((h) => h.descripcion)).toEqual([
      'cambió la fecha límite de 2026-12-01 a 2026-12-05',
      'reasignó la tarea de Luis Gil a Eva Soto',
      'asignó la tarea a Luis Gil',
      'movió la tarea de Por hacer a En progreso',
      'creó la tarea',
    ]);
    expect(historial[0].actor).toEqual({ idUsuario: 1, nombre: 'Ana', apellido: 'Paz' });
  });

  it('no consulta la bitacora si la lectura es rechazada', async () => {
    const prisma = { bitacoraAuditoria: { findMany: vi.fn() } };
    const auth = { assertCanReadTask: vi.fn().mockRejectedValue(new ForbiddenException('no')) };
    const service = new TasksExtrasService(prisma as never, {} as never, {} as never, auth as never);
    await expect(service.historial(1, 8, 9)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.bitacoraAuditoria.findMany).not.toHaveBeenCalled();
  });
});

describe('MEJ-49: evidencias (EvidenceService)', () => {
  function crear(opts: { revisiones?: number; cargador?: number; lider?: number; autoriza?: boolean } = {}) {
    const { revisiones = 0, cargador = 9, lider = 1, autoriza = true } = opts;
    const tx = {
      evidencia: {
        count: vi.fn(async () => 0),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ idEvidencia: 1, ...data, tamanoBytes: null })),
        findFirst: vi.fn(async () => ({ idUsuarioCargador: cargador, _count: { revisiones } })),
        delete: vi.fn(async () => ({})),
      },
    };
    const auth = {
      assertCanChangeTaskState: vi.fn(async () => {
        if (!autoriza) throw new ForbiddenException('no');
        return { idSprint: 3 };
      }),
      assertCanReadTask: vi.fn(),
    };
    const context = {
      getTaskInProjectOrThrow: vi.fn(async () => ({ idSprint: 3 })),
      getProjectOrThrow: vi.fn(async () => ({ creadoPor: lider })),
    };
    const policy = { assertWriteTx: vi.fn(async () => undefined) };
    const service = new EvidenceService({} as never, fakeProjectTx(tx) as never, policy as never, auth as never, context as never);
    return { service, tx };
  }

  it('sube un enlace https y rechaza http, basura y archivos fuera de Cloudinary', async () => {
    const { service, tx } = crear();
    await service.create(1, 5, 9, { tipoEvidencia: 'ENLACE', urlRecurso: 'https://example.com/doc' });
    expect(tx.evidencia.create).toHaveBeenCalledTimes(1);
    await expect(service.create(1, 5, 9, { tipoEvidencia: 'ENLACE', urlRecurso: 'http://example.com' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create(1, 5, 9, { tipoEvidencia: 'ENLACE', urlRecurso: 'no es url' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create(1, 5, 9, { tipoEvidencia: 'ARCHIVO', urlRecurso: 'https://example.com/a.pdf' })).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.evidencia.create).toHaveBeenCalledTimes(1);
  });

  it('solo el lider o el asignado suben evidencia', async () => {
    const { service, tx } = crear({ autoriza: false });
    await expect(service.create(1, 5, 9, { tipoEvidencia: 'ENLACE', urlRecurso: 'https://example.com' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.evidencia.create).not.toHaveBeenCalled();
  });

  it('borra quien la subio o el lider, nadie mas, y nunca una ya revisada', async () => {
    const propia = crear({ cargador: 9, lider: 1 });
    await propia.service.remove(1, 5, 1, 9);
    expect(propia.tx.evidencia.delete).toHaveBeenCalled();

    const lider = crear({ cargador: 9, lider: 1 });
    await lider.service.remove(1, 5, 1, 1);
    expect(lider.tx.evidencia.delete).toHaveBeenCalled();

    const ajena = crear({ cargador: 9, lider: 1 });
    await expect(ajena.service.remove(1, 5, 1, 7)).rejects.toBeInstanceOf(ForbiddenException);
    expect(ajena.tx.evidencia.delete).not.toHaveBeenCalled();

    const revisada = crear({ revisiones: 1 });
    await expect(revisada.service.remove(1, 5, 1, 9)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('MEJ-52: plantillas (PlantillasTareaService)', () => {
  it('solo el lider crea y borra; el listado exige leer el tablero', async () => {
    const prisma = {
      plantillaTarea: {
        count: vi.fn(async () => 0),
        create: vi.fn(async ({ data }: { data: unknown }) => data),
        deleteMany: vi.fn(async () => ({ count: 0 })),
        findMany: vi.fn(async () => []),
      },
    };
    const auth = { assertCanListProjectTasks: vi.fn(async () => undefined) };
    const context = { assertProjectLeader: vi.fn(async () => undefined) };
    const service = new PlantillasTareaService(prisma as never, auth as never, context as never);

    await service.list(1, 9);
    expect(auth.assertCanListProjectTasks).toHaveBeenCalledWith(1, 9);

    await service.create(1, 9, { nombre: 'Bug', tituloTarea: 'Corregir', prioridad: 'ALTA', checklist: ['a'] });
    expect(context.assertProjectLeader).toHaveBeenCalledWith(1, 9);
    expect(prisma.plantillaTarea.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ idProyecto: 1, creadaPor: 9, checklist: ['a'], tiempoEstimadoHoras: null }),
    });

    await expect(service.remove(1, 4, 9)).rejects.toBeInstanceOf(NotFoundException);

    context.assertProjectLeader.mockRejectedValue(new ForbiddenException('no'));
    await expect(service.create(1, 8, { nombre: 'x', tituloTarea: 'x', prioridad: 'BAJA' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.remove(1, 4, 8)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('limita a 30 plantillas por proyecto', async () => {
    const prisma = { plantillaTarea: { count: vi.fn(async () => 30), create: vi.fn() } };
    const service = new PlantillasTareaService(prisma as never, {} as never, { assertProjectLeader: vi.fn() } as never);
    await expect(service.create(1, 9, { nombre: 'x', tituloTarea: 'x', prioridad: 'BAJA' })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.plantillaTarea.create).not.toHaveBeenCalled();
  });
});

describe('MEJ-47: TasksRecurrenceService', () => {
  const maestra = (extra: Record<string, unknown> = {}) => ({
    idTarea: 10,
    idProyecto: 1,
    idHito: 4,
    idRolProyecto: null,
    tituloTarea: 'Standup',
    descripcionTarea: null,
    prioridad: 'MEDIA',
    tiempoEstimadoHoras: 1,
    puntosHistoria: null,
    creadaPor: 1,
    repeticion: RepeticionTarea.SEMANAL,
    repeticionProxima: dia('2026-11-10'),
    etiquetas: [{ idEtiqueta: 3 }],
    checklist: [{ texto: 'a', orden: 0 }],
    ...extra,
  });

  function crear(opts: { sprint?: boolean; reservada?: number; fila?: unknown } = {}) {
    const { sprint = true, reservada = 1, fila = maestra() } = opts;
    const tx = {
      tarea: {
        findFirst: vi.fn(async () => fila),
        updateMany: vi.fn(async () => ({ count: reservada })),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ idTarea: 11, estadoTarea: 'POR_HACER', ...data })),
        findMany: vi.fn(async () => []),
      },
      sprint: { findFirst: vi.fn(async () => (sprint ? { idSprint: 5 } : null)) },
      tareaEtiqueta: { createMany: vi.fn(async () => ({})) },
      tareaChecklistItem: { createMany: vi.fn(async () => ({})) },
      hito: { update: vi.fn(async () => ({})) },
    };
    const prisma = {
      tarea: { findMany: vi.fn(async () => [{ idTarea: 10 }]) },
      $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
    };
    const bitacora = { registrarEvento: vi.fn(async () => undefined) };
    return { service: new TasksRecurrenceService(prisma as never, bitacora as never), tx, prisma, bitacora };
  }

  it('crea una copia en el sprint activo y adelanta la proxima ocurrencia', async () => {
    const { service, tx, bitacora } = crear();
    const creadas = await service.generarTareasRepetitivas(new Date('2026-11-10T14:00:00.000Z'));
    expect(creadas).toBe(1);
    expect(tx.tarea.updateMany).toHaveBeenCalledWith({
      where: { idTarea: 10, repeticionProxima: dia('2026-11-10') },
      data: { repeticionProxima: dia('2026-11-17') },
    });
    expect(tx.tarea.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        idSprint: 5,
        idTareaOrigen: 10,
        estadoTarea: 'POR_HACER',
        fechaLimite: dia('2026-11-10'),
        tituloTarea: 'Standup',
      }),
    });
    expect(tx.tarea.create.mock.calls[0][0].data).not.toHaveProperty('repeticion');
    expect(tx.tareaEtiqueta.createMany).toHaveBeenCalled();
    expect(tx.tareaChecklistItem.createMany).toHaveBeenCalledWith({ data: [{ idTarea: 11, texto: 'a', orden: 0 }] });
    expect(tx.hito.update).toHaveBeenCalled();
    expect(bitacora.registrarEvento).toHaveBeenCalledWith(expect.objectContaining({ tipoEvento: 'TASK_CREATED', idEntidad: 11 }));
  });

  it('tras dias sin correr crea una sola copia con fecha de hoy y salta a futuro', async () => {
    const { service, tx } = crear({ fila: maestra({ repeticion: RepeticionTarea.DIARIA, repeticionProxima: dia('2026-11-05') }) });
    await service.generarTareasRepetitivas(new Date('2026-11-10T14:00:00.000Z'));
    expect(tx.tarea.updateMany.mock.calls[0][0].data).toEqual({ repeticionProxima: dia('2026-11-11') });
    expect(tx.tarea.create.mock.calls[0][0].data.fechaLimite).toEqual(dia('2026-11-10'));
    expect(tx.tarea.create).toHaveBeenCalledTimes(1);
  });

  it('sin sprint activo no crea ni adelanta nada', async () => {
    const { service, tx } = crear({ sprint: false });
    expect(await service.generarTareasRepetitivas(new Date('2026-11-10T14:00:00.000Z'))).toBe(0);
    expect(tx.tarea.updateMany).not.toHaveBeenCalled();
    expect(tx.tarea.create).not.toHaveBeenCalled();
  });

  it('si otra corrida ya reservo la ocurrencia no duplica', async () => {
    const { service, tx } = crear({ reservada: 0 });
    expect(await service.generarTareasRepetitivas(new Date('2026-11-10T14:00:00.000Z'))).toBe(0);
    expect(tx.tarea.create).not.toHaveBeenCalled();
  });

  it('un fallo en una tarea no detiene el job', async () => {
    const { service, prisma } = crear();
    prisma.$transaction.mockRejectedValueOnce(new Error('boom'));
    expect(await service.generarTareasRepetitivas(new Date('2026-11-10T14:00:00.000Z'))).toBe(0);
  });
});
