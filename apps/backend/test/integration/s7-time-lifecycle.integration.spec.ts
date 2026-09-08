import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import { cleanupTimeFixture, timeLifecycleFixture, timeStack } from './setup/time-records';
import {
  createIntegrationParticipation,
  createIntegrationProjectRole,
  createIntegrationTaskAssignment,
  createIntegrationUser,
} from './setup/fixtures';
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

  it('T05-B: un tramo con reconocidoEn no admite edición ni revocación', async () => {
    const f = await timeLifecycleFixture(db, scope);
    const segundo = await db.registroTiempoTarea.create({
      data: {
        idAsignacion: f.closed.idAsignacion,
        idUsuario: f.owner.idUsuario,
        horas: '1.50',
        fecha: new Date('2026-08-31T00:00:00.000Z'),
      },
    });
    // El tramo se marca consumido igual que lo dejaría Flow A/Flow B, junto a
    // su agregado PENDIENTE: es el estado que debe quedar intacto.
    await db.asignacionTarea.update({
      where: { idAsignacion: f.closed.idAsignacion },
      data: { horasReales: '3.50', reconocidoEn: new Date('2026-09-02T10:00:00.000Z') },
    });
    const agregado = await db.horasParticipacion.create({
      data: {
        idParticipacion: f.ownerParticipation.idParticipacion,
        idSprint: f.sprint.idSprint,
        periodoInicio: new Date('2026-08-01T00:00:00.000Z'),
        periodoFin: new Date('2026-09-02T00:00:00.000Z'),
        horasReportadas: '3.50',
        horasCalculadas: '3.50',
      },
    });

    const { service, realtime } = timeStack(db);
    const registrosAntes = await db.registroTiempoTarea.findMany({
      where: { idAsignacion: f.closed.idAsignacion },
      orderBy: { idRegistroTiempo: 'asc' },
    });
    const tramoAntes = await db.asignacionTarea.findUniqueOrThrow({ where: { idAsignacion: f.closed.idAsignacion } });

    for (const recordId of [f.ownerRecord.idRegistroTiempo, segundo.idRegistroTiempo]) {
      await expectStatus(409, () =>
        service.update(f.project.idProyecto, f.task.idTarea, recordId, f.owner.idUsuario, { horas: 1 }),
      );
      await expectStatus(409, () =>
        service.revoke(f.project.idProyecto, f.task.idTarea, recordId, f.owner.idUsuario),
      );
    }

    expect(
      await db.registroTiempoTarea.findMany({
        where: { idAsignacion: f.closed.idAsignacion },
        orderBy: { idRegistroTiempo: 'asc' },
      }),
    ).toEqual(registrosAntes);
    expect(await db.asignacionTarea.findUniqueOrThrow({ where: { idAsignacion: f.closed.idAsignacion } })).toEqual(tramoAntes);
    expect(await db.horasParticipacion.findUniqueOrThrow({ where: { idRegistroHoras: agregado.idRegistroHoras } })).toEqual(agregado);
    expect(await db.bitacoraAuditoria.count({ where: { idUsuario: f.owner.idUsuario } })).toBe(0);
    expect(realtime).not.toHaveBeenCalled();
  });

  it('T05-C: Sprint en finalización o cerrado y proyecto en cierre o cerrado rechazan editar y revocar', async () => {
    const { service, realtime } = timeStack(db);

    /**
     * Cada escenario es un proyecto propio: el estado terminal de uno no debe
     * poder explicar el rechazo de otro. `origen` fija de qué assert viene el
     * rechazo, que es justamente lo que distingue el Sprint cerrado con un
     * Sprint posterior activo (ambiente OK, entidad NO) del resto.
     */
    const escenarios: Array<{ nombre: string; origen: string; preparar: () => Promise<Awaited<ReturnType<typeof timeLifecycleFixture>>> }> = [
      {
        nombre: 'Sprint EN_FINALIZACION',
        origen: 'El Sprint actual está en finalización y el proyecto está temporalmente bloqueado',
        preparar: async () => {
          const f = await timeLifecycleFixture(db, scope);
          await db.sprint.update({ where: { idSprint: f.sprint.idSprint }, data: { estado: 'EN_FINALIZACION' } });
          return f;
        },
      },
      {
        nombre: 'Sprint CERRADO con Sprint siguiente ACTIVO',
        origen: 'El Sprint de la entidad afectada no admite esta operación',
        preparar: async () => {
          const f = await timeLifecycleFixture(db, scope);
          await db.sprint.update({ where: { idSprint: f.sprint.idSprint }, data: { estado: 'CERRADO' } });
          const siguiente = await db.sprint.create({
            data: { idProyecto: f.project.idProyecto, numero: 2, estado: 'ACTIVO' },
          });
          scope.sprintIds = [...(scope.sprintIds ?? []), siguiente.idSprint];
          return f;
        },
      },
      {
        nombre: 'proyecto EN_SOLICITUD_CIERRE',
        origen: 'El estado actual del proyecto no permite esta operación',
        preparar: async () => {
          const f = await timeLifecycleFixture(db, scope);
          await db.proyecto.update({ where: { idProyecto: f.project.idProyecto }, data: { estadoProyecto: 'EN_SOLICITUD_CIERRE' } });
          return f;
        },
      },
      {
        nombre: 'proyecto CERRADO',
        origen: 'El estado actual del proyecto no permite esta operación',
        preparar: async () => {
          const f = await timeLifecycleFixture(db, scope);
          await db.proyecto.update({ where: { idProyecto: f.project.idProyecto }, data: { estadoProyecto: 'CERRADO' } });
          return f;
        },
      },
    ];

    for (const escenario of escenarios) {
      const f = await escenario.preparar();
      const antes = await db.registroTiempoTarea.findUniqueOrThrow({
        where: { idRegistroTiempo: f.ownerRecord.idRegistroTiempo },
      });
      const tramoAntes = await db.asignacionTarea.findUniqueOrThrow({ where: { idAsignacion: f.closed.idAsignacion } });

      const edicion = await expectStatus(409, () =>
        service.update(f.project.idProyecto, f.task.idTarea, antes.idRegistroTiempo, f.owner.idUsuario, { horas: 7 }),
      );
      const revocacion = await expectStatus(409, () =>
        service.revoke(f.project.idProyecto, f.task.idTarea, antes.idRegistroTiempo, f.owner.idUsuario),
      );
      for (const cuerpo of [edicion, revocacion]) {
        const mensaje = typeof cuerpo === 'string' ? cuerpo : (cuerpo as { message?: string }).message;
        expect(mensaje, `origen del rechazo en «${escenario.nombre}»`).toBe(escenario.origen);
      }

      expect(await db.registroTiempoTarea.findUniqueOrThrow({ where: { idRegistroTiempo: antes.idRegistroTiempo } })).toEqual(antes);
      expect(await db.asignacionTarea.findUniqueOrThrow({ where: { idAsignacion: f.closed.idAsignacion } })).toEqual(tramoAntes);
      expect(await db.bitacoraAuditoria.count({ where: { idUsuario: f.owner.idUsuario } })).toBe(0);
    }

    expect(realtime).not.toHaveBeenCalled();
  });

  it('T06-C: el resumen de horas recalcula indicadores tras cambiar la estimación, conserva justificaciones y expone revocados según autorización', async () => {
    const f = await timeLifecycleFixture(db, scope);
    await db.tarea.update({ where: { idTarea: f.task.idTarea }, data: { tiempoEstimadoHoras: 10 } });
    // Tramo de A: 8 efectivas con la justificación del registro que cruzó.
    await db.registroTiempoTarea.update({
      where: { idRegistroTiempo: f.ownerRecord.idRegistroTiempo },
      data: { horas: '8.00' },
    });
    await db.asignacionTarea.update({ where: { idAsignacion: f.closed.idAsignacion }, data: { horasReales: '8.00' } });
    // Un registro revocado de A: solo el líder conserva esa evidencia
    // (revocarlo lo retira de la propia lista de A), y no cuenta en ningún total.
    const revocado = await db.registroTiempoTarea.create({
      data: {
        idAsignacion: f.closed.idAsignacion,
        idUsuario: f.owner.idUsuario,
        horas: '3.00',
        fecha: new Date('2026-08-29T00:00:00.000Z'),
        nota: 'nota privada de A',
        revocadoEn: new Date('2026-08-30T09:00:00.000Z'),
        revocadoPor: f.owner.idUsuario,
      },
    });
    // Tramo LEGACY de un tercer usuario: importe histórico SIN registros.
    const historico = await createIntegrationUser(db);
    scope.userIds = [...(scope.userIds ?? []), historico.idUsuario];
    const rolHistorico = await createIntegrationProjectRole(db, f.project.idProyecto, { cupos: 2 });
    scope.roleIds = [...(scope.roleIds ?? []), rolHistorico.idRolProyecto];
    const participacionHistorica = await createIntegrationParticipation(db, historico.idUsuario, rolHistorico.idRolProyecto, { estadoParticipacion: 'RETIRADO' });
    scope.participationIds = [...(scope.participationIds ?? []), participacionHistorica.idParticipacion];
    const tramoLegacy = await createIntegrationTaskAssignment(db, f.task.idTarea, historico.idUsuario, f.leader.idUsuario, {
      idParticipacion: participacionHistorica.idParticipacion,
      desasignadaEn: new Date('2026-08-20T00:00:00.000Z'),
      horasReales: '6.00',
      origenReporte: 'LEGACY',
    });
    scope.assignmentIds = [...(scope.assignmentIds ?? []), tramoLegacy.idAsignacion];
    const externo = await createIntegrationUser(db);
    scope.userIds = [...(scope.userIds ?? []), externo.idUsuario];

    const { service } = timeStack(db);

    const conEstimacion10 = await service.getTaskHoursSummary(f.project.idProyecto, f.task.idTarea, f.owner.idUsuario);
    expect(conEstimacion10.estimacion).toBe(10);
    expect(conEstimacion10.horasReportadasTarea).toBe('12.00');
    expect(conEstimacion10.horasLegacyNoGranulares).toBe('6.00');
    expect(conEstimacion10.restantes).toBe('0.00');
    expect(conEstimacion10.sobreEstimacion).toBe('2.00');

    /**
     * La estimación se eleva sobre la fila de la tarea: lo que el contrato
     * exige demostrar es que el resumen la relee y recalcula, no la ruta que
     * la cambia — que es la de HU-D4 y ya tiene su propia cobertura.
     */
    await db.tarea.update({ where: { idTarea: f.task.idTarea }, data: { tiempoEstimadoHoras: 20 } });

    const comoAutor = await service.getTaskHoursSummary(f.project.idProyecto, f.task.idTarea, f.owner.idUsuario);
    expect(comoAutor.estimacion).toBe(20);
    // Indicadores recalculados; ninguna obligación retroactiva se inventa.
    expect(comoAutor.horasReportadasTarea).toBe('12.00');
    expect(comoAutor.restantes).toBe('8.00');
    expect(comoAutor.sobreEstimacion).toBe('0.00');
    // El legacy sigue separado y nunca se suma al reporte granular.
    expect(comoAutor.horasLegacyNoGranulares).toBe('6.00');
    // La justificación histórica sigue almacenada intacta.
    expect(
      (await db.registroTiempoTarea.findUniqueOrThrow({ where: { idRegistroTiempo: f.ownerRecord.idRegistroTiempo } })).justificacionExceso,
    ).toBe('justificación histórica del cruce');

    const tramoA = comoAutor.tramos.find((t) => t.idAsignacion === f.closed.idAsignacion)!;
    expect(tramoA.reportadas).toBe('8.00');
    expect(tramoA.abierto).toBe(false);
    expect(tramoA.origen).toBe('GRANULAR');
    expect(tramoA.justificaciones).toEqual([{ texto: 'justificación histórica del cruce', revocadoEn: null }]);
    const tramoLegacyProyectado = comoAutor.tramos.find((t) => t.idAsignacion === tramoLegacy.idAsignacion)!;
    // Un importe legacy no se hace pasar por SUM de registros granulares.
    expect(tramoLegacyProyectado.reportadas).toBe('0.00');
    expect(tramoLegacyProyectado.origen).toBe('LEGACY');
    expect(tramoLegacyProyectado.propuestas).toBe('6.00');
    expect(tramoLegacyProyectado.ajuste).toBeNull();
    // A no tiene tramo abierto pero sí registros propios mutables.
    expect(comoAutor.puedeCrear).toBe(false);
    expect(comoAutor.puedeEditar).toBe(true);
    expect(comoAutor.puedeRevocar).toBe(true);

    const comoSucesor = await service.getTaskHoursSummary(f.project.idProyecto, f.task.idTarea, f.successor.idUsuario);
    // B no ve las justificaciones privadas de A, pero sí los totales.
    expect(comoSucesor.tramos.find((t) => t.idAsignacion === f.closed.idAsignacion)!.justificaciones).toEqual([]);
    expect(comoSucesor.horasReportadasTarea).toBe('12.00');
    expect(comoSucesor.puedeCrear).toBe(true);

    const comoLider = await service.getTaskHoursSummary(f.project.idProyecto, f.task.idTarea, f.leader.idUsuario);
    expect(comoLider.tramos.find((t) => t.idAsignacion === f.closed.idAsignacion)!.justificaciones).toEqual([
      { texto: 'justificación histórica del cruce', revocadoEn: null },
    ]);
    // El líder no reporta horas propias en esta tarea.
    expect(comoLider.puedeCrear).toBe(false);
    expect(comoLider.puedeEditar).toBe(false);

    // Visibilidad de la lista: revocar retira el registro de la lista de su
    // propio autor (es lo que significa retirarlo, ver findAllForTask); el
    // líder conserva el histórico completo, incluidos los revocados. B solo
    // ve los suyos y el externo no ve nada.
    const listaAutor = await service.findAllForTask(f.project.idProyecto, f.task.idTarea, f.owner.idUsuario);
    expect(listaAutor.map((r) => r.idRegistroTiempo)).toEqual([f.ownerRecord.idRegistroTiempo]);
    const listaSucesor = await service.findAllForTask(f.project.idProyecto, f.task.idTarea, f.successor.idUsuario);
    expect(listaSucesor.map((r) => r.idRegistroTiempo)).toEqual([f.successorRecord.idRegistroTiempo]);
    const listaLider = await service.findAllForTask(f.project.idProyecto, f.task.idTarea, f.leader.idUsuario);
    expect(listaLider).toHaveLength(3);
    expect(listaLider.some((r) => r.idRegistroTiempo === revocado.idRegistroTiempo)).toBe(true);

    await expectStatus(403, () => service.findAllForTask(f.project.idProyecto, f.task.idTarea, externo.idUsuario));
    await expectStatus(403, () => service.getTaskHoursSummary(f.project.idProyecto, f.task.idTarea, externo.idUsuario));
  });
});
