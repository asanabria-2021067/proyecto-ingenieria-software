import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import { createBarrier, expectConflict, useSecondClient, withDeadline } from './setup/concurrency';
import {
  cleanupLeadershipFixture,
  collectInto,
  leadershipRaceFixture,
  leadershipStack,
  type LeadershipCleanupScope,
} from './setup/leadership';
import { exitStack } from './setup/exit-flow';

/**
 * C101/C102 (06 v2 §42/§47 T15–T16): carreras de liderazgo contra PostgreSQL
 * real, con DOS conexiones físicas y barreras explícitas — nunca sleeps. El
 * lock del proyecto impone un orden total; lo que se fija aquí es que AMBOS
 * órdenes producen un resultado coherente y que ningún orden deja el proyecto
 * con un líder que la elegibilidad no admitiría.
 */
describeIntegration('S7 carreras de liderazgo', () => {
  let db: PrismaClient;
  let scope: LeadershipCleanupScope;
  const second = useSecondClient();

  beforeAll(async () => {
    db = createIntegrationPrismaClient();
    await db.$connect();
  });
  beforeEach(() => {
    scope = {};
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupLeadershipFixture(db, scope);
  });
  afterAll(async () => {
    await db.$disconnect();
  });

  it('T15: una salida concurrente del sucesor produce transferencia válida o 409, nunca un líder inelegible', async () => {
    // ── Orden 1: la transferencia gana con B todavía elegible ──────────────
    const primero = await leadershipRaceFixture(db, scope);
    const transferencia = leadershipStack(db);
    const salida = exitStack(second());

    // Lista informativa previa: B aparece elegible. Puede quedar vieja.
    const listaPrevia = await transferencia.read.candidates(undefined, {
      projectId: primero.project.idProyecto,
      actorId: primero.admin.idUsuario,
    });
    expect(
      listaPrevia.candidatos.find((fila) => fila.idUsuario === primero.successor.idUsuario)
        ?.esElegible,
    ).toBe(true);

    const leidos = createBarrier(1);
    const liberar = createBarrier(1);
    const original = transferencia.eligibility.assertLeadershipCandidate.bind(
      transferencia.eligibility,
    );
    vi.spyOn(transferencia.eligibility, 'assertLeadershipCandidate').mockImplementation(
      async (...args) => {
        await original(...args);
        // Barrera DESPUÉS de los reads internos de la transferencia.
        await leidos.arrive();
        await withDeadline(liberar.wait(), 8000, 'liberar la transferencia');
      },
    );

    const enCurso = transferencia.service.transfer(
      primero.project.idProyecto,
      primero.admin.idUsuario,
      {
        idLiderNuevo: primero.successor.idUsuario,
        expectedLeaderId: primero.leader.idUsuario,
        motivo: 'Transferencia iniciada antes de que el sucesor pidiera su salida.',
      },
    );
    enCurso.catch(() => undefined);
    await withDeadline(leidos.wait(), 8000, 'reads internos de la transferencia');

    // La salida corre en la OTRA conexión y espera el lock del proyecto.
    const salidaConcurrente = salida.service.createSolicitudSalida(
      primero.project.idProyecto,
      primero.successor.idUsuario,
      'Quiero dejar el proyecto justo mientras se decide el liderazgo.',
    );
    salidaConcurrente.catch(() => undefined);
    expect(
      await second().solicitudSalidaProyecto.count({
        where: { idProyecto: primero.project.idProyecto },
      }),
    ).toBe(0);

    await liberar.arrive();
    const resultado = await withDeadline(enCurso, 10000, 'transferencia completa');
    expect(resultado.liderNuevoId).toBe(primero.successor.idUsuario);
    expect(
      (await db.proyecto.findUniqueOrThrow({ where: { idProyecto: primero.project.idProyecto } }))
        .creadoPor,
    ).toBe(primero.successor.idUsuario);

    // El otro flujo se resuelve conforme al estado RESULTANTE: B ya es el
    // líder, y el líder no usa el flujo ordinario de salida.
    let salidaFallo: unknown;
    await salidaConcurrente.catch((error: unknown) => {
      salidaFallo = error;
    });
    expect(salidaFallo).toBeInstanceOf(HttpException);
    expect((salidaFallo as HttpException).getStatus()).toBe(403);
    expect(
      await db.solicitudSalidaProyecto.count({ where: { idProyecto: primero.project.idProyecto } }),
    ).toBe(0);
    expect(
      await db.historialLiderazgo.count({ where: { idProyecto: primero.project.idProyecto } }),
    ).toBe(1);
    // El líder resultante SÍ tiene participación activa.
    expect(
      await db.participacionProyecto.count({
        where: {
          idUsuario: primero.successor.idUsuario,
          estadoParticipacion: 'ACTIVO',
          rolProyecto: { idProyecto: primero.project.idProyecto },
        },
      }),
    ).toBe(1);
    vi.restoreAllMocks();

    // ── Orden 2: la salida deja a B inelegible antes de la transferencia ───
    const segundo = await leadershipRaceFixture(db, scope);
    const transferencia2 = leadershipStack(db);
    const salida2 = exitStack(second());
    const solicitud = await db.solicitudSalidaProyecto.create({
      data: {
        idProyecto: segundo.project.idProyecto,
        idUsuario: segundo.successor.idUsuario,
        motivo: 'Salida pendiente de aprobación del líder.',
        estadoSolicitud: 'PENDIENTE_LIDER',
      },
    });
    collectInto(scope, 'exitRequestIds', [solicitud.idSolicitud]);

    const escritas = createBarrier(1);
    const liberarSalida = createBarrier(1);
    const auditoriaOriginal = salida2.audit.registrarEvento.bind(salida2.audit);
    vi.spyOn(salida2.audit, 'registrarEvento').mockImplementation(async (input) => {
      await auditoriaOriginal(input);
      await escritas.arrive();
      await withDeadline(liberarSalida.wait(), 8000, 'liberar la aprobación de la salida');
    });

    const aprobacion = salida2.service.approveSolicitudSalida(
      segundo.project.idProyecto,
      solicitud.idSolicitud,
      segundo.leader.idUsuario,
    );
    aprobacion.catch(() => undefined);
    await withDeadline(escritas.wait(), 8000, 'escrituras internas de la salida');

    const transferenciaTardia = transferencia2.service.transfer(
      segundo.project.idProyecto,
      segundo.admin.idUsuario,
      {
        idLiderNuevo: segundo.successor.idUsuario,
        expectedLeaderId: segundo.leader.idUsuario,
        motivo: 'Transferencia que llega cuando el sucesor ya se retiró.',
      },
    );
    transferenciaTardia.catch(() => undefined);

    await liberarSalida.arrive();
    await withDeadline(aprobacion, 10000, 'aprobación de la salida');

    const conflicto = await expectConflict(() => transferenciaTardia);
    const cuerpo = conflicto.getResponse() as { code?: string; motivos?: string[] };
    expect(cuerpo.code).toBe('SUCESOR_INELEGIBLE');
    // La transferencia evaluó la elegibilidad DENTRO de su transacción, ya con
    // la participación retirada: no usó la lista informativa vieja.
    expect(cuerpo.motivos).toContain('SIN_PARTICIPACION_ACTIVA');

    // La transferencia fallida no dejó historia ni movió el liderazgo.
    expect(
      await db.historialLiderazgo.count({ where: { idProyecto: segundo.project.idProyecto } }),
    ).toBe(0);
    expect(
      (await db.proyecto.findUniqueOrThrow({ where: { idProyecto: segundo.project.idProyecto } }))
        .creadoPor,
    ).toBe(segundo.leader.idUsuario);
    expect(
      await db.participacionProyecto.count({
        where: {
          idUsuario: segundo.successor.idUsuario,
          estadoParticipacion: 'ACTIVO',
          rolProyecto: { idProyecto: segundo.project.idProyecto },
        },
      }),
    ).toBe(0);
  });

  it('T16: dos administradores con el mismo expectedLeaderId producen un solo historial', async () => {
    /**
     * Corre a los dos administradores sobre conexiones distintas con la MISMA
     * expectativa de líder. El primero queda retenido tras sus reads internos;
     * el segundo espera el lock y solo entra cuando el primero ya commiteó.
     */
    const correr = async (
      f: Awaited<ReturnType<typeof leadershipRaceFixture>>,
      appealId?: number,
    ) => {
      const primero = leadershipStack(db);
      const segundo = leadershipStack(second());
      const leidos = createBarrier(1);
      const liberar = createBarrier(1);
      const original = primero.eligibility.assertLeadershipCandidate.bind(primero.eligibility);
      vi.spyOn(primero.eligibility, 'assertLeadershipCandidate').mockImplementation(
        async (...args) => {
          await original(...args);
          await leidos.arrive();
          await withDeadline(liberar.wait(), 8000, 'liberar al primer administrador');
        },
      );

      const payload = {
        idLiderNuevo: f.successor.idUsuario,
        expectedLeaderId: f.leader.idUsuario,
        motivo: 'Ambos administradores aplican la misma expectativa de liderazgo.',
      };
      const uno = primero.service.transfer(f.project.idProyecto, f.admin.idUsuario, payload, appealId);
      uno.catch(() => undefined);
      await withDeadline(leidos.wait(), 8000, 'reads internos del primer administrador');

      const dos = segundo.service.transfer(
        f.project.idProyecto,
        f.secondAdmin.idUsuario,
        payload,
        appealId,
      );
      dos.catch(() => undefined);
      // Mientras el primero retiene el lock, el segundo no ha escrito nada.
      expect(
        await second().historialLiderazgo.count({ where: { idProyecto: f.project.idProyecto } }),
      ).toBe(0);

      await liberar.arrive();
      const ganador = await withDeadline(uno, 10000, 'primer administrador');
      const conflicto = await expectConflict(() => dos);
      expect((conflicto.getResponse() as { code?: string }).code).toBe('LIDER_INESPERADO');
      return { ganador, primero, segundo };
    };

    // ── Escenario 1: ambos aceptan la MISMA apelación ──────────────────────
    const conApelacion = await leadershipRaceFixture(db, scope);
    const apelacion = await db.apelacionLiderazgo.create({
      data: {
        idProyecto: conApelacion.project.idProyecto,
        idLiderSolicitante: conApelacion.leader.idUsuario,
        asunto: 'Solicito transferir el liderazgo',
        mensaje: 'Dos administradores revisan esta solicitud a la vez.',
        idCandidatoPropuesto: conApelacion.successor.idUsuario,
      },
    });
    const aceptacion = await correr(conApelacion, apelacion.idApelacion);

    const historialApelacion = await db.historialLiderazgo.findMany({
      where: { idProyecto: conApelacion.project.idProyecto },
    });
    expect(historialApelacion).toHaveLength(1);
    expect(historialApelacion[0].idHistorialLiderazgo).toBe(aceptacion.ganador.historialId);
    // La UNIQUE de historial.id_apelacion protege este caso, pero el CAS del
    // líder es lo que impide dos cambios; ambos deben sostenerse.
    expect(historialApelacion[0].idApelacion).toBe(apelacion.idApelacion);
    const resuelta = await db.apelacionLiderazgo.findUniqueOrThrow({
      where: { idApelacion: apelacion.idApelacion },
    });
    expect(resuelta.estadoApelacion).toBe('ACEPTADA');
    expect(resuelta.idAdminResolutor).toBe(conApelacion.admin.idUsuario);
    expect(
      await db.bitacoraAuditoria.count({
        where: { accion: 'LEADERSHIP_APPEAL_ACCEPTED', idObjeto: String(apelacion.idApelacion) },
      }),
    ).toBe(1);
    expect(
      await db.bitacoraAuditoria.count({
        where: {
          accion: 'LEADERSHIP_CHANGED',
          idObjeto: String(conApelacion.project.idProyecto),
        },
      }),
    ).toBe(1);
    expect(
      await db.notificacion.count({
        where: {
          tipoNotificacion: 'LIDERAZGO_ACTUALIZADO',
          idUsuario: { in: [conApelacion.leader.idUsuario, conApelacion.successor.idUsuario] },
        },
      }),
    ).toBe(2);
    expect(
      aceptacion.primero.gateway.emitToUsers.mock.calls.filter(
        (llamada) => llamada[0] === 'LEADERSHIP_CHANGED',
      ),
    ).toHaveLength(1);
    expect(
      aceptacion.segundo.gateway.emitToUsers.mock.calls.filter(
        (llamada) => llamada[0] === 'LEADERSHIP_CHANGED',
      ),
    ).toHaveLength(0);
    vi.restoreAllMocks();

    // ── Escenario 2: ambos aplican el cambio DIRECTO ──────────────────────
    const directo = await leadershipRaceFixture(db, scope);
    const cambio = await correr(directo);

    const historialDirecto = await db.historialLiderazgo.findMany({
      where: { idProyecto: directo.project.idProyecto },
    });
    // Sin apelación no hay UNIQUE que ayude: aquí solo el CAS del líder evita
    // el segundo historial.
    expect(historialDirecto).toHaveLength(1);
    expect(historialDirecto[0].idApelacion).toBeNull();
    expect(historialDirecto[0].idHistorialLiderazgo).toBe(cambio.ganador.historialId);
    expect(
      (await db.proyecto.findUniqueOrThrow({ where: { idProyecto: directo.project.idProyecto } }))
        .creadoPor,
    ).toBe(directo.successor.idUsuario);
    expect(
      await db.bitacoraAuditoria.count({
        where: { accion: 'LEADERSHIP_CHANGED', idObjeto: String(directo.project.idProyecto) },
      }),
    ).toBe(1);
    expect(
      await db.notificacion.count({
        where: {
          tipoNotificacion: 'LIDERAZGO_ACTUALIZADO',
          idUsuario: { in: [directo.leader.idUsuario, directo.successor.idUsuario] },
        },
      }),
    ).toBe(2);
    expect(
      cambio.primero.gateway.emitToUsers.mock.calls.filter(
        (llamada) => llamada[0] === 'LEADERSHIP_CHANGED',
      ),
    ).toHaveLength(1);
    expect(
      cambio.segundo.gateway.emitToUsers.mock.calls.filter(
        (llamada) => llamada[0] === 'LEADERSHIP_CHANGED',
      ),
    ).toHaveLength(0);
  });
});
