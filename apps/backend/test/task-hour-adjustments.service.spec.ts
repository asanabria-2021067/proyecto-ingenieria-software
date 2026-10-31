import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TaskHourAdjustmentsService } from '../src/task-hour-adjustments/task-hour-adjustments.service';
import { TipoEventoBitacora } from '../src/bitacora/tipos-evento-bitacora';

const D = (v: string | number) => new Prisma.Decimal(v);

function ajuste(over: Record<string, unknown> = {}) {
  return {
    idAjusteHora: 10,
    idAsignacion: 7,
    deltaHoras: D('1.50'),
    horasBase: D('4'),
    justificacion: 'ok',
    idAutor: 1,
    creadoEn: new Date('2026-01-01T00:00:00Z'),
    anuladoEn: null,
    anuladoPor: null,
    idAjusteAnterior: null,
    ...over,
  };
}

function tramo(over: Record<string, unknown> = {}) {
  return {
    idAsignacion: 7,
    idTarea: 99,
    idParticipacion: 5,
    desasignadaEn: new Date('2026-01-01'),
    horasReales: D('4'),
    reconocidoEn: null,
    origenReporte: 'MANUAL',
    ...over,
  };
}

function setup() {
  const tx = {
    asignacionTarea: { findFirst: vi.fn().mockResolvedValue(tramo()) },
    ajusteHoraTarea: {
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockImplementation(async ({ data }) =>
        ajuste({ idAjusteHora: 11, deltaHoras: data.deltaHoras, horasBase: data.horasBase, justificacion: data.justificacion, idAutor: data.idAutor, idAjusteAnterior: data.idAjusteAnterior }),
      ),
    },
  };
  const effects: Array<{ key?: string; publish: () => unknown }> = [];
  const ctxProject = { idProyecto: 1, creadoPor: 1, estadoProyecto: 'EN_PROGRESO', eliminadoEn: null };
  let project: unknown = ctxProject;
  const projectTx = {
    run: vi.fn(async (_p: number, _a: number, _op: string, cb: (c: unknown) => unknown) =>
      cb({ tx, project, effects: { add: (e: { key?: string; publish: () => unknown }) => effects.push(e) } }),
    ),
  };
  const policy = { assertWriteTx: vi.fn().mockResolvedValue(undefined) };
  const readPolicy = { assertRead: vi.fn().mockResolvedValue(undefined) };
  const prisma = { ajusteHoraTarea: { findMany: vi.fn().mockResolvedValue([]) } };
  const notifications = { notifySprintHoursAdjusted: vi.fn().mockResolvedValue(undefined) };
  const bitacora = { registrarEvento: vi.fn().mockResolvedValue(undefined) };
  const svc = new TaskHourAdjustmentsService(
    prisma as never, projectTx as never, policy as never, readPolicy as never, notifications as never, bitacora as never,
  );
  return { svc, tx, effects, policy, readPolicy, prisma, notifications, bitacora, setProject: (p: unknown) => { project = p; } };
}

describe('TaskHourAdjustmentsService.upsert', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => { s = setup(); });

  it('crea el primer ajuste: base + delta, bitacora y efecto realtime', async () => {
    const out = await s.svc.upsert(1, 2, 7, 1, { deltaHoras: 1.5, justificacion: '  motivo  ' } as never);
    expect(s.policy.assertWriteTx).toHaveBeenCalledWith(s.tx, expect.anything(), 'AJUSTE_HORA', 1, { sprintId: 2 });
    expect(out).toMatchObject({ deltaHoras: '1.50', horasBase: '4.00', propuesta: '5.50', justificacion: 'motivo', vigente: true, idAjusteAnterior: null });
    expect(s.tx.ajusteHoraTarea.updateMany).not.toHaveBeenCalled();
    expect(s.bitacora.registrarEvento).toHaveBeenCalledWith(expect.objectContaining({
      tipoEvento: TipoEventoBitacora.TASK_HOURS_ADJUSTED, idEntidad: 99, valorAnterior: null,
    }));
    expect(s.effects).toHaveLength(1);
    await s.effects[0].publish();
    expect(s.notifications.notifySprintHoursAdjusted).toHaveBeenCalledWith(1, 1, { projectId: 1, sprintId: 2, idAsignacion: 7 });
  });

  it('delta cero no exige justificacion y guarda null', async () => {
    const out = await s.svc.upsert(1, 2, 7, 1, { deltaHoras: 0 } as never);
    expect(out.deltaHoras).toBe('0.00');
    expect(out.justificacion).toBeNull();
  });

  it('delta distinto de cero sin justificacion (o solo espacios) -> 400', async () => {
    await expect(s.svc.upsert(1, 2, 7, 1, { deltaHoras: 1 } as never)).rejects.toBeInstanceOf(BadRequestException);
    await expect(s.svc.upsert(1, 2, 7, 1, { deltaHoras: -1, justificacion: '   ' } as never)).rejects.toBeInstanceOf(BadRequestException);
    expect(s.tx.ajusteHoraTarea.create).not.toHaveBeenCalled();
  });

  it('limite: propuesta exactamente 0 es valida; menor que 0 es 400', async () => {
    const ok = await s.svc.upsert(1, 2, 7, 1, { deltaHoras: -4, justificacion: 'x' } as never);
    expect(ok.propuesta).toBe('0.00');
    await expect(s.svc.upsert(1, 2, 7, 1, { deltaHoras: '-4.01', justificacion: 'x' } as never)).rejects.toThrow('negativo');
  });

  it('usa aritmetica Decimal sin error de flotante', async () => {
    s.tx.asignacionTarea.findFirst.mockResolvedValue(tramo({ horasReales: D('0.1') }));
    const out = await s.svc.upsert(1, 2, 7, 1, { deltaHoras: '0.2', justificacion: 'x' } as never);
    expect(out.propuesta).toBe('0.30');
  });

  it('es idempotente si el vigente es identico: sin fila nueva, sin evento', async () => {
    s.tx.ajusteHoraTarea.findFirst.mockResolvedValue(ajuste());
    const out = await s.svc.upsert(1, 2, 7, 1, { deltaHoras: 1.5, justificacion: 'ok' } as never);
    expect(out.idAjusteHora).toBe(10);
    expect(s.tx.ajusteHoraTarea.create).not.toHaveBeenCalled();
    expect(s.tx.ajusteHoraTarea.updateMany).not.toHaveBeenCalled();
    expect(s.bitacora.registrarEvento).not.toHaveBeenCalled();
    expect(s.effects).toHaveLength(0);
  });

  it('corregir anula el vigente y crea sucesor enlazado, con valorAnterior', async () => {
    s.tx.ajusteHoraTarea.findFirst.mockResolvedValue(ajuste());
    const out = await s.svc.upsert(1, 2, 7, 3, { deltaHoras: 2, justificacion: 'ok' } as never);
    expect(s.tx.ajusteHoraTarea.updateMany).toHaveBeenCalledWith({
      where: { idAjusteHora: 10, anuladoEn: null },
      data: { anuladoEn: expect.any(Date), anuladoPor: 3 },
    });
    expect(out).toMatchObject({ idAjusteAnterior: 10, idAutor: 3, propuesta: '6.00' });
    const evt = s.bitacora.registrarEvento.mock.calls[0][0];
    expect(evt.valorAnterior).toMatchObject({ idAjusteHora: 10, vigente: true });
    expect(typeof evt.valorNuevo.creadoEn).toBe('string');
  });

  it('cambia solo la base (reporte nuevo) tambien crea sucesor', async () => {
    s.tx.ajusteHoraTarea.findFirst.mockResolvedValue(ajuste({ horasBase: D('3') }));
    await s.svc.upsert(1, 2, 7, 1, { deltaHoras: 1.5, justificacion: 'ok' } as never);
    expect(s.tx.ajusteHoraTarea.create).toHaveBeenCalled();
  });

  it('CAS perdido al anular -> 409 AJUSTE_DESACTUALIZADO', async () => {
    s.tx.ajusteHoraTarea.findFirst.mockResolvedValue(ajuste());
    s.tx.ajusteHoraTarea.updateMany.mockResolvedValue({ count: 0 });
    const err = await s.svc.upsert(1, 2, 7, 1, { deltaHoras: 2, justificacion: 'ok' } as never).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ code: 'AJUSTE_DESACTUALIZADO' });
    expect(s.tx.ajusteHoraTarea.create).not.toHaveBeenCalled();
  });

  it('P2002 en create -> 409; otro error se propaga tal cual', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });
    s.tx.ajusteHoraTarea.create.mockRejectedValueOnce(p2002);
    const err = await s.svc.upsert(1, 2, 7, 1, { deltaHoras: 2, justificacion: 'ok' } as never).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ code: 'AJUSTE_DESACTUALIZADO' });
    const boom = new Error('boom');
    s.tx.ajusteHoraTarea.create.mockRejectedValueOnce(boom);
    await expect(s.svc.upsert(1, 2, 7, 1, { deltaHoras: 2, justificacion: 'ok' } as never)).rejects.toBe(boom);
  });

  it('si la politica rechaza, no se escribe nada', async () => {
    s.policy.assertWriteTx.mockRejectedValue(new ForbiddenException('no autorizado'));
    await expect(s.svc.upsert(1, 2, 7, 55, { deltaHoras: 2, justificacion: 'ok' } as never)).rejects.toBeInstanceOf(ForbiddenException);
    expect(s.tx.asignacionTarea.findFirst).not.toHaveBeenCalled();
    expect(s.tx.ajusteHoraTarea.create).not.toHaveBeenCalled();
  });

  it('proyecto no bloqueado -> 404', async () => {
    s.setProject(undefined);
    await expect(s.svc.upsert(1, 2, 7, 1, { deltaHoras: 0 } as never)).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    ['tramo inexistente / de otro sprint', null, NotFoundException],
    ['tramo abierto', tramo({ desasignadaEn: null }), ConflictException],
    ['sin reporte materializado', tramo({ horasReales: null }), ConflictException],
    ['sin participacion historica', tramo({ idParticipacion: null }), ConflictException],
    ['tramo consumido', tramo({ reconocidoEn: new Date() }), ConflictException],
  ])('estado invalido: %s', async (_n, row, errType) => {
    s.tx.asignacionTarea.findFirst.mockResolvedValue(row);
    await expect(s.svc.upsert(1, 2, 7, 1, { deltaHoras: 0 } as never)).rejects.toBeInstanceOf(errType);
    expect(s.tx.ajusteHoraTarea.create).not.toHaveBeenCalled();
  });

  it('funciona sin servicio de bitacora', async () => {
    const x = new TaskHourAdjustmentsService(s.prisma as never, { run: (_a: number, _b: number, _c: string, cb: (c: unknown) => unknown) => cb({ tx: s.tx, project: { idProyecto: 1 }, effects: { add: vi.fn() } }) } as never, s.policy as never, s.readPolicy as never, s.notifications as never);
    await expect(x.upsert(1, 2, 7, 1, { deltaHoras: 0 } as never)).resolves.toMatchObject({ vigente: true });
  });

  it('un fallo de la notificacion post-commit se loguea y no se propaga', async () => {
    s.notifications.notifySprintHoursAdjusted.mockRejectedValue(new Error('ws caido'));
    await s.svc.upsert(1, 2, 7, 1, { deltaHoras: 0 } as never);
    await expect(s.effects[0].publish()).resolves.toBeUndefined();
  });
});

describe('TaskHourAdjustmentsService.revert', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => { s = setup(); });

  it('anula el vigente, registra evento y efecto', async () => {
    s.tx.ajusteHoraTarea.findFirst.mockResolvedValue(ajuste());
    await s.svc.revert(1, 2, 7, 4);
    expect(s.tx.ajusteHoraTarea.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { anuladoEn: expect.any(Date), anuladoPor: 4 } }));
    expect(s.bitacora.registrarEvento).toHaveBeenCalledWith(expect.objectContaining({
      tipoEvento: TipoEventoBitacora.TASK_HOURS_ADJUSTMENT_REVERTED, valorNuevo: null,
    }));
    expect(s.effects).toHaveLength(1);
  });

  it('sin vigente: no-op sin evento', async () => {
    await s.svc.revert(1, 2, 7, 4);
    expect(s.tx.ajusteHoraTarea.updateMany).not.toHaveBeenCalled();
    expect(s.bitacora.registrarEvento).not.toHaveBeenCalled();
    expect(s.effects).toHaveLength(0);
  });

  it('CAS perdido: no-op sin evento', async () => {
    s.tx.ajusteHoraTarea.findFirst.mockResolvedValue(ajuste());
    s.tx.ajusteHoraTarea.updateMany.mockResolvedValue({ count: 0 });
    await s.svc.revert(1, 2, 7, 4);
    expect(s.bitacora.registrarEvento).not.toHaveBeenCalled();
    expect(s.effects).toHaveLength(0);
  });

  it('permiso denegado y tramo consumido propagan el error', async () => {
    s.policy.assertWriteTx.mockRejectedValueOnce(new ForbiddenException());
    await expect(s.svc.revert(1, 2, 7, 9)).rejects.toBeInstanceOf(ForbiddenException);
    s.tx.asignacionTarea.findFirst.mockResolvedValue(tramo({ reconocidoEn: new Date() }));
    await expect(s.svc.revert(1, 2, 7, 1)).rejects.toBeInstanceOf(ConflictException);
  });

  it('proyecto ausente -> 404', async () => {
    s.setProject(null);
    await expect(s.svc.revert(1, 2, 7, 1)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('TaskHourAdjustmentsService.history', () => {
  it('valida lectura con scope horas y mapea anulados como no vigentes', async () => {
    const s = setup();
    s.prisma.ajusteHoraTarea.findMany.mockResolvedValue([
      ajuste({ anuladoEn: new Date('2026-02-01'), anuladoPor: 2 }),
      ajuste({ idAjusteHora: 11, idAjusteAnterior: 10, deltaHoras: D('-1') }),
    ]);
    const out = await s.svc.history(1, 2, 7, 5);
    expect(s.readPolicy.assertRead).toHaveBeenCalledWith(undefined, { projectId: 1, actorId: 5, scope: 'horas', entitySprintId: 2 });
    expect(out.map((o) => o.vigente)).toEqual([false, true]);
    expect(out[1]).toMatchObject({ deltaHoras: '-1.00', propuesta: '3.00' });
  });

  it('lectura denegada no consulta filas', async () => {
    const s = setup();
    s.readPolicy.assertRead.mockRejectedValue(new ForbiddenException());
    await expect(s.svc.history(1, 2, 7, 5)).rejects.toBeInstanceOf(ForbiddenException);
    expect(s.prisma.ajusteHoraTarea.findMany).not.toHaveBeenCalled();
  });
});
