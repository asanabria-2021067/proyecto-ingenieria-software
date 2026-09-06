import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import type { Prisma, PrismaClient } from '@prisma/client';
import { EstadoSprint, OrigenReporteTramo } from '@prisma/client';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';
import {
  createIntegrationParticipation,
  createIntegrationProject,
  createIntegrationProjectRole,
  createIntegrationSprint,
  createIntegrationTask,
  createIntegrationTaskAssignment,
  createIntegrationUser,
} from './setup/fixtures';

/**
 * T38 — invariantes SQL manuales del Sprint 7 (06 v2 §36 y §47), una
 * subdivisión por migración M1…M6. Cada contraejemplo se escribe con SQL
 * directo dentro de una transacción propia que revierte, y se afirma por
 * NOMBRE de constraint para que un CHECK renombrado o ausente falle en voz
 * alta. Los CHECK NOT VALID de tablas pobladas no se validan aquí: solo se
 * demuestra que rechazan filas nuevas o modificadas.
 */

type RawStatement = (tx: Prisma.TransactionClient) => Promise<unknown>;

async function expectCheckViolation(
  prisma: PrismaClient,
  constraint: string,
  statement: RawStatement,
): Promise<void> {
  const outcome = await prisma
    .$transaction(async (tx) => {
      await statement(tx);
    })
    .then(
      () => null,
      (error: unknown) => error,
    );
  expect(outcome, `se esperaba una violación de ${constraint}`).toBeInstanceOf(Error);
  expect(String((outcome as Error).message)).toContain(`check constraint "${constraint}"`);
}

/**
 * Prisma reduce una violación de índice único en raw (SQLSTATE 23505) al
 * DETAIL de PostgreSQL y omite el nombre del constraint, así que la sentencia
 * se ejecuta dentro de un bloque PL/pgSQL que re-lanza el CONSTRAINT_NAME
 * diagnosticado por la propia base. `sql` solo contiene literales de fixture
 * (IDs enteros y textos constantes), nunca entrada externa.
 */
async function expectUniqueViolation(prisma: PrismaClient, indexName: string, sql: string): Promise<void> {
  const wrapped = `DO $s7$ DECLARE violated text; BEGIN ${sql}; EXCEPTION WHEN unique_violation THEN GET STACKED DIAGNOSTICS violated = CONSTRAINT_NAME; RAISE EXCEPTION 'unique constraint "%"', violated; END $s7$;`;
  const outcome = await prisma
    .$transaction(async (tx) => {
      await tx.$executeRawUnsafe(wrapped);
    })
    .then(
      () => null,
      (error: unknown) => error,
    );
  expect(outcome, `se esperaba una violación de ${indexName}`).toBeInstanceOf(Error);
  expect(String((outcome as Error).message)).toContain(`unique constraint "${indexName}"`);
}

describeIntegration('S7 database invariants (T38)', () => {
  let prisma: PrismaClient;
  let scope: IntegrationCleanupScope;
  let hoursIds: number[];
  let recordIds: number[];
  let adjustmentIds: number[];
  let appealIds: number[];
  let historyIds: number[];

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    scope = {};
    hoursIds = [];
    recordIds = [];
    adjustmentIds = [];
    appealIds = [];
    historyIds = [];
  });

  afterEach(async () => {
    if (historyIds.length > 0) {
      await prisma.historialLiderazgo.deleteMany({ where: { idHistorialLiderazgo: { in: historyIds } } });
    }
    if (appealIds.length > 0) {
      await prisma.apelacionLiderazgo.deleteMany({ where: { idApelacion: { in: appealIds } } });
    }
    if (adjustmentIds.length > 0) {
      // Sucesores antes que antecesores: la FK de cadena es RESTRICT.
      await prisma.ajusteHoraTarea.deleteMany({
        where: { idAjusteHora: { in: adjustmentIds }, idAjusteAnterior: { not: null } },
      });
      await prisma.ajusteHoraTarea.deleteMany({ where: { idAjusteHora: { in: adjustmentIds } } });
    }
    if (recordIds.length > 0) {
      await prisma.registroTiempoTarea.deleteMany({ where: { idRegistroTiempo: { in: recordIds } } });
    }
    if (hoursIds.length > 0) {
      await prisma.horasParticipacion.deleteMany({ where: { idRegistroHoras: { in: hoursIds } } });
    }
    await cleanupIntegrationFixtures(prisma, scope);
  });

  async function seedAssignmentWithHours() {
    const leader = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario];
    const project = await createIntegrationProject(prisma, leader.idUsuario);
    scope.projectIds = [project.idProyecto];
    const role = await createIntegrationProjectRole(prisma, project.idProyecto);
    scope.roleIds = [role.idRolProyecto];
    const participation = await createIntegrationParticipation(prisma, leader.idUsuario, role.idRolProyecto);
    scope.participationIds = [participation.idParticipacion];
    const sprint = await createIntegrationSprint(prisma, project.idProyecto, { estado: EstadoSprint.ACTIVO });
    scope.sprintIds = [sprint.idSprint];
    const task = await createIntegrationTask(prisma, project.idProyecto, leader.idUsuario, sprint.idSprint, {
      idRolProyecto: role.idRolProyecto,
    });
    scope.taskIds = [task.idTarea];
    const created = await createIntegrationTaskAssignment(prisma, task.idTarea, leader.idUsuario, leader.idUsuario);
    scope.assignmentIds = [created.idAsignacion];

    const assignment = await prisma.asignacionTarea.update({
      where: { idAsignacion: created.idAsignacion },
      data: { idParticipacion: participation.idParticipacion, horasReales: '2.50' },
    });
    const hours = await prisma.horasParticipacion.create({
      data: {
        idParticipacion: participation.idParticipacion,
        idSprint: sprint.idSprint,
        periodoInicio: new Date('2026-09-01T00:00:00.000Z'),
        periodoFin: new Date('2026-09-30T00:00:00.000Z'),
        horasReportadas: '2.50',
        horasCalculadas: '2.50',
      },
    });
    hoursIds.push(hours.idRegistroHoras);

    return { leader, assignment, hours };
  }

  it('T38-A: CK04, CK05 y CK31 rechazan cache negativa, LEGACY sin importe y horas de participación negativas', async () => {
    const { assignment, hours } = await seedAssignmentWithHours();
    const assignmentId = assignment.idAsignacion;
    const hoursId = hours.idRegistroHoras;

    // Cuatro contraejemplos directos, cada uno en su propia transacción revertida.
    await expectCheckViolation(
      prisma,
      's7_ck_04',
      (tx) => tx.$executeRaw`UPDATE asignacion_tarea SET horas_reales = -1 WHERE id_asignacion = ${assignmentId}`,
    );
    await expectCheckViolation(
      prisma,
      's7_ck_05',
      (tx) =>
        tx.$executeRaw`UPDATE asignacion_tarea SET origen_reporte = 'LEGACY', horas_reales = NULL WHERE id_asignacion = ${assignmentId}`,
    );
    await expectCheckViolation(
      prisma,
      's7_ck_31',
      (tx) =>
        tx.$executeRaw`UPDATE horas_participacion SET horas_reportadas = -1 WHERE id_registro_horas = ${hoursId}`,
    );
    await expectCheckViolation(
      prisma,
      's7_ck_31',
      (tx) =>
        tx.$executeRaw`UPDATE horas_participacion SET horas_calculadas = -1 WHERE id_registro_horas = ${hoursId}`,
    );

    // Ninguna fila queda modificada tras los rechazos.
    const untouchedAssignment = await prisma.asignacionTarea.findUniqueOrThrow({
      where: { idAsignacion: assignmentId },
    });
    expect(Number(untouchedAssignment.horasReales)).toBe(2.5);
    expect(untouchedAssignment.origenReporte).toBe(OrigenReporteTramo.GRANULAR);
    const untouchedHours = await prisma.horasParticipacion.findUniqueOrThrow({
      where: { idRegistroHoras: hoursId },
    });
    expect(Number(untouchedHours.horasReportadas)).toBe(2.5);
    expect(Number(untouchedHours.horasCalculadas)).toBe(2.5);
    expect(untouchedHours.horasAprobadas).toBeNull();

    // Los valores límite válidos se aceptan.
    await prisma.$executeRaw`UPDATE asignacion_tarea SET horas_reales = 0 WHERE id_asignacion = ${assignmentId}`;
    await prisma.$executeRaw`UPDATE horas_participacion SET horas_calculadas = NULL, horas_aprobadas = NULL WHERE id_registro_horas = ${hoursId}`;
    const boundaryAssignment = await prisma.asignacionTarea.findUniqueOrThrow({
      where: { idAsignacion: assignmentId },
    });
    expect(Number(boundaryAssignment.horasReales)).toBe(0);
    const boundaryHours = await prisma.horasParticipacion.findUniqueOrThrow({
      where: { idRegistroHoras: hoursId },
    });
    expect(boundaryHours.horasCalculadas).toBeNull();
    expect(boundaryHours.horasAprobadas).toBeNull();
  });
  it('T38-B: CK01, CK02 y CK03 rechazan horas no positivas, revocación incoherente y revocador distinto del autor', async () => {
    const { leader, assignment } = await seedAssignmentWithHours();
    const authorId = leader.idUsuario;
    const assignmentId = assignment.idAsignacion;
    const otherUser = await createIntegrationUser(prisma);
    scope.userIds = [...(scope.userIds ?? []), otherUser.idUsuario];

    // Registro efectivo de referencia del autor, con nota y justificación.
    const record = await prisma.registroTiempoTarea.create({
      data: {
        idAsignacion: assignmentId,
        idUsuario: authorId,
        horas: '1.25',
        fecha: new Date('2026-09-02T00:00:00.000Z'),
        nota: 'nota de referencia',
        justificacionExceso: 'cruza la estimación de la tarea',
      },
    });
    recordIds.push(record.idRegistroTiempo);
    const recordId = record.idRegistroTiempo;

    // Cinco contraejemplos, cada uno en su propia transacción revertida.
    await expectCheckViolation(
      prisma,
      's7_ck_01',
      (tx) =>
        tx.$executeRaw`INSERT INTO registro_tiempo_tarea (id_asignacion, id_usuario, horas, fecha) VALUES (${assignmentId}, ${authorId}, 0, DATE '2026-09-03')`,
    );
    await expectCheckViolation(
      prisma,
      's7_ck_01',
      (tx) =>
        tx.$executeRaw`INSERT INTO registro_tiempo_tarea (id_asignacion, id_usuario, horas, fecha) VALUES (${assignmentId}, ${authorId}, -2, DATE '2026-09-03')`,
    );
    await expectCheckViolation(
      prisma,
      's7_ck_02',
      (tx) => tx.$executeRaw`UPDATE registro_tiempo_tarea SET revocado_en = NOW() WHERE id_registro_tiempo = ${recordId}`,
    );
    await expectCheckViolation(
      prisma,
      's7_ck_02',
      (tx) =>
        tx.$executeRaw`UPDATE registro_tiempo_tarea SET revocado_por = ${authorId} WHERE id_registro_tiempo = ${recordId}`,
    );
    await expectCheckViolation(
      prisma,
      's7_ck_03',
      (tx) =>
        tx.$executeRaw`UPDATE registro_tiempo_tarea SET revocado_en = NOW(), revocado_por = ${otherUser.idUsuario} WHERE id_registro_tiempo = ${recordId}`,
    );

    // Tras los rechazos el registro sigue efectivo e intacto.
    const untouched = await prisma.registroTiempoTarea.findUniqueOrThrow({ where: { idRegistroTiempo: recordId } });
    expect(untouched.revocadoEn).toBeNull();
    expect(untouched.revocadoPor).toBeNull();
    expect(await prisma.registroTiempoTarea.count({ where: { idAsignacion: assignmentId } })).toBe(1);

    // La revocación coherente (fecha + revocador = autor) se acepta y conserva importe, fecha, nota y justificación.
    await prisma.$executeRaw`UPDATE registro_tiempo_tarea SET revocado_en = NOW(), revocado_por = ${authorId} WHERE id_registro_tiempo = ${recordId}`;
    const revoked = await prisma.registroTiempoTarea.findUniqueOrThrow({ where: { idRegistroTiempo: recordId } });
    expect(revoked.revocadoEn).not.toBeNull();
    expect(revoked.revocadoPor).toBe(authorId);
    expect(Number(revoked.horas)).toBe(1.25);
    expect(revoked.fecha.toISOString()).toBe('2026-09-02T00:00:00.000Z');
    expect(revoked.nota).toBe('nota de referencia');
    expect(revoked.justificacionExceso).toBe('cruza la estimación de la tarea');
  });
  it('T38-C: CK06-CK09 y s7_ajuste_vigente impiden propuesta negativa, delta sin justificación, anulación incoherente, autorreferencia y dos ajustes vigentes', async () => {
    const { leader, assignment } = await seedAssignmentWithHours();
    const authorId = leader.idUsuario;
    const assignmentId = assignment.idAsignacion;
    await prisma.asignacionTarea.update({ where: { idAsignacion: assignmentId }, data: { horasReales: '4.00' } });

    const insertReturningId = async (sql: TemplateStringsArray, ...values: unknown[]): Promise<number> => {
      const rows = await prisma.$queryRaw<Array<{ id_ajuste_hora: number }>>(sql, ...values);
      const id = rows[0].id_ajuste_hora;
      adjustmentIds.push(id);
      return id;
    };

    // Ajuste vigente válido de referencia: delta -1.00 sobre base 4.00, justificado.
    const liveId = await insertReturningId`INSERT INTO ajuste_hora_tarea (id_asignacion, delta_horas, horas_base, justificacion, id_autor) VALUES (${assignmentId}, -1.00, 4.00, 'reduce una hora no evidenciada', ${authorId}) RETURNING id_ajuste_hora`;

    // Contraejemplos de CHECK, insertados ya anulados para no depender del índice parcial.
    await expectCheckViolation(
      prisma,
      's7_ck_06',
      (tx) =>
        tx.$executeRaw`INSERT INTO ajuste_hora_tarea (id_asignacion, delta_horas, horas_base, justificacion, id_autor, anulado_en, anulado_por) VALUES (${assignmentId}, 0.50, -1.00, 'base negativa', ${authorId}, NOW(), ${authorId})`,
    );
    await expectCheckViolation(
      prisma,
      's7_ck_06',
      (tx) =>
        tx.$executeRaw`INSERT INTO ajuste_hora_tarea (id_asignacion, delta_horas, horas_base, justificacion, id_autor, anulado_en, anulado_por) VALUES (${assignmentId}, -2.00, 1.00, 'propuesta negativa', ${authorId}, NOW(), ${authorId})`,
    );
    for (const justification of ['', '   ', null]) {
      await expectCheckViolation(
        prisma,
        's7_ck_07',
        (tx) =>
          tx.$executeRaw`INSERT INTO ajuste_hora_tarea (id_asignacion, delta_horas, horas_base, justificacion, id_autor, anulado_en, anulado_por) VALUES (${assignmentId}, 0.25, 4.00, ${justification}, ${authorId}, NOW(), ${authorId})`,
      );
    }
    await expectCheckViolation(
      prisma,
      's7_ck_08',
      (tx) =>
        tx.$executeRaw`INSERT INTO ajuste_hora_tarea (id_asignacion, delta_horas, horas_base, justificacion, id_autor, anulado_en) VALUES (${assignmentId}, 0, 4.00, NULL, ${authorId}, NOW())`,
    );
    await expectCheckViolation(
      prisma,
      's7_ck_09',
      (tx) =>
        tx.$executeRaw`INSERT INTO ajuste_hora_tarea (id_ajuste_hora, id_asignacion, delta_horas, horas_base, justificacion, id_autor, anulado_en, anulado_por, id_ajuste_anterior) VALUES (2147483000, ${assignmentId}, 0, 4.00, NULL, ${authorId}, NOW(), ${authorId}, 2147483000)`,
    );

    // Un segundo ajuste vigente sobre el mismo tramo choca con el índice parcial.
    await expectUniqueViolation(
      prisma,
      's7_ajuste_vigente',
      `INSERT INTO ajuste_hora_tarea (id_asignacion, delta_horas, horas_base, justificacion, id_autor) VALUES (${assignmentId}, 0.50, 4.00, 'segundo vigente', ${authorId})`,
    );
    expect(await prisma.ajusteHoraTarea.count({ where: { idAsignacion: assignmentId } })).toBe(1);

    // Anular el vigente habilita al sucesor; delta 0 sin justificación es legítimo.
    await prisma.$executeRaw`UPDATE ajuste_hora_tarea SET anulado_en = NOW(), anulado_por = ${authorId} WHERE id_ajuste_hora = ${liveId}`;
    const zeroId = await insertReturningId`INSERT INTO ajuste_hora_tarea (id_asignacion, delta_horas, horas_base, justificacion, id_autor) VALUES (${assignmentId}, 0, 4.00, NULL, ${authorId}) RETURNING id_ajuste_hora`;
    await prisma.$executeRaw`UPDATE ajuste_hora_tarea SET anulado_en = NOW(), anulado_por = ${authorId} WHERE id_ajuste_hora = ${zeroId}`;
    const successorId = await insertReturningId`INSERT INTO ajuste_hora_tarea (id_asignacion, delta_horas, horas_base, justificacion, id_autor, id_ajuste_anterior) VALUES (${assignmentId}, -0.50, 4.00, 'corrige el ajuste anterior', ${authorId}, ${liveId}) RETURNING id_ajuste_hora`;
    const successor = await prisma.ajusteHoraTarea.findUniqueOrThrow({ where: { idAjusteHora: successorId } });
    expect(successor.idAjusteAnterior).toBe(liveId);
    expect(successor.anuladoEn).toBeNull();

    // La cadena es única: dos ajustes no pueden apuntar al mismo antecesor.
    await expectUniqueViolation(
      prisma,
      'ajuste_hora_tarea_id_ajuste_anterior_key',
      `INSERT INTO ajuste_hora_tarea (id_asignacion, delta_horas, horas_base, justificacion, id_autor, anulado_en, anulado_por, id_ajuste_anterior) VALUES (${assignmentId}, 0.25, 4.00, 'duplica la cadena', ${authorId}, NOW(), ${authorId}, ${liveId})`,
    );

    // El antecesor anulado permanece intacto: append-only.
    const annulled = await prisma.ajusteHoraTarea.findUniqueOrThrow({ where: { idAjusteHora: liveId } });
    expect(Number(annulled.deltaHoras)).toBe(-1);
    expect(Number(annulled.horasBase)).toBe(4);
    expect(annulled.justificacion).toBe('reduce una hora no evidenciada');
    expect(annulled.anuladoPor).toBe(authorId);
  });
  it('T38-D: CK10-CK16, s7_apelacion_pendiente y la unicidad de historial rechazan estados y vínculos imposibles', async () => {
    const leader = await createIntegrationUser(prisma);
    const candidateA = await createIntegrationUser(prisma);
    const candidateB = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario, candidateA.idUsuario, candidateB.idUsuario];
    const project = await createIntegrationProject(prisma, leader.idUsuario);
    scope.projectIds = [project.idProyecto];
    const P = project.idProyecto;
    const L = leader.idUsuario;
    const A = candidateA.idUsuario;
    const B = candidateB.idUsuario;

    const insertAppeal = async (sql: TemplateStringsArray, ...values: unknown[]): Promise<number> => {
      const rows = await prisma.$queryRaw<Array<{ id_apelacion: number }>>(sql, ...values);
      appealIds.push(rows[0].id_apelacion);
      return rows[0].id_apelacion;
    };
    const insertHistory = async (sql: TemplateStringsArray, ...values: unknown[]): Promise<number> => {
      const rows = await prisma.$queryRaw<Array<{ id_historial_liderazgo: number }>>(sql, ...values);
      historyIds.push(rows[0].id_historial_liderazgo);
      return rows[0].id_historial_liderazgo;
    };

    // Apelación pendiente válida del líder actual proponiendo al candidato A.
    const pendingId = await insertAppeal`INSERT INTO apelacion_liderazgo (id_proyecto, id_lider_solicitante, asunto, mensaje, id_candidato_propuesto) VALUES (${P}, ${L}, 'Transferencia de liderazgo', 'Solicito transferir el liderazgo por carga académica.', ${A}) RETURNING id_apelacion`;

    // CK10: asunto o mensaje en blanco (filas resueltas para no depender del índice parcial).
    await expectCheckViolation(
      prisma,
      's7_ck_10',
      (tx) =>
        tx.$executeRaw`INSERT INTO apelacion_liderazgo (id_proyecto, id_lider_solicitante, asunto, mensaje, id_candidato_propuesto, estado_apelacion, resuelta_en) VALUES (${P}, ${L}, '   ', 'mensaje', ${A}, 'CANCELADA', NOW())`,
    );
    await expectCheckViolation(
      prisma,
      's7_ck_10',
      (tx) =>
        tx.$executeRaw`INSERT INTO apelacion_liderazgo (id_proyecto, id_lider_solicitante, asunto, mensaje, id_candidato_propuesto, estado_apelacion, resuelta_en) VALUES (${P}, ${L}, 'Asunto', '', ${A}, 'CANCELADA', NOW())`,
    );
    // CK11: PENDIENTE con resuelta_en; ACEPTADA sin admin resolutor.
    await expectCheckViolation(
      prisma,
      's7_ck_11',
      (tx) =>
        tx.$executeRaw`INSERT INTO apelacion_liderazgo (id_proyecto, id_lider_solicitante, asunto, mensaje, id_candidato_propuesto, estado_apelacion, resuelta_en) VALUES (${P}, ${B}, 'Asunto', 'Mensaje', ${A}, 'PENDIENTE', NOW())`,
    );
    await expectCheckViolation(
      prisma,
      's7_ck_11',
      (tx) =>
        tx.$executeRaw`INSERT INTO apelacion_liderazgo (id_proyecto, id_lider_solicitante, asunto, mensaje, id_candidato_propuesto, estado_apelacion, resuelta_en) VALUES (${P}, ${B}, 'Asunto', 'Mensaje', ${A}, 'ACEPTADA', NOW())`,
    );
    // CK12: DENEGADA sin mensaje de resolución.
    await expectCheckViolation(
      prisma,
      's7_ck_12',
      (tx) =>
        tx.$executeRaw`INSERT INTO apelacion_liderazgo (id_proyecto, id_lider_solicitante, asunto, mensaje, id_candidato_propuesto, estado_apelacion, resuelta_en, id_admin_resolutor) VALUES (${P}, ${B}, 'Asunto', 'Mensaje', ${A}, 'DENEGADA', NOW(), ${L})`,
    );
    // CK13: solicitante igual al candidato.
    await expectCheckViolation(
      prisma,
      's7_ck_13',
      (tx) =>
        tx.$executeRaw`INSERT INTO apelacion_liderazgo (id_proyecto, id_lider_solicitante, asunto, mensaje, id_candidato_propuesto, estado_apelacion, resuelta_en) VALUES (${P}, ${B}, 'Asunto', 'Mensaje', ${B}, 'CANCELADA', NOW())`,
    );
    // CANCELADA sin admin resolutor debe aceptarse (el líder cancela su propia solicitud).
    const cancelledId = await insertAppeal`INSERT INTO apelacion_liderazgo (id_proyecto, id_lider_solicitante, asunto, mensaje, id_candidato_propuesto, estado_apelacion, resuelta_en) VALUES (${P}, ${B}, 'Asunto', 'Mensaje', ${A}, 'CANCELADA', NOW()) RETURNING id_apelacion`;
    expect(cancelledId).toBeGreaterThan(0);

    // s7_apelacion_pendiente: segunda PENDIENTE del mismo proyecto y líder; otra pendiente de OTRO líder sí se acepta.
    await expectUniqueViolation(
      prisma,
      's7_apelacion_pendiente',
      `INSERT INTO apelacion_liderazgo (id_proyecto, id_lider_solicitante, asunto, mensaje, id_candidato_propuesto) VALUES (${P}, ${L}, 'Segunda pendiente', 'Mensaje', ${B})`,
    );
    const otherLeaderPendingId = await insertAppeal`INSERT INTO apelacion_liderazgo (id_proyecto, id_lider_solicitante, asunto, mensaje, id_candidato_propuesto) VALUES (${P}, ${B}, 'Pendiente de otro líder', 'Mensaje', ${A}) RETURNING id_apelacion`;
    expect(otherLeaderPendingId).toBeGreaterThan(0);

    // CK14: origen y apelación deben corresponderse en ambos sentidos.
    await expectCheckViolation(
      prisma,
      's7_ck_14',
      (tx) =>
        tx.$executeRaw`INSERT INTO historial_liderazgo (id_proyecto, id_lider_anterior, id_lider_nuevo, id_admin_responsable, motivo, origen, id_apelacion) VALUES (${P}, ${L}, ${A}, ${L}, 'motivo', 'CAMBIO_ADMINISTRATIVO', ${pendingId})`,
    );
    await expectCheckViolation(
      prisma,
      's7_ck_14',
      (tx) =>
        tx.$executeRaw`INSERT INTO historial_liderazgo (id_proyecto, id_lider_anterior, id_lider_nuevo, id_admin_responsable, motivo, origen, id_apelacion) VALUES (${P}, ${L}, ${A}, ${L}, 'motivo', 'SOLICITUD_LIDER', NULL)`,
    );
    // CK15: líder anterior igual al nuevo. CK16: motivo en blanco.
    await expectCheckViolation(
      prisma,
      's7_ck_15',
      (tx) =>
        tx.$executeRaw`INSERT INTO historial_liderazgo (id_proyecto, id_lider_anterior, id_lider_nuevo, id_admin_responsable, motivo, origen) VALUES (${P}, ${L}, ${L}, ${L}, 'motivo', 'CAMBIO_ADMINISTRATIVO')`,
    );
    await expectCheckViolation(
      prisma,
      's7_ck_16',
      (tx) =>
        tx.$executeRaw`INSERT INTO historial_liderazgo (id_proyecto, id_lider_anterior, id_lider_nuevo, id_admin_responsable, motivo, origen) VALUES (${P}, ${L}, ${A}, ${L}, '   ', 'CAMBIO_ADMINISTRATIVO')`,
    );

    // Aceptar la pendiente habilita un historial SOLICITUD_LIDER enlazado; la FK única impide un segundo.
    await prisma.$executeRaw`UPDATE apelacion_liderazgo SET estado_apelacion = 'ACEPTADA', resuelta_en = NOW(), id_admin_resolutor = ${L} WHERE id_apelacion = ${pendingId}`;
    const linkedHistoryId = await insertHistory`INSERT INTO historial_liderazgo (id_proyecto, id_lider_anterior, id_lider_nuevo, id_admin_responsable, motivo, origen, id_apelacion) VALUES (${P}, ${L}, ${A}, ${L}, 'Apelación aceptada', 'SOLICITUD_LIDER', ${pendingId}) RETURNING id_historial_liderazgo`;
    expect(linkedHistoryId).toBeGreaterThan(0);
    await expectUniqueViolation(
      prisma,
      'historial_liderazgo_id_apelacion_key',
      `INSERT INTO historial_liderazgo (id_proyecto, id_lider_anterior, id_lider_nuevo, id_admin_responsable, motivo, origen, id_apelacion) VALUES (${P}, ${A}, ${B}, ${L}, 'Duplica la apelación', 'SOLICITUD_LIDER', ${pendingId})`,
    );
    const directChangeId = await insertHistory`INSERT INTO historial_liderazgo (id_proyecto, id_lider_anterior, id_lider_nuevo, id_admin_responsable, motivo, origen) VALUES (${P}, ${A}, ${B}, ${L}, 'Cambio administrativo directo', 'CAMBIO_ADMINISTRATIVO') RETURNING id_historial_liderazgo`;
    expect(directChangeId).toBeGreaterThan(0);

    // Estado final: tres apelaciones (aceptada, cancelada, pendiente de otro líder) y dos hechos de historial.
    expect(await prisma.apelacionLiderazgo.count({ where: { idProyecto: P } })).toBe(3);
    expect(await prisma.historialLiderazgo.count({ where: { idProyecto: P } })).toBe(2);
    const accepted = await prisma.apelacionLiderazgo.findUniqueOrThrow({
      where: { idApelacion: pendingId },
      include: { historial: true },
    });
    expect(accepted.estadoApelacion).toBe('ACEPTADA');
    expect(accepted.historial?.idHistorialLiderazgo).toBe(linkedHistoryId);
  });
});
