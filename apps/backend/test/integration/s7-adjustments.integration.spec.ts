import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import { adjustmentFixture, adjustmentsStack, cleanupAdjustmentFixture } from './setup/adjustments';
import type { IntegrationCleanupScope } from './setup/cleanup';

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
});
