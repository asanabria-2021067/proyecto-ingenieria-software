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
