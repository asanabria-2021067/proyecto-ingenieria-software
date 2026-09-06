import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import { cleanupTimeFixture, timeLifecycleFixture, timeStack } from './setup/time-records';
import type { IntegrationCleanupScope } from './setup/cleanup';

/**
 * Los contratos de §9 se distinguen por su código HTTP (403 al ajeno, 409 al
 * tramo consumido o al registro ya revocado), así que la prueba exige el
 * estado exacto en vez de un rechazo genérico, y devuelve el cuerpo para
 * poder verificar el código estable del conflicto.
 */
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

describeIntegration('S7 time lifecycle', () => {
  let db: PrismaClient;
  let scope: IntegrationCleanupScope;
  beforeAll(async () => { db = createIntegrationPrismaClient(); await db.$connect(); });
  beforeEach(() => { scope = {}; });
  afterEach(async () => { vi.restoreAllMocks(); await cleanupTimeFixture(db, scope); });
  afterAll(async () => { await db.$disconnect(); });

  it('T04: el propietario edita su tramo cerrado no consumido tras la reasignación y solo cambia su propia caché', async () => {
    const f = await timeLifecycleFixture(db, scope);
    const { service } = timeStack(db);

    const resultado = await service.update(
      f.project.idProyecto,
      f.task.idTarea,
      f.ownerRecord.idRegistroTiempo,
      f.owner.idUsuario,
      { horas: 3.5, fecha: '2026-08-31', nota: null },
    );

    expect(resultado.horas).toBe(3.5);
    expect(resultado.fecha).toBe('2026-08-31');
    expect(resultado.nota).toBeNull();

    const registro = await db.registroTiempoTarea.findUniqueOrThrow({
      where: { idRegistroTiempo: f.ownerRecord.idRegistroTiempo },
    });
    expect(registro.horas.toFixed(2)).toBe('3.50');
    expect(registro.fecha.toISOString().slice(0, 10)).toBe('2026-08-31');
    expect(registro.nota).toBeNull();
    // La justificación histórica se conserva aunque el DTO no la mencione.
    expect(registro.justificacionExceso).toBe('justificación histórica del cruce');
    expect(registro.editadoEn).not.toBeNull();
    expect(registro.revocadoEn).toBeNull();
    // Campos que el DTO nunca puede tocar.
    expect(registro.idAsignacion).toBe(f.closed.idAsignacion);
    expect(registro.idUsuario).toBe(f.owner.idUsuario);

    const tramoA = await db.asignacionTarea.findUniqueOrThrow({ where: { idAsignacion: f.closed.idAsignacion } });
    expect(tramoA.horasReales?.toFixed(2)).toBe('3.50');
    // El tramo no se reabre ni se mueve su cierre.
    expect(tramoA.desasignadaEn?.toISOString()).toBe(f.closedAt.toISOString());
    expect(tramoA.reconocidoEn).toBeNull();

    const tramoB = await db.asignacionTarea.findUniqueOrThrow({ where: { idAsignacion: f.open.idAsignacion } });
    expect(tramoB.horasReales?.toFixed(2)).toBe('4.00');
    expect(tramoB.desasignadaEn).toBeNull();

    const eventos = await db.bitacoraAuditoria.findMany({
      where: { idUsuario: f.owner.idUsuario, accion: 'TIME_RECORD_EDITED' },
    });
    expect(eventos).toHaveLength(1);
    const detalle = eventos[0].detalleJson as {
      valorAnterior: Record<string, unknown>;
      valorNuevo: Record<string, unknown>;
    };
    expect(detalle.valorAnterior).toMatchObject({
      idRegistroTiempo: f.ownerRecord.idRegistroTiempo,
      horas: '2.00',
      fecha: '2026-08-30',
      nota: 'nota original del autor',
      justificacionExceso: 'justificación histórica del cruce',
      editadoEn: null,
    });
    expect(detalle.valorNuevo).toMatchObject({
      idRegistroTiempo: f.ownerRecord.idRegistroTiempo,
      horas: '3.50',
      fecha: '2026-08-31',
      nota: null,
      justificacionExceso: 'justificación histórica del cruce',
    });
    expect(detalle.valorNuevo.editadoEn).not.toBeNull();
  });

  it('T05-A: un autor distinto no puede editar ni revocar, y la segunda revocación del propio autor devuelve 409 sin nuevo evento', async () => {
    const f = await timeLifecycleFixture(db, scope);
    const { service, realtime } = timeStack(db);
    const antes = await db.registroTiempoTarea.findUniqueOrThrow({
      where: { idRegistroTiempo: f.ownerRecord.idRegistroTiempo },
    });

    await expectStatus(403, () =>
      service.update(f.project.idProyecto, f.task.idTarea, f.ownerRecord.idRegistroTiempo, f.successor.idUsuario, {
        horas: 9,
      }),
    );
    await expectStatus(403, () =>
      service.revoke(f.project.idProyecto, f.task.idTarea, f.ownerRecord.idRegistroTiempo, f.successor.idUsuario),
    );

    // Cero escrituras por el intento ajeno.
    expect(await db.registroTiempoTarea.findUniqueOrThrow({ where: { idRegistroTiempo: antes.idRegistroTiempo } })).toEqual(antes);
    expect(await db.bitacoraAuditoria.count({ where: { idUsuario: f.successor.idUsuario } })).toBe(0);
    expect(realtime).not.toHaveBeenCalled();

    await service.revoke(f.project.idProyecto, f.task.idTarea, f.ownerRecord.idRegistroTiempo, f.owner.idUsuario);

    const revocado = await db.registroTiempoTarea.findUniqueOrThrow({
      where: { idRegistroTiempo: f.ownerRecord.idRegistroTiempo },
    });
    expect(revocado.revocadoEn).not.toBeNull();
    expect(revocado.revocadoPor).toBe(f.owner.idUsuario);
    // La evidencia se conserva íntegra: la revocación no borra el importe.
    expect(revocado.horas.toFixed(2)).toBe(antes.horas.toFixed(2));
    expect(revocado.fecha.toISOString()).toBe(antes.fecha.toISOString());
    expect(revocado.nota).toBe(antes.nota);
    expect(revocado.justificacionExceso).toBe(antes.justificacionExceso);

    // Excluido del SUM efectivo, sin reabrir el tramo.
    const tramoA = await db.asignacionTarea.findUniqueOrThrow({ where: { idAsignacion: f.closed.idAsignacion } });
    expect(tramoA.horasReales?.toFixed(2)).toBe('0.00');
    expect(tramoA.desasignadaEn?.toISOString()).toBe(f.closedAt.toISOString());
    const tramoB = await db.asignacionTarea.findUniqueOrThrow({ where: { idAsignacion: f.open.idAsignacion } });
    expect(tramoB.horasReales?.toFixed(2)).toBe('4.00');

    const cuerpo = await expectStatus(409, () =>
      service.revoke(f.project.idProyecto, f.task.idTarea, f.ownerRecord.idRegistroTiempo, f.owner.idUsuario),
    );
    expect(cuerpo).toMatchObject({ code: 'REGISTRO_YA_REVOCADO' });

    // Un solo evento de revocación y ningún DELETE físico.
    expect(await db.bitacoraAuditoria.count({ where: { idUsuario: f.owner.idUsuario, accion: 'TIME_RECORD_REVOKED' } })).toBe(1);
    expect(await db.registroTiempoTarea.count({ where: { idAsignacion: f.closed.idAsignacion } })).toBe(1);
    expect(realtime).toHaveBeenCalledTimes(1);
  });
});
