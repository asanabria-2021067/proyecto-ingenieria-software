import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import { createBarrier, useSecondClient, withDeadline } from './setup/concurrency';
import { adjustmentFixture, adjustmentsStack, cleanupAdjustmentFixture } from './setup/adjustments';
import type { IntegrationCleanupScope } from './setup/cleanup';
import { ProjectHoursSummaryService } from '../../src/sprints/project-hours-summary.service';
import type { PrismaService } from '../../src/prisma/prisma.service';

async function expectStatus(status: number, fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof HttpException && error.getStatus() === status) {
      return error.getResponse();
    }
    throw new Error(
      `Se esperaba HTTP ${status} pero la operación falló con: ${
        error instanceof HttpException ? `HTTP ${error.getStatus()}` : String(error)
      }`,
    );
  }
  throw new Error(`Se esperaba HTTP ${status} pero la operación se resolvió sin error.`);
}

describeIntegration('S7 ajustes de horas del líder', () => {
  let db: PrismaClient;
  let scope: IntegrationCleanupScope;
  const second = useSecondClient();
  beforeAll(async () => { db = createIntegrationPrismaClient(); await db.$connect(); });
  beforeEach(() => { scope = {}; });
  afterEach(async () => { vi.restoreAllMocks(); await cleanupAdjustmentFixture(db, scope); });
  afterAll(async () => { await db.$disconnect(); });

  it('T07-A: corregir un ajuste anula el vigente, crea el sucesor y el historial devuelve la cadena completa', async () => {
    const f = await adjustmentFixture(db, scope);
    const { service, realtime } = adjustmentsStack(db);

    const primero = await service.upsert(f.project.idProyecto, f.sprint.idSprint, f.assignment.idAsignacion, f.leader.idUsuario, {
      deltaHoras: '-1.50',
      justificacion: 'reporte por encima de lo verificado',
    });
    expect(primero.horasBase).toBe('6.00');
    expect(primero.deltaHoras).toBe('-1.50');
    expect(primero.propuesta).toBe('4.50');
    expect(primero.vigente).toBe(true);
    expect(primero.idAjusteAnterior).toBeNull();

    // Mismo delta y misma justificación: no-op sin fila nueva y sin evento.
    const repetido = await service.upsert(f.project.idProyecto, f.sprint.idSprint, f.assignment.idAsignacion, f.leader.idUsuario, {
      deltaHoras: '-1.50',
      justificacion: 'reporte por encima de lo verificado',
    });
    expect(repetido.idAjusteHora).toBe(primero.idAjusteHora);
    expect(await db.ajusteHoraTarea.count({ where: { idAsignacion: f.assignment.idAsignacion } })).toBe(1);

    // Corrección: anula el vigente y crea el sucesor enlazado.
    const sucesor = await service.upsert(f.project.idProyecto, f.sprint.idSprint, f.assignment.idAsignacion, f.leader.idUsuario, {
      deltaHoras: '+2.00',
      justificacion: 'horas verificadas de más',
    });
    expect(sucesor.idAjusteAnterior).toBe(primero.idAjusteHora);
    expect(sucesor.propuesta).toBe('8.00');
    expect(
      await db.ajusteHoraTarea.count({ where: { idAsignacion: f.assignment.idAsignacion, anuladoEn: null } }),
    ).toBe(1);

    const anulado = await db.ajusteHoraTarea.findUniqueOrThrow({ where: { idAjusteHora: primero.idAjusteHora } });
    // El anterior es inmutable en importe, base, justificación y autor.
    expect(anulado.deltaHoras.toFixed(2)).toBe('-1.50');
    expect(anulado.horasBase.toFixed(2)).toBe('6.00');
    expect(anulado.justificacion).toBe('reporte por encima de lo verificado');
    expect(anulado.idAutor).toBe(f.leader.idUsuario);
    expect(anulado.anuladoPor).toBe(f.leader.idUsuario);

    const historial = await service.history(f.project.idProyecto, f.sprint.idSprint, f.assignment.idAsignacion, f.leader.idUsuario);
    expect(historial).toHaveLength(2);
    expect(historial.map((a) => a.idAjusteHora)).toEqual([primero.idAjusteHora, sucesor.idAjusteHora]);
    expect(historial.map((a) => a.vigente)).toEqual([false, true]);
    expect(historial.every((a) => a.idAutor === f.leader.idUsuario)).toBe(true);

    // El reporte del integrante nunca se toca: el ajuste solo compone la propuesta.
    const tramo = await db.asignacionTarea.findUniqueOrThrow({ where: { idAsignacion: f.assignment.idAsignacion } });
    expect(tramo.horasReales?.toFixed(2)).toBe('6.00');

    // Ni el propietario del tramo ni un participante ajeno pueden ajustar.
    for (const actor of [f.owner.idUsuario, f.outsider.idUsuario]) {
      await expectStatus(403, () =>
        service.upsert(f.project.idProyecto, f.sprint.idSprint, f.assignment.idAsignacion, actor, {
          deltaHoras: '+1.00',
          justificacion: 'intento no autorizado',
        }),
      );
    }
    expect(await db.ajusteHoraTarea.count({ where: { idAsignacion: f.assignment.idAsignacion } })).toBe(2);

    // Dos eventos, no tres: el no-op no emitió ninguno.
    expect(
      await db.bitacoraAuditoria.count({ where: { idUsuario: f.leader.idUsuario, accion: 'TASK_HOURS_ADJUSTED' } }),
    ).toBe(2);
    expect(realtime).toHaveBeenCalledTimes(2);
  });

  it('T07-B: revertir anula el ajuste vigente y dejar el tramo sin vigente responde 204 sin evento', async () => {
    const f = await adjustmentFixture(db, scope);
    const { service, realtime } = adjustmentsStack(db);
    const vigente = await service.upsert(f.project.idProyecto, f.sprint.idSprint, f.assignment.idAsignacion, f.leader.idUsuario, {
      deltaHoras: '-1.50',
      justificacion: 'reporte por encima de lo verificado',
    });
    const eventosPrevios = await db.bitacoraAuditoria.count({
      where: { idUsuario: f.leader.idUsuario, accion: 'TASK_HOURS_ADJUSTMENT_REVERTED' },
    });
    expect(eventosPrevios).toBe(0);
    realtime.mockClear();

    await service.revert(f.project.idProyecto, f.sprint.idSprint, f.assignment.idAsignacion, f.leader.idUsuario);

    const anulado = await db.ajusteHoraTarea.findUniqueOrThrow({ where: { idAjusteHora: vigente.idAjusteHora } });
    expect(anulado.anuladoEn).not.toBeNull();
    expect(anulado.anuladoPor).toBe(f.leader.idUsuario);
    expect(await db.ajusteHoraTarea.count({ where: { idAsignacion: f.assignment.idAsignacion, anuladoEn: null } })).toBe(0);

    // Sin vigente, la propuesta del tramo vuelve a ser exactamente la caché reportada.
    const resumen = new ProjectHoursSummaryService(db as unknown as PrismaService);
    const detalle = await resumen.sprintMemberDetail(undefined, { sprintId: f.sprint.idSprint, userId: f.owner.idUsuario });
    const tramo = detalle.tramos.find((t) => t.idAsignacion === f.assignment.idAsignacion)!;
    expect(tramo.cache).toBe('6.00');
    expect(tramo.ajuste).toBeNull();
    expect(tramo.propuestas).toBe('6.00');

    expect(
      await db.bitacoraAuditoria.count({ where: { idUsuario: f.leader.idUsuario, accion: 'TASK_HOURS_ADJUSTMENT_REVERTED' } }),
    ).toBe(1);
    expect(realtime).toHaveBeenCalledTimes(1);

    // Segunda reversión: sin vigente que anular, ni evento ni filas nuevas.
    realtime.mockClear();
    await service.revert(f.project.idProyecto, f.sprint.idSprint, f.assignment.idAsignacion, f.leader.idUsuario);
    expect(
      await db.bitacoraAuditoria.count({ where: { idUsuario: f.leader.idUsuario, accion: 'TASK_HOURS_ADJUSTMENT_REVERTED' } }),
    ).toBe(1);
    expect(await db.ajusteHoraTarea.count({ where: { idAsignacion: f.assignment.idAsignacion } })).toBe(1);
    expect(realtime).not.toHaveBeenCalled();

    // La cadena histórica conserva el ajuste anulado.
    const historial = await service.history(f.project.idProyecto, f.sprint.idSprint, f.assignment.idAsignacion, f.leader.idUsuario);
    expect(historial).toHaveLength(1);
    expect(historial[0].vigente).toBe(false);
    expect(historial[0].deltaHoras).toBe('-1.50');
  });

  it('T07-C: dos ajustes concurrentes sobre el mismo tramo dejan un único vigente', async () => {
    const f = await adjustmentFixture(db, scope);
    const a = adjustmentsStack(db);
    const b = adjustmentsStack(second());

    const entered = createBarrier(1);
    const release = createBarrier(1);
    const competing = createBarrier(1);
    // A queda retenida DESPUÉS de sus reads y de su escritura, antes de commitear.
    const originalAudit = a.audit.registrarEvento.bind(a.audit);
    vi.spyOn(a.audit, 'registrarEvento').mockImplementation(async (input) => {
      await originalAudit(input);
      await entered.arrive();
      await withDeadline(release.wait(), 8000, 'liberar el primer ajuste');
    });
    const lockB = b.runner.lockProjectTx.bind(b.runner);
    vi.spyOn(b.runner, 'lockProjectTx').mockImplementation(async (...args) => {
      await competing.arrive();
      return lockB(...args);
    });

    const primera = a.service.upsert(f.project.idProyecto, f.sprint.idSprint, f.assignment.idAsignacion, f.leader.idUsuario, {
      deltaHoras: '-1.50', justificacion: 'primera corrección',
    });
    let segunda: ReturnType<typeof b.service.upsert> | undefined;
    try {
      await withDeadline(entered.wait(), 8000, 'reads internos del primer ajuste');
      segunda = b.service.upsert(f.project.idProyecto, f.sprint.idSprint, f.assignment.idAsignacion, f.leader.idUsuario, {
        deltaHoras: '+2.00', justificacion: 'segunda corrección',
      });
      await withDeadline(competing.wait(), 8000, 'segunda conexión');
      // Mientras A no commitea, la segunda conexión no ve ningún ajuste.
      expect(await second().ajusteHoraTarea.count({ where: { idAsignacion: f.assignment.idAsignacion } })).toBe(0);
    } finally {
      await release.arrive();
    }

    const ganador = await withDeadline(primera, 10000, 'primer ajuste');
    let perdedorConflicto = false;
    let sucesor: Awaited<ReturnType<typeof b.service.upsert>> | undefined;
    try {
      sucesor = await withDeadline(segunda!, 10000, 'segundo ajuste');
    } catch (error) {
      if (!(error instanceof HttpException) || error.getStatus() !== 409) throw error;
      perdedorConflicto = true;
    }

    // Sea cual sea la rama, jamás hay dos vigentes.
    const vigentes = await db.ajusteHoraTarea.findMany({ where: { idAsignacion: f.assignment.idAsignacion, anuladoEn: null } });
    expect(vigentes).toHaveLength(1);
    const eventosAjuste = await db.bitacoraAuditoria.count({
      where: { idUsuario: f.leader.idUsuario, accion: 'TASK_HOURS_ADJUSTED' },
    });
    if (perdedorConflicto) {
      expect(vigentes[0].idAjusteHora).toBe(ganador.idAjusteHora);
      expect(eventosAjuste).toBe(1);
    } else {
      // La perdedora encadenó correctamente sobre la ganadora, sin duplicar vigencia.
      expect(sucesor!.idAjusteAnterior).toBe(ganador.idAjusteHora);
      expect(vigentes[0].idAjusteHora).toBe(sucesor!.idAjusteHora);
      expect(eventosAjuste).toBe(2);
    }

    vi.restoreAllMocks();

    // Doble reversión concurrente: una anula, la otra no encuentra vigente.
    const [, ] = await withDeadline(
      Promise.all([
        a.service.revert(f.project.idProyecto, f.sprint.idSprint, f.assignment.idAsignacion, f.leader.idUsuario),
        b.service.revert(f.project.idProyecto, f.sprint.idSprint, f.assignment.idAsignacion, f.leader.idUsuario),
      ]),
      15000,
      'reversiones concurrentes',
    );
    expect(await db.ajusteHoraTarea.count({ where: { idAsignacion: f.assignment.idAsignacion, anuladoEn: null } })).toBe(0);
    expect(
      await db.bitacoraAuditoria.count({ where: { idUsuario: f.leader.idUsuario, accion: 'TASK_HOURS_ADJUSTMENT_REVERTED' } }),
    ).toBe(1);
  });
});
