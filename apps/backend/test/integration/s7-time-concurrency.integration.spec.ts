import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { Prisma, type PrismaClient } from '@prisma/client';
import { HttpException } from '@nestjs/common';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import { createBarrier, useSecondClient, withDeadline } from './setup/concurrency';
import { cleanupTimeFixture, timeFixture, timeStack } from './setup/time-records';
import { cleanupRaceFixture, exitStack, raceFixture } from './setup/exit-flow';
import type { IntegrationCleanupScope } from './setup/cleanup';

describeIntegration('S7 time concurrency', () => {
  let db: PrismaClient;
  let scope: IntegrationCleanupScope;
  const second = useSecondClient();
  beforeAll(async () => { db = createIntegrationPrismaClient(); await db.$connect(); });
  let solicitudIds: number[];
  beforeEach(() => { scope = {}; solicitudIds = []; });
  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupRaceFixture(db, scope, solicitudIds);
    await cleanupTimeFixture(db, scope);
  });
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

  /**
   * C087–C090 (06 v2 §42/§47 T02-T03): las cuatro carreras entre el autor de
   * un registro y el consumo de su tramo por una salida aprobada. El lock del
   * proyecto impone un orden total; lo que se fija aquí es que AMBOS órdenes
   * producen un resultado coherente, nunca un agregado viejo junto a un
   * reporte nuevo ni una hora perdida o duplicada.
   *
   * `ganador` es la operación que se deja commitear primero; la otra entra
   * después de que su barrera se libera y encuentra el estado ya confirmado.
   */
  async function correrCarrera(
    fixture: Awaited<ReturnType<typeof raceFixture>>,
    ganador: 'autor' | 'consumo',
    operacionDelAutor: (stack: ReturnType<typeof timeStack>) => Promise<unknown>,
  ) {
    const autorStack = timeStack(db);
    const salida = exitStack(second());
    const entered = createBarrier(1);
    const release = createBarrier(1);

    const retener = ganador === 'autor' ? autorStack.audit : salida.audit;
    const originalAudit = retener.registrarEvento.bind(retener);
    vi.spyOn(retener, 'registrarEvento').mockImplementation(async (input) => {
      await originalAudit(input);
      await entered.arrive();
      await withDeadline(release.wait(), 8000, 'liberar a la operación ganadora');
    });

    const iniciarAutor = () => operacionDelAutor(autorStack);
    const iniciarConsumo = () =>
      salida.service.approveSolicitudSalida(fixture.project.idProyecto, fixture.solicitud.idSolicitud, fixture.leader.idUsuario);

    const primera = ganador === 'autor' ? iniciarAutor() : iniciarConsumo();
    primera.catch(() => undefined);
    await withDeadline(entered.wait(), 8000, 'escrituras internas de la ganadora');

    // La perdedora corre en la OTRA conexión física y se queda esperando el
    // lock del proyecto hasta que la ganadora commitea.
    const segunda = ganador === 'autor' ? iniciarConsumo() : iniciarAutor();
    segunda.catch(() => undefined);
    await release.arrive();

    const resultadoPrimera = await primera.then(
      (valor) => ({ ok: true as const, valor }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    const resultadoSegunda = await withDeadline(
      segunda.then(
        (valor) => ({ ok: true as const, valor }),
        (error: unknown) => ({ ok: false as const, error }),
      ),
      15000,
      'operación perdedora',
    );
    return { resultadoPrimera, resultadoSegunda };
  }


  it('T02-A: la edición que llega antes del reconocimiento queda incluida en el agregado', async () => {
    const f = await raceFixture(db, scope, ['4.00']);
    solicitudIds = [f.solicitud.idSolicitud];

    const { resultadoPrimera, resultadoSegunda } = await correrCarrera(f, 'autor', (stack) =>
      stack.service.update(f.project.idProyecto, f.task.idTarea, f.registros[0].idRegistroTiempo, f.autor.idUsuario, { horas: 6 }),
    );
    expect(resultadoPrimera.ok).toBe(true);
    expect(resultadoSegunda.ok).toBe(true);

    const registro = await db.registroTiempoTarea.findUniqueOrThrow({ where: { idRegistroTiempo: f.registros[0].idRegistroTiempo } });
    expect(registro.horas.toFixed(2)).toBe('6.00');
    const tramo = await db.asignacionTarea.findUniqueOrThrow({ where: { idAsignacion: f.assignment.idAsignacion } });
    expect(tramo.horasReales?.toFixed(2)).toBe('6.00');
    expect(tramo.reconocidoEn).not.toBeNull();

    const agregados = await db.horasParticipacion.findMany({ where: { idParticipacion: f.participacion.idParticipacion } });
    expect(agregados).toHaveLength(1);
    // El agregado lleva el importe EDITADO: nunca el viejo junto al nuevo reporte.
    expect(agregados[0].horasReportadas.toFixed(2)).toBe('6.00');
    expect(agregados[0].horasCalculadas?.toFixed(2)).toBe('6.00');
    expect(agregados[0].estadoHoras).toBe('PENDIENTE');

    expect(await db.bitacoraAuditoria.count({ where: { idUsuario: f.autor.idUsuario, accion: 'TIME_RECORD_EDITED' } })).toBe(1);
    expect(await db.bitacoraAuditoria.count({ where: { idUsuario: f.leader.idUsuario, accion: 'EXIT_REQUEST_APPROVED' } })).toBe(1);
  });

  /** Un rechazo por carrera es SIEMPRE un 409 limpio, nunca un error opaco. */
  function esConflicto(resultado: { ok: boolean; error?: unknown }): boolean {
    return !resultado.ok && resultado.error instanceof HttpException && resultado.error.getStatus() === 409;
  }

  it('T02-B: la edición que llega después del reconocimiento se rechaza con 409 y el agregado no cambia', async () => {
    const f = await raceFixture(db, scope, ['4.00']);
    solicitudIds = [f.solicitud.idSolicitud];

    const { resultadoPrimera, resultadoSegunda } = await correrCarrera(f, 'consumo', (stack) =>
      stack.service.update(f.project.idProyecto, f.task.idTarea, f.registros[0].idRegistroTiempo, f.autor.idUsuario, { horas: 6 }),
    );
    // El consumo gana; la edición posterior encuentra el tramo ya consumido.
    expect(resultadoPrimera.ok).toBe(true);
    expect(esConflicto(resultadoSegunda)).toBe(true);

    const registro = await db.registroTiempoTarea.findUniqueOrThrow({ where: { idRegistroTiempo: f.registros[0].idRegistroTiempo } });
    expect(registro.horas.toFixed(2)).toBe('4.00');
    expect(registro.editadoEn).toBeNull();
    const tramo = await db.asignacionTarea.findUniqueOrThrow({ where: { idAsignacion: f.assignment.idAsignacion } });
    expect(tramo.horasReales?.toFixed(2)).toBe('4.00');
    expect(tramo.reconocidoEn).not.toBeNull();

    const agregados = await db.horasParticipacion.findMany({ where: { idParticipacion: f.participacion.idParticipacion } });
    expect(agregados).toHaveLength(1);
    // El agregado conserva el importe original: el intento rechazado no lo recalcula.
    expect(agregados[0].horasReportadas.toFixed(2)).toBe('4.00');
    expect(agregados[0].horasCalculadas?.toFixed(2)).toBe('4.00');

    expect(await db.bitacoraAuditoria.count({ where: { idUsuario: f.autor.idUsuario, accion: 'TIME_RECORD_EDITED' } })).toBe(0);
    expect(await db.bitacoraAuditoria.count({ where: { idUsuario: f.leader.idUsuario, accion: 'EXIT_REQUEST_APPROVED' } })).toBe(1);
  });
});
