import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { Prisma, type PrismaClient } from '@prisma/client';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import { createBarrier, useSecondClient, withDeadline } from './setup/concurrency';
import { cleanupTimeFixture, timeFixture, timeStack } from './setup/time-records';
import type { IntegrationCleanupScope } from './setup/cleanup';

describeIntegration('S7 time concurrency', () => {
  let db: PrismaClient;
  let scope: IntegrationCleanupScope;
  const second = useSecondClient();
  beforeAll(async () => { db = createIntegrationPrismaClient(); await db.$connect(); });
  beforeEach(() => { scope = {}; });
  afterEach(async () => { vi.restoreAllMocks(); await cleanupTimeFixture(db, scope); });
  afterAll(async () => { await db.$disconnect(); });

  it('T01: dos altas concurrentes conservan ambos registros y la suma completa', async () => {
    const f = await timeFixture(db, scope);
    await db.proyecto.update({ where: { idProyecto: f.project.idProyecto }, data: { fechaActualizacion: new Date('2026-01-01') } });
    const a = timeStack(db);
    const b = timeStack(second());
    const entered = createBarrier(1);
    const release = createBarrier(1);
    const competing = createBarrier(1);
    const timestamps: string[] = [];
    const stamp = async (tx: Prisma.TransactionClient) => {
      const rows = await tx.$queryRaw<Array<{ value: string }>>`
        SELECT extract(epoch from fecha_actualizacion)::text AS value
        FROM proyecto WHERE id_proyecto = ${f.project.idProyecto}`;
      return rows[0].value;
    };
    const before = await stamp(db);
    const originalRead = a.context.assertActiveProjectParticipant.bind(a.context);
    vi.spyOn(a.context, 'assertActiveProjectParticipant').mockImplementation(async (...args) => {
      await originalRead(...args);
      await entered.arrive();
      await withDeadline(release.wait(), 8000, 'liberar primera alta');
    });
    const lockB = b.runner.lockProjectTx.bind(b.runner);
    vi.spyOn(b.runner, 'lockProjectTx').mockImplementation(async (...args) => {
      await competing.arrive();
      return lockB(...args);
    });
    for (const stack of [a, b]) {
      const originalAudit = stack.audit.registrarEvento.bind(stack.audit);
      vi.spyOn(stack.audit, 'registrarEvento').mockImplementation(async (input) => {
        await originalAudit(input);
        const cache = await input.tx.asignacionTarea.findUniqueOrThrow({ where: { idAsignacion: f.assignment.idAsignacion } });
        const sum = await input.tx.registroTiempoTarea.aggregate({ where: { idAsignacion: f.assignment.idAsignacion, revocadoEn: null }, _sum: { horas: true } });
        expect(cache.horasReales?.equals(sum._sum.horas!)).toBe(true);
        timestamps.push(await stamp(input.tx));
      });
    }
    const first = a.service.create(f.project.idProyecto, f.task.idTarea, f.owner.idUsuario, { horas: 3.25, fecha: '2026-09-06' });
    let next: ReturnType<typeof b.service.create> | undefined;
    try {
      await withDeadline(entered.wait(), 8000, 'reads internos');
      next = b.service.create(f.project.idProyecto, f.task.idTarea, f.owner.idUsuario, { horas: 1.75, fecha: '2026-09-06' });
      await withDeadline(competing.wait(), 8000, 'segunda conexión');
      expect(await second().registroTiempoTarea.count({ where: { idAsignacion: f.assignment.idAsignacion } })).toBe(0);
      expect((await second().asignacionTarea.findUniqueOrThrow({ where: { idAsignacion: f.assignment.idAsignacion } })).horasReales).toBeNull();
    } finally {
      await release.arrive();
      await withDeadline(Promise.all([first, next]), 10000, 'altas completas');
    }
    expect(await db.registroTiempoTarea.count({ where: { idAsignacion: f.assignment.idAsignacion } })).toBe(2);
    expect((await db.asignacionTarea.findUniqueOrThrow({ where: { idAsignacion: f.assignment.idAsignacion } })).horasReales?.toFixed(2)).toBe('5.00');
    expect(await db.bitacoraAuditoria.count({ where: { idUsuario: f.owner.idUsuario, accion: 'TASK_HOURS_LOGGED' } })).toBe(2);
    expect(timestamps).toHaveLength(2);
    expect(new Prisma.Decimal(timestamps[0]).gt(before)).toBe(true);
    expect(new Prisma.Decimal(timestamps[1]).gt(timestamps[0])).toBe(true);
    expect(a.realtime).toHaveBeenCalledTimes(1);
    expect(b.realtime).toHaveBeenCalledTimes(1);
  });
});
