import { describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TaskHourAdjustmentsService } from '../src/task-hour-adjustments/task-hour-adjustments.service';
import { TipoEventoBitacora } from '../src/bitacora/tipos-evento-bitacora';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import type { BitacoraEventosService } from '../src/bitacora/bitacora-eventos.service';
import {
  makeProjectPolicyDouble,
  makeProjectReadPolicyDouble,
  makeProjectTransactionDouble,
} from './helpers/project-policy.double';

/**
 * IESUC-568 (RTF 2 · 3.1): reglas de negocio del ajuste de horas del líder
 * (C071/C072). Prisma, el runner transaccional, la policy y la bitácora son
 * dobles; lo que se prueba es la lógica append-only del servicio.
 */

const PROJECT_ID = 7;
const SPRINT_ID = 3;
const ASSIGNMENT_ID = 41;
const ACTOR_ID = 2;
const TASK_ID = 90;

function decimal(value: string | number) {
  return new Prisma.Decimal(value);
}

function tramo(overrides: Record<string, unknown> = {}) {
  return {
    idAsignacion: ASSIGNMENT_ID,
    idTarea: TASK_ID,
    idParticipacion: 11,
    desasignadaEn: new Date('2026-10-01T00:00:00Z'),
    horasReales: decimal('5.00'),
    reconocidoEn: null,
    origenReporte: 'INTEGRANTE',
    ...overrides,
  };
}

function ajuste(overrides: Record<string, unknown> = {}) {
  return {
    idAjusteHora: 100,
    idAsignacion: ASSIGNMENT_ID,
    deltaHoras: decimal('1.50'),
    horasBase: decimal('5.00'),
    justificacion: 'Revisión extra',
    idAutor: ACTOR_ID,
    creadoEn: new Date('2026-10-02T10:00:00Z'),
    anuladoEn: null as Date | null,
    anuladoPor: null as number | null,
    idAjusteAnterior: null as number | null,
    ...overrides,
  };
}

function setup(options: { withBitacora?: boolean; project?: null } = {}) {
  const tx = {
    asignacionTarea: { findFirst: vi.fn().mockResolvedValue(tramo()) },
    ajusteHoraTarea: {
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn(),
    },
  };
  const prisma = { ajusteHoraTarea: { findMany: vi.fn().mockResolvedValue([]) } };
  const projectTx = makeProjectTransactionDouble({
    tx,
    project: options.project === null ? () => null : { creadoPor: ACTOR_ID, estadoProyecto: 'EN_PROGRESO' },
  });
  const policy = makeProjectPolicyDouble();
  const readPolicy = makeProjectReadPolicyDouble();
  const notifications = { notifySprintHoursAdjusted: vi.fn().mockResolvedValue(undefined) };
  const bitacora = { registrarEvento: vi.fn().mockResolvedValue(undefined) };
  const service = new TaskHourAdjustmentsService(
    prisma as unknown as PrismaService,
    projectTx,
    policy,
    readPolicy,
    notifications as unknown as NotificationsService,
    options.withBitacora === false ? undefined : (bitacora as unknown as BitacoraEventosService),
  );
  return { service, tx, prisma, projectTx, policy, readPolicy, notifications, bitacora };
}

describe('TaskHourAdjustmentsService.upsert — permisos y estado del tramo', () => {
  it('rechaza con 404 cuando el runner no entrega fila de proyecto', async () => {
    const { service, tx } = setup({ project: null });

    await expect(
      service.upsert(PROJECT_ID, SPRINT_ID, ASSIGNMENT_ID, ACTOR_ID, { deltaHoras: '1', justificacion: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.asignacionTarea.findFirst).not.toHaveBeenCalled();
  });

  it('valida la policy AJUSTE_HORA con el sprint antes de leer el tramo', async () => {
    const { service, policy, tx } = setup();
    policy.assertWriteTx.mockRejectedValueOnce(new ForbiddenException('Solo el líder'));

    await expect(
      service.upsert(PROJECT_ID, SPRINT_ID, ASSIGNMENT_ID, ACTOR_ID, { deltaHoras: '1', justificacion: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(policy.assertWriteTx).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ idProyecto: PROJECT_ID }),
      'AJUSTE_HORA',
      ACTOR_ID,
      { sprintId: SPRINT_ID },
    );
    expect(tx.asignacionTarea.findFirst).not.toHaveBeenCalled();
  });

  it('busca el tramo acotado al proyecto y al sprint', async () => {
    const { service, tx } = setup();
    tx.asignacionTarea.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.upsert(PROJECT_ID, SPRINT_ID, ASSIGNMENT_ID, ACTOR_ID, { deltaHoras: '1', justificacion: 'x' }),
    ).rejects.toThrow(`Asignación con id ${ASSIGNMENT_ID} no encontrada en el Sprint ${SPRINT_ID}`);
    expect(tx.asignacionTarea.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idAsignacion: ASSIGNMENT_ID, tarea: { idProyecto: PROJECT_ID, idSprint: SPRINT_ID } },
      }),
    );
  });

  it.each([
    ['un tramo abierto', { desasignadaEn: null }, 'Solo se ajusta un tramo ya cerrado'],
    ['un tramo sin reporte materializado', { horasReales: null }, 'El tramo todavía no tiene un reporte materializado'],
    ['un tramo sin participación histórica', { idParticipacion: null }, 'El tramo no tiene participación histórica resuelta'],
    ['un tramo ya consumido', { reconocidoEn: new Date() }, 'El tramo ya fue consumido y no admite ajustes'],
  ])('responde 409 ante %s', async (_caso, overrides, mensaje) => {
    const { service, tx } = setup();
    tx.asignacionTarea.findFirst.mockResolvedValueOnce(tramo(overrides));

    const promise = service.upsert(PROJECT_ID, SPRINT_ID, ASSIGNMENT_ID, ACTOR_ID, {
      deltaHoras: '1',
      justificacion: 'x',
    });
    await expect(promise).rejects.toBeInstanceOf(ConflictException);
    await expect(promise).rejects.toThrow(mensaje);
    expect(tx.ajusteHoraTarea.create).not.toHaveBeenCalled();
  });
});

describe('TaskHourAdjustmentsService.upsert — cálculo del ajuste', () => {
  it('exige justificación cuando el delta no es cero', async () => {
    const { service, tx } = setup();

    await expect(
      service.upsert(PROJECT_ID, SPRINT_ID, ASSIGNMENT_ID, ACTOR_ID, { deltaHoras: '2', justificacion: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.ajusteHoraTarea.findFirst).not.toHaveBeenCalled();
  });

  it('rechaza un total propuesto negativo (base 5 + delta -5.01)', async () => {
    const { service, tx } = setup();

    await expect(
      service.upsert(PROJECT_ID, SPRINT_ID, ASSIGNMENT_ID, ACTOR_ID, {
        deltaHoras: '-5.01',
        justificacion: 'Sobrerreporte',
      }),
    ).rejects.toThrow('El total propuesto no puede ser negativo');
    expect(tx.ajusteHoraTarea.create).not.toHaveBeenCalled();
  });

  it('permite dejar la propuesta exactamente en cero', async () => {
    const { service, tx } = setup();
    tx.ajusteHoraTarea.create.mockResolvedValueOnce(
      ajuste({ deltaHoras: decimal('-5.00'), justificacion: 'No trabajó' }),
    );

    const result = await service.upsert(PROJECT_ID, SPRINT_ID, ASSIGNMENT_ID, ACTOR_ID, {
      deltaHoras: '-5',
      justificacion: 'No trabajó',
    });

    expect(result.propuesta).toBe('0.00');
  });

  it('crea el primer ajuste con base observada, delta exacto y justificación recortada', async () => {
    const { service, tx, bitacora, notifications } = setup();
    tx.ajusteHoraTarea.create.mockResolvedValueOnce(ajuste());

    const result = await service.upsert(PROJECT_ID, SPRINT_ID, ASSIGNMENT_ID, ACTOR_ID, {
      deltaHoras: '1.5',
      justificacion: '  Revisión extra  ',
    });

    const data = tx.ajusteHoraTarea.create.mock.calls[0][0].data;
    expect(data.idAsignacion).toBe(ASSIGNMENT_ID);
    expect(data.deltaHoras.toFixed(2)).toBe('1.50');
    expect(data.horasBase.toFixed(2)).toBe('5.00');
    expect(data.justificacion).toBe('Revisión extra');
    expect(data.idAutor).toBe(ACTOR_ID);
    expect(data.idAjusteAnterior).toBeNull();
    expect(tx.ajusteHoraTarea.updateMany).not.toHaveBeenCalled();
    expect(result).toEqual({
      idAjusteHora: 100,
      idAsignacion: ASSIGNMENT_ID,
      deltaHoras: '1.50',
      horasBase: '5.00',
      propuesta: '6.50',
      justificacion: 'Revisión extra',
      idAutor: ACTOR_ID,
      creadoEn: new Date('2026-10-02T10:00:00Z'),
      anuladoEn: null,
      anuladoPor: null,
      idAjusteAnterior: null,
      vigente: true,
    });
    expect(bitacora.registrarEvento).toHaveBeenCalledWith(
      expect.objectContaining({
        tipoEvento: TipoEventoBitacora.TASK_HOURS_ADJUSTED,
        idProyecto: PROJECT_ID,
        idSprint: SPRINT_ID,
        tipoEntidad: 'TAREA',
        idEntidad: TASK_ID,
        valorAnterior: null,
        valorNuevo: expect.objectContaining({
          deltaHoras: '1.50',
          creadoEn: '2026-10-02T10:00:00.000Z',
          anuladoEn: null,
        }),
      }),
    );
    expect(notifications.notifySprintHoursAdjusted).toHaveBeenCalledWith(PROJECT_ID, ACTOR_ID, {
      projectId: PROJECT_ID,
      sprintId: SPRINT_ID,
      idAsignacion: ASSIGNMENT_ID,
    });
  });

  it('acepta delta cero sin justificación y la guarda como null', async () => {
    const { service, tx } = setup();
    tx.ajusteHoraTarea.create.mockResolvedValueOnce(
      ajuste({ deltaHoras: decimal(0), justificacion: null }),
    );

    const result = await service.upsert(PROJECT_ID, SPRINT_ID, ASSIGNMENT_ID, ACTOR_ID, { deltaHoras: '0.00' });

    expect(tx.ajusteHoraTarea.create.mock.calls[0][0].data.justificacion).toBeNull();
    expect(result.propuesta).toBe('5.00');
  });

  it('es idempotente: un upsert idéntico al vigente no crea fila ni evento', async () => {
    const { service, tx, bitacora, notifications } = setup();
    tx.ajusteHoraTarea.findFirst.mockResolvedValueOnce(ajuste());

    const result = await service.upsert(PROJECT_ID, SPRINT_ID, ASSIGNMENT_ID, ACTOR_ID, {
      deltaHoras: '1.50',
      justificacion: 'Revisión extra',
    });

    expect(result.idAjusteHora).toBe(100);
    expect(tx.ajusteHoraTarea.updateMany).not.toHaveBeenCalled();
    expect(tx.ajusteHoraTarea.create).not.toHaveBeenCalled();
    expect(bitacora.registrarEvento).not.toHaveBeenCalled();
    expect(notifications.notifySprintHoursAdjusted).not.toHaveBeenCalled();
  });

  it('corregir anula el vigente y crea un sucesor enlazado (append-only)', async () => {
    const { service, tx, bitacora } = setup();
    tx.ajusteHoraTarea.findFirst.mockResolvedValueOnce(ajuste());
    tx.ajusteHoraTarea.create.mockResolvedValueOnce(
      ajuste({ idAjusteHora: 101, deltaHoras: decimal('2.00'), idAjusteAnterior: 100 }),
    );

    const result = await service.upsert(PROJECT_ID, SPRINT_ID, ASSIGNMENT_ID, ACTOR_ID, {
      deltaHoras: '2',
      justificacion: 'Revisión extra',
    });

    expect(tx.ajusteHoraTarea.updateMany).toHaveBeenCalledWith({
      where: { idAjusteHora: 100, anuladoEn: null },
      data: { anuladoEn: expect.any(Date), anuladoPor: ACTOR_ID },
    });
    expect(tx.ajusteHoraTarea.create.mock.calls[0][0].data.idAjusteAnterior).toBe(100);
    expect(result.propuesta).toBe('7.00');
    expect(bitacora.registrarEvento.mock.calls[0][0].valorAnterior).toEqual(
      expect.objectContaining({ idAjusteHora: 100, vigente: true }),
    );
  });

  it('una base distinta (reporte rematerializado) también cuenta como corrección', async () => {
    const { service, tx } = setup();
    tx.asignacionTarea.findFirst.mockResolvedValueOnce(tramo({ horasReales: decimal('6.00') }));
    tx.ajusteHoraTarea.findFirst.mockResolvedValueOnce(ajuste());
    tx.ajusteHoraTarea.create.mockResolvedValueOnce(
      ajuste({ idAjusteHora: 102, horasBase: decimal('6.00'), idAjusteAnterior: 100 }),
    );

    await service.upsert(PROJECT_ID, SPRINT_ID, ASSIGNMENT_ID, ACTOR_ID, {
      deltaHoras: '1.50',
      justificacion: 'Revisión extra',
    });

    expect(tx.ajusteHoraTarea.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.ajusteHoraTarea.create).toHaveBeenCalledTimes(1);
  });

  it('responde 409 AJUSTE_DESACTUALIZADO si pierde el CAS de anulación', async () => {
    const { service, tx } = setup();
    tx.ajusteHoraTarea.findFirst.mockResolvedValueOnce(ajuste());
    tx.ajusteHoraTarea.updateMany.mockResolvedValueOnce({ count: 0 });

    const promise = service.upsert(PROJECT_ID, SPRINT_ID, ASSIGNMENT_ID, ACTOR_ID, {
      deltaHoras: '3',
      justificacion: 'Otra razón',
    });
    await expect(promise).rejects.toBeInstanceOf(ConflictException);
    await expect(promise).rejects.toMatchObject({ response: { code: 'AJUSTE_DESACTUALIZADO' } });
    expect(tx.ajusteHoraTarea.create).not.toHaveBeenCalled();
  });

  it('traduce P2002 del índice de vigencia a 409 AJUSTE_DESACTUALIZADO', async () => {
    const { service, tx, bitacora } = setup();
    tx.ajusteHoraTarea.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    const promise = service.upsert(PROJECT_ID, SPRINT_ID, ASSIGNMENT_ID, ACTOR_ID, {
      deltaHoras: '1',
      justificacion: 'Carrera',
    });
    await expect(promise).rejects.toBeInstanceOf(ConflictException);
    await expect(promise).rejects.toMatchObject({
      response: { code: 'AJUSTE_DESACTUALIZADO', message: expect.stringContaining('Otro ajuste') },
    });
    expect(bitacora.registrarEvento).not.toHaveBeenCalled();
  });

  it('propaga cualquier otro error de Prisma sin enmascararlo', async () => {
    const { service, tx } = setup();
    const boom = new Error('conexión perdida');
    tx.ajusteHoraTarea.create.mockRejectedValueOnce(boom);

    await expect(
      service.upsert(PROJECT_ID, SPRINT_ID, ASSIGNMENT_ID, ACTOR_ID, { deltaHoras: '1', justificacion: 'x' }),
    ).rejects.toBe(boom);
  });

  it('funciona sin servicio de bitácora (dependencia opcional)', async () => {
    const { service, tx } = setup({ withBitacora: false });
    tx.ajusteHoraTarea.create.mockResolvedValueOnce(ajuste());

    await expect(
      service.upsert(PROJECT_ID, SPRINT_ID, ASSIGNMENT_ID, ACTOR_ID, { deltaHoras: '1.5', justificacion: 'x' }),
    ).resolves.toMatchObject({ idAjusteHora: 100 });
  });

  it('un fallo del realtime post-commit no rompe la operación', async () => {
    const { service, tx, notifications } = setup();
    tx.ajusteHoraTarea.create.mockResolvedValueOnce(ajuste());
    notifications.notifySprintHoursAdjusted.mockRejectedValueOnce(new Error('socket caído'));
    const logSpy = vi
      .spyOn((service as unknown as { logger: { error: (...a: unknown[]) => void } }).logger, 'error')
      .mockImplementation(() => undefined);

    await expect(
      service.upsert(PROJECT_ID, SPRINT_ID, ASSIGNMENT_ID, ACTOR_ID, { deltaHoras: '1.5', justificacion: 'x' }),
    ).resolves.toMatchObject({ propuesta: '6.50' });
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(`asignación ${ASSIGNMENT_ID}`),
      expect.any(Error),
    );
  });
});

describe('TaskHourAdjustmentsService.revert', () => {
  it('rechaza con 404 cuando no hay proyecto bloqueado', async () => {
    const { service } = setup({ project: null });

    await expect(service.revert(PROJECT_ID, SPRINT_ID, ASSIGNMENT_ID, ACTOR_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('aplica la policy y las reglas del tramo antes de revertir', async () => {
    const { service, tx } = setup();
    tx.asignacionTarea.findFirst.mockResolvedValueOnce(tramo({ reconocidoEn: new Date() }));

    await expect(service.revert(PROJECT_ID, SPRINT_ID, ASSIGNMENT_ID, ACTOR_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.ajusteHoraTarea.updateMany).not.toHaveBeenCalled();
  });

  it('sin ajuste vigente termina sin escribir ni emitir evento', async () => {
    const { service, tx, bitacora, notifications } = setup();

    await expect(service.revert(PROJECT_ID, SPRINT_ID, ASSIGNMENT_ID, ACTOR_ID)).resolves.toBeUndefined();
    expect(tx.ajusteHoraTarea.updateMany).not.toHaveBeenCalled();
    expect(bitacora.registrarEvento).not.toHaveBeenCalled();
    expect(notifications.notifySprintHoursAdjusted).not.toHaveBeenCalled();
  });

  it('anula el vigente, registra la reversión y publica después del commit', async () => {
    const { service, tx, bitacora, notifications } = setup();
    tx.ajusteHoraTarea.findFirst.mockResolvedValueOnce(ajuste());

    await service.revert(PROJECT_ID, SPRINT_ID, ASSIGNMENT_ID, ACTOR_ID);

    expect(tx.ajusteHoraTarea.updateMany).toHaveBeenCalledWith({
      where: { idAjusteHora: 100, anuladoEn: null },
      data: { anuladoEn: expect.any(Date), anuladoPor: ACTOR_ID },
    });
    expect(bitacora.registrarEvento).toHaveBeenCalledWith(
      expect.objectContaining({
        tipoEvento: TipoEventoBitacora.TASK_HOURS_ADJUSTMENT_REVERTED,
        idEntidad: TASK_ID,
        valorAnterior: expect.objectContaining({ idAjusteHora: 100 }),
        valorNuevo: null,
      }),
    );
    expect(notifications.notifySprintHoursAdjusted).toHaveBeenCalledTimes(1);
  });

  it('si otra conexión anuló primero (CAS perdido) no emite un segundo evento', async () => {
    const { service, tx, bitacora, notifications } = setup();
    tx.ajusteHoraTarea.findFirst.mockResolvedValueOnce(ajuste());
    tx.ajusteHoraTarea.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.revert(PROJECT_ID, SPRINT_ID, ASSIGNMENT_ID, ACTOR_ID)).resolves.toBeUndefined();
    expect(bitacora.registrarEvento).not.toHaveBeenCalled();
    expect(notifications.notifySprintHoursAdjusted).not.toHaveBeenCalled();
  });

  it('funciona sin servicio de bitácora', async () => {
    const { service, tx, notifications } = setup({ withBitacora: false });
    tx.ajusteHoraTarea.findFirst.mockResolvedValueOnce(ajuste());

    await service.revert(PROJECT_ID, SPRINT_ID, ASSIGNMENT_ID, ACTOR_ID);
    expect(notifications.notifySprintHoursAdjusted).toHaveBeenCalledTimes(1);
  });
});

describe('TaskHourAdjustmentsService.history', () => {
  it('exige lectura del scope horas sobre el sprint antes de consultar', async () => {
    const { service, readPolicy, prisma } = setup();
    readPolicy.assertRead.mockRejectedValueOnce(new ForbiddenException());

    await expect(service.history(PROJECT_ID, SPRINT_ID, ASSIGNMENT_ID, ACTOR_ID)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(readPolicy.assertRead).toHaveBeenCalledWith(undefined, {
      projectId: PROJECT_ID,
      actorId: ACTOR_ID,
      scope: 'horas',
      entitySprintId: SPRINT_ID,
    });
    expect(prisma.ajusteHoraTarea.findMany).not.toHaveBeenCalled();
  });

  it('devuelve la cadena completa, anulados incluidos, en orden de creación', async () => {
    const { service, prisma } = setup();
    const anuladoEn = new Date('2026-10-03T00:00:00Z');
    prisma.ajusteHoraTarea.findMany.mockResolvedValueOnce([
      ajuste({ anuladoEn, anuladoPor: ACTOR_ID }),
      ajuste({ idAjusteHora: 101, deltaHoras: decimal('-0.25'), idAjusteAnterior: 100 }),
    ]);

    const result = await service.history(PROJECT_ID, SPRINT_ID, ASSIGNMENT_ID, ACTOR_ID);

    expect(prisma.ajusteHoraTarea.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          idAsignacion: ASSIGNMENT_ID,
          asignacion: { tarea: { idProyecto: PROJECT_ID, idSprint: SPRINT_ID } },
        },
        orderBy: { idAjusteHora: 'asc' },
      }),
    );
    expect(result.map((row) => [row.idAjusteHora, row.vigente, row.propuesta])).toEqual([
      [100, false, '6.50'],
      [101, true, '4.75'],
    ]);
  });
});
