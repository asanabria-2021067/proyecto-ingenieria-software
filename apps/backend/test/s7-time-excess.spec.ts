import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { TasksContextService } from '../src/tasks/tasks-context.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { TimeRecordsService, computeHoursIndicators } from '../src/time-records/time-records.service';
import {
  makeProjectPolicyDouble,
  makeProjectReadPolicyDouble,
  makeProjectTransactionDouble,
} from './helpers/project-policy.double';

const PROJECT_ID = 10;
const TASK_ID = 20;
const ASSIGNMENT_ID = 30;
const ASSIGNEE_ID = 50;

/**
 * C065/C066 (06 v2 §10). El punto de estas pruebas es el PREDICADO, no la
 * persistencia: por eso el doble de Prisma expone `aggregate` como la única
 * fuente del total efectivo de la tarea y la prueba lo programa paso a paso.
 * El registro revocado y el ajuste vigente del enunciado se representan por
 * su efecto real — no entran en el agregado — porque el filtro
 * `revocadoEn: null` y la tabla separada `AjusteHoraTarea` ya los excluyen; el
 * assert de que la consulta los excluye se hace sobre el `where` recibido.
 */
function setup(options: { total: number; estimacion: number | null }) {
  const totals = { value: new Prisma.Decimal(options.total) };
  const tx = {
    registroTiempoTarea: {
      aggregate: vi.fn(async () => ({ _sum: { horas: totals.value } })),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        idRegistroTiempo: 1,
        idAsignacion: ASSIGNMENT_ID,
        idUsuario: ASSIGNEE_ID,
        horas: new Prisma.Decimal(data.horas as number),
        fecha: data.fecha as Date,
        nota: (data.nota ?? null) as string | null,
        justificacionExceso: (data.justificacionExceso ?? null) as string | null,
        creadoEn: new Date('2026-09-01T12:00:00.000Z'),
        usuario: { idUsuario: ASSIGNEE_ID, nombre: 'Ana', apellido: 'Lopez', fotoUrl: null },
      })),
    },
    asignacionTarea: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        origenReporte: 'GRANULAR', horasReales: null, reconocidoEn: null, desasignadaEn: null,
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const tasksContext = {
    getTaskInProjectOrThrow: vi.fn().mockResolvedValue({
      idTarea: TASK_ID,
      idProyecto: PROJECT_ID,
      idSprint: 1,
      tiempoEstimadoHoras: options.estimacion,
    }),
    getActiveAssignment: vi.fn().mockResolvedValue({
      idAsignacion: ASSIGNMENT_ID, idTarea: TASK_ID, idUsuario: ASSIGNEE_ID, desasignadaEn: null,
    }),
    assertActiveProjectParticipant: vi.fn().mockResolvedValue(undefined),
    getProjectOrThrow: vi.fn().mockResolvedValue({ idProyecto: PROJECT_ID, creadoPor: 0 }),
  };
  const service = new TimeRecordsService(
    { $transaction: vi.fn() } as unknown as PrismaService,
    tasksContext as unknown as TasksContextService,
    { notifyTaskHoursLogged: vi.fn().mockResolvedValue(undefined) } as unknown as NotificationsService,
    makeProjectTransactionDouble({ tx }),
    makeProjectPolicyDouble(),
    makeProjectReadPolicyDouble(),
  );
  const registrar = (nuevoTotal: number) => {
    totals.value = new Prisma.Decimal(nuevoTotal);
  };
  return { service, tx, tasksContext, registrar };
}

const crear = (horas: number, justificacionExceso?: string) => ({
  horas,
  fecha: '2026-09-01',
  ...(justificacionExceso === undefined ? {} : { justificacionExceso }),
});

describe('S7 sobreestimación (06 v2 §10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('T06-A: solo el registro que cruza la estimación exige justificación, sumando todos los tramos de la tarea', async () => {
    // Tarea con estimación 10; el tramo A cerrado ya aporta 8 al total efectivo.
    const { service, tx } = setup({ total: 8, estimacion: 10 });

    // +1 deja el total en 9: no cruza y no exige nada.
    const bajoUmbral = await service.create(PROJECT_ID, TASK_ID, ASSIGNEE_ID, crear(1));
    expect(bajoUmbral.horas).toBe(1);
    expect(tx.registroTiempoTarea.create).toHaveBeenCalledTimes(1);

    // El total se mide sobre TODOS los tramos de la tarea y excluye revocados;
    // los ajustes del líder no aparecen porque viven en otra tabla.
    expect(tx.registroTiempoTarea.aggregate).toHaveBeenCalledWith({
      where: { asignacion: { idTarea: TASK_ID }, revocadoEn: null },
      _sum: { horas: true },
    });

    // +4 deja el total en 12: cruza, y sin texto válido se rechaza sin escribir.
    tx.registroTiempoTarea.create.mockClear();
    await expect(service.create(PROJECT_ID, TASK_ID, ASSIGNEE_ID, crear(4))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.create(PROJECT_ID, TASK_ID, ASSIGNEE_ID, crear(4, '  '))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.registroTiempoTarea.create).not.toHaveBeenCalled();

    // Con texto válido se acepta y la justificación se persiste recortada.
    const cruce = await service.create(PROJECT_ID, TASK_ID, ASSIGNEE_ID, crear(4, '  desvío por incidencias  '));
    expect(cruce.horas).toBe(4);
    expect(tx.registroTiempoTarea.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ justificacionExceso: 'desvío por incidencias' }),
      }),
    );
  });

  it('T06-A: sin estimación no hay umbral y los indicadores son null', async () => {
    const { service, tx } = setup({ total: 8, estimacion: null });

    await service.create(PROJECT_ID, TASK_ID, ASSIGNEE_ID, crear(4));
    await service.create(PROJECT_ID, TASK_ID, ASSIGNEE_ID, crear(9999));
    expect(tx.registroTiempoTarea.create).toHaveBeenCalledTimes(2);

    expect(computeHoursIndicators(new Prisma.Decimal(12), null)).toEqual({
      total: new Prisma.Decimal(12),
      restantes: null,
      sobreEstimacion: null,
    });
  });

  it('T06-A: los indicadores se derivan del total efectivo y nunca son negativos', () => {
    const bajoUmbral = computeHoursIndicators(new Prisma.Decimal('9.00'), 10);
    expect(bajoUmbral.restantes?.toFixed(2)).toBe('1.00');
    expect(bajoUmbral.sobreEstimacion?.toFixed(2)).toBe('0.00');

    const sobreUmbral = computeHoursIndicators(new Prisma.Decimal('12.00'), 10);
    expect(sobreUmbral.restantes?.toFixed(2)).toBe('0.00');
    expect(sobreUmbral.sobreEstimacion?.toFixed(2)).toBe('2.00');
  });

});

/**
 * C066: la tabla antes/después de §10 solo se puede probar con un total que
 * evoluciona, así que este doble mantiene los registros en memoria y responde
 * `aggregate` sumando los efectivos. Es un almacén mínimo, no una reimplementación
 * de Prisma: solo las operaciones que `update` y `revoke` ejecutan.
 */
function setupStore(options: { estimacion: number | null; registros: Array<{ id: number; horas: string; justificacionExceso?: string }> }) {
  const filas = options.registros.map((r) => ({
    idRegistroTiempo: r.id,
    idAsignacion: ASSIGNMENT_ID,
    idUsuario: ASSIGNEE_ID,
    horas: new Prisma.Decimal(r.horas),
    fecha: new Date('2026-09-01T00:00:00.000Z'),
    nota: null as string | null,
    justificacionExceso: r.justificacionExceso ?? null,
    editadoEn: null as Date | null,
    revocadoEn: null as Date | null,
    revocadoPor: null as number | null,
    creadoEn: new Date('2026-09-01T12:00:00.000Z'),
    usuario: { idUsuario: ASSIGNEE_ID, nombre: 'Ana', apellido: 'Lopez', fotoUrl: null },
  }));
  const buscar = (id: number) => filas.find((f) => f.idRegistroTiempo === id);
  const efectivos = () => filas.filter((f) => f.revocadoEn === null);
  const total = () => efectivos().reduce((acc, f) => acc.plus(f.horas), new Prisma.Decimal(0));

  const tx = {
    registroTiempoTarea: {
      findFirst: vi.fn(async ({ where }: { where: { idRegistroTiempo: number } }) => buscar(where.idRegistroTiempo) ?? null),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { idRegistroTiempo: number } }) => buscar(where.idRegistroTiempo)!),
      aggregate: vi.fn(async () => ({ _sum: { horas: total() } })),
      update: vi.fn(async ({ where, data }: { where: { idRegistroTiempo: number }; data: Record<string, unknown> }) => {
        const fila = buscar(where.idRegistroTiempo)!;
        if (data.horas !== undefined) fila.horas = new Prisma.Decimal(data.horas as number);
        if (data.fecha !== undefined) fila.fecha = data.fecha as Date;
        if (data.nota !== undefined) fila.nota = data.nota as string | null;
        if (data.justificacionExceso !== undefined) fila.justificacionExceso = data.justificacionExceso as string;
        if (data.editadoEn !== undefined) fila.editadoEn = data.editadoEn as Date;
        return fila;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { idRegistroTiempo: number; revocadoEn: null }; data: Record<string, unknown> }) => {
        const fila = buscar(where.idRegistroTiempo)!;
        if (fila.revocadoEn !== null) return { count: 0 };
        fila.revocadoEn = data.revocadoEn as Date;
        fila.revocadoPor = data.revocadoPor as number;
        return { count: 1 };
      }),
    },
    asignacionTarea: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        origenReporte: 'GRANULAR', horasReales: null, reconocidoEn: null, desasignadaEn: null,
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const tasksContext = {
    getTaskInProjectOrThrow: vi.fn().mockResolvedValue({
      idTarea: TASK_ID, idProyecto: PROJECT_ID, idSprint: 1, tiempoEstimadoHoras: options.estimacion,
    }),
    assertActiveProjectParticipant: vi.fn().mockResolvedValue(undefined),
    getProjectOrThrow: vi.fn().mockResolvedValue({ idProyecto: PROJECT_ID, creadoPor: 0 }),
  };
  const service = new TimeRecordsService(
    { $transaction: vi.fn() } as unknown as PrismaService,
    tasksContext as unknown as TasksContextService,
    { notifyTaskHoursLogged: vi.fn().mockResolvedValue(undefined) } as unknown as NotificationsService,
    makeProjectTransactionDouble({ tx }),
    makeProjectPolicyDouble(),
    makeProjectReadPolicyDouble(),
  );
  return { service, tx, filas, total };
}

describe('S7 sobreestimación — corrección a la baja (06 v2 §10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('T06-B: reducir o revocar no crea una obligación nueva de justificación', async () => {
    // Estimación 10; registros de 9 y de 3 (este último cruzó y lleva justificación).
    const { service, filas, total } = setupStore({
      estimacion: 10,
      registros: [
        { id: 1, horas: '9.00' },
        { id: 2, horas: '3.00', justificacionExceso: 'cruce original' },
      ],
    });
    expect(total().toFixed(2)).toBe('12.00');

    // Editar 3 → 2 sin justificación: aceptado, total 11, justificación conservada.
    await service.update(PROJECT_ID, TASK_ID, 2, ASSIGNEE_ID, { horas: 2 });
    expect(total().toFixed(2)).toBe('11.00');
    expect(filas[1].justificacionExceso).toBe('cruce original');
    expect(computeHoursIndicators(total(), 10).sobreEstimacion?.toFixed(2)).toBe('1.00');

    // Revocar el registro de 2 sin justificación: aceptado, total 9.
    await service.revoke(PROJECT_ID, TASK_ID, 2, ASSIGNEE_ID);
    expect(total().toFixed(2)).toBe('9.00');
    expect(filas[1].revocadoEn).not.toBeNull();
    // La revocación conserva el importe y la justificación como evidencia.
    expect(filas[1].horas.toFixed(2)).toBe('2.00');
    expect(filas[1].justificacionExceso).toBe('cruce original');
    const bajoUmbral = computeHoursIndicators(total(), 10);
    expect(bajoUmbral.restantes?.toFixed(2)).toBe('1.00');
    expect(bajoUmbral.sobreEstimacion?.toFixed(2)).toBe('0.00');

    // Editar 9 → 11 SÍ cruza (antes 9 ≤ 10, después 11 > 10) y exige texto.
    await expect(
      service.update(PROJECT_ID, TASK_ID, 1, ASSIGNEE_ID, { horas: 11 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(total().toFixed(2)).toBe('9.00');

    // Con justificación válida se acepta y los indicadores se recalculan.
    await service.update(PROJECT_ID, TASK_ID, 1, ASSIGNEE_ID, { horas: 11, justificacionExceso: 'alcance ampliado' });
    expect(total().toFixed(2)).toBe('11.00');
    expect(filas[0].justificacionExceso).toBe('alcance ampliado');
    expect(computeHoursIndicators(total(), 10).sobreEstimacion?.toFixed(2)).toBe('1.00');
  });
});
