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
type NamedViolation = 'unique_violation' | 'foreign_key_violation';

async function violatedConstraintName(
  prisma: PrismaClient,
  kind: NamedViolation,
  sql: string,
): Promise<string | null> {
  const label = kind === 'unique_violation' ? 'unique constraint' : 'foreign key constraint';
  const wrapped = `DO $s7$ DECLARE violated text; BEGIN ${sql}; EXCEPTION WHEN ${kind} THEN GET STACKED DIAGNOSTICS violated = CONSTRAINT_NAME; RAISE EXCEPTION '${label} "%"', violated; END $s7$;`;
  const outcome = await prisma
    .$transaction(async (tx) => {
      await tx.$executeRawUnsafe(wrapped);
    })
    .then(
      () => null,
      (error: unknown) => error,
    );
  if (outcome === null) {
    return null;
  }
  const match = String((outcome as Error).message).match(new RegExp(`${label} "([^"]+)"`));
  if (!match) {
    throw outcome;
  }
  return match[1];
}

async function expectUniqueViolation(prisma: PrismaClient, indexName: string, sql: string): Promise<void> {
  const violated = await violatedConstraintName(prisma, 'unique_violation', sql);
  expect(violated, `se esperaba una violación de ${indexName}`).toBe(indexName);
}

/** El borrado debe fallar por RESTRICT; devuelve el nombre de la FK reportada por PostgreSQL. */
async function expectForeignKeyViolation(
  prisma: PrismaClient,
  sql: string,
  expectedConstraints: string[],
): Promise<string> {
  const violated = await violatedConstraintName(prisma, 'foreign_key_violation', sql);
  expect(violated, `se esperaba una violación de FK ejecutando: ${sql}`).not.toBeNull();
  expect(expectedConstraints, `FK inesperada ${violated}`).toContain(violated);
  return violated as string;
}

const HEX64 = '0123456789abcdef'.repeat(4);
const MAX_DOCUMENT_SIZE = 10485760;

type SqlValue = string | number | null | { raw: string };

function sqlLiteral(value: SqlValue): string {
  if (value === null) {
    return 'NULL';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'object') {
    return value.raw;
  }
  return `'${value.replace(/'/g, "''")}'`;
}

/** INSERT literal sobre documento_cierre a partir de columnas de fixture (nunca entrada externa). */
function documentInsertSql(fields: Record<string, SqlValue>, returning = false): string {
  const columns = Object.keys(fields)
    .map((column) => `"${column}"`)
    .join(', ');
  const values = Object.values(fields).map(sqlLiteral).join(', ');
  return `INSERT INTO documento_cierre (${columns}) VALUES (${values})${returning ? ' RETURNING id_documento_cierre' : ''}`;
}

const JSONB = (json: string): SqlValue => ({ raw: `'${json}'::jsonb` });
const NOW_PLUS_HOUR: SqlValue = { raw: "NOW() + INTERVAL '1 hour'" };
const NOW: SqlValue = { raw: 'NOW()' };

describeIntegration('S7 database invariants (T38)', () => {
  let prisma: PrismaClient;
  let scope: IntegrationCleanupScope;
  let hoursIds: number[];
  let recordIds: number[];
  let adjustmentIds: number[];
  let appealIds: number[];
  let historyIds: number[];
  let revisionIds: number[];
  let documentIds: number[];

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
    revisionIds = [];
    documentIds = [];
  });

  afterEach(async () => {
    if (revisionIds.length > 0 || documentIds.length > 0) {
      // Orden FK-safe: revisiones que referencian un oficial → puente → documentos → revisiones de origen.
      await prisma.revisionCierreProyecto.deleteMany({
        where: { idRevisionCierre: { in: revisionIds }, idDocumentoOficial: { not: null } },
      });
      await prisma.documentoRevisionCierre.deleteMany({ where: { idDocumentoCierre: { in: documentIds } } });
      await prisma.documentoCierre.deleteMany({ where: { idDocumentoCierre: { in: documentIds } } });
      await prisma.revisionCierreProyecto.deleteMany({ where: { idRevisionCierre: { in: revisionIds } } });
    }
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
  it('T38-E: los estados de RevisionCierreProyecto, su numeración y su documento oficial rechazan combinaciones imposibles', async () => {
    const leader = await createIntegrationUser(prisma);
    const admin = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario, admin.idUsuario];
    const project = await createIntegrationProject(prisma, leader.idUsuario);
    const otherProject = await createIntegrationProject(prisma, leader.idUsuario);
    scope.projectIds = [project.idProyecto, otherProject.idProyecto];
    const P = project.idProyecto;
    const P2 = otherProject.idProyecto;
    const L = leader.idUsuario;
    const ADMIN = admin.idUsuario;

    const insertRevision = async (sql: TemplateStringsArray, ...values: unknown[]): Promise<number> => {
      const rows = await prisma.$queryRaw<Array<{ id_revision_cierre: number }>>(sql, ...values);
      revisionIds.push(rows[0].id_revision_cierre);
      return rows[0].id_revision_cierre;
    };

    // Revisión BORRADOR válida y, sobre ella, un informe oficial DISPONIBLE insertado directamente.
    const draftId = await insertRevision`INSERT INTO revision_cierre_proyecto (id_proyecto, numero_revision) VALUES (${P}, 1) RETURNING id_revision_cierre`;
    const officialRows = await prisma.$queryRaw<Array<{ id_documento_cierre: number }>>`INSERT INTO documento_cierre (id_proyecto, id_revision_origen, tipo_documento, external_id, delivery_type, asset_id, version_remota, nombre_archivo, tamano_bytes, tamano_cifrado_bytes, checksum_sha256, checksum_cifrado_sha256, crypto_metadata, generator_version, fingerprint_ejecucion, fingerprint_modelo, contexto_reporte, id_autor, estado_documento, reserva_expira_en, carga_iniciada_en, carga_limite_en, disponible_en) VALUES (${P}, ${draftId}, 'INFORME_OFICIAL_FINAL', ${`uvgenius/cierre/${P}/oficial-t38e.enc`}, 'authenticated', 'asset-oficial', '1', 'informe-oficial.pdf', 1024, 1024, ${HEX64}, ${HEX64}, '{"format":"aes-256-gcm-v1"}'::jsonb, 'closure-report-v1', ${HEX64}, ${HEX64}, '{"schemaVersion":1}'::jsonb, ${ADMIN}, 'DISPONIBLE', NOW() + INTERVAL '1 hour', NOW(), NOW() + INTERVAL '1 hour', NOW()) RETURNING id_documento_cierre`;
    const officialId = officialRows[0].id_documento_cierre;
    documentIds.push(officialId);

    // CK17: numeración positiva.
    await expectCheckViolation(
      prisma,
      's7_ck_17',
      (tx) => tx.$executeRaw`INSERT INTO revision_cierre_proyecto (id_proyecto, numero_revision) VALUES (${P2}, 0)`,
    );
    // CK18: BORRADOR con datos de entrega; ENVIADA incompleta o con revisor; hash mal formado.
    await expectCheckViolation(
      prisma,
      's7_ck_18',
      (tx) => tx.$executeRaw`INSERT INTO revision_cierre_proyecto (id_proyecto, numero_revision, id_solicitante) VALUES (${P2}, 1, ${L})`,
    );
    await expectCheckViolation(
      prisma,
      's7_ck_18',
      (tx) => tx.$executeRaw`INSERT INTO revision_cierre_proyecto (id_proyecto, numero_revision, fingerprint_entrega) VALUES (${P2}, 1, ${HEX64})`,
    );
    await expectCheckViolation(
      prisma,
      's7_ck_18',
      (tx) => tx.$executeRaw`INSERT INTO revision_cierre_proyecto (id_proyecto, numero_revision, estado_revision, id_solicitante, fingerprint_entrega) VALUES (${P2}, 1, 'ENVIADA', ${L}, ${HEX64})`,
    );
    await expectCheckViolation(
      prisma,
      's7_ck_18',
      (tx) => tx.$executeRaw`INSERT INTO revision_cierre_proyecto (id_proyecto, numero_revision, estado_revision, id_solicitante, enviada_en, fingerprint_entrega, id_revisor) VALUES (${P2}, 1, 'ENVIADA', ${L}, NOW(), ${HEX64}, ${ADMIN})`,
    );
    await expectCheckViolation(
      prisma,
      's7_ck_18',
      (tx) => tx.$executeRaw`INSERT INTO revision_cierre_proyecto (id_proyecto, numero_revision, estado_revision, id_solicitante, enviada_en, fingerprint_entrega) VALUES (${P2}, 1, 'ENVIADA', ${L}, NOW(), ${HEX64.slice(0, 63)})`,
    );
    await expectCheckViolation(
      prisma,
      's7_ck_18',
      (tx) => tx.$executeRaw`INSERT INTO revision_cierre_proyecto (id_proyecto, numero_revision, estado_revision, id_solicitante, enviada_en, fingerprint_entrega) VALUES (${P2}, 1, 'ENVIADA', ${L}, NOW(), ${HEX64.toUpperCase()})`,
    );
    // CK19: corrección documental sin comentario. CK20: APROBADA sin oficial; BORRADOR con oficial.
    await expectCheckViolation(
      prisma,
      's7_ck_19',
      (tx) => tx.$executeRaw`INSERT INTO revision_cierre_proyecto (id_proyecto, numero_revision, estado_revision, id_solicitante, enviada_en, fingerprint_entrega, id_revisor, resuelta_en) VALUES (${P2}, 1, 'CORRECCION_DOCUMENTAL', ${L}, NOW(), ${HEX64}, ${ADMIN}, NOW())`,
    );
    await expectCheckViolation(
      prisma,
      's7_ck_20',
      (tx) => tx.$executeRaw`INSERT INTO revision_cierre_proyecto (id_proyecto, numero_revision, estado_revision, id_solicitante, enviada_en, fingerprint_entrega, id_revisor, resuelta_en) VALUES (${P2}, 1, 'APROBADA', ${L}, NOW(), ${HEX64}, ${ADMIN}, NOW())`,
    );
    await expectCheckViolation(
      prisma,
      's7_ck_20',
      (tx) => tx.$executeRaw`INSERT INTO revision_cierre_proyecto (id_proyecto, numero_revision, id_documento_oficial) VALUES (${P2}, 1, ${officialId})`,
    );

    // Índices parciales: segunda BORRADOR y segunda ENVIADA del mismo proyecto.
    await expectUniqueViolation(
      prisma,
      's7_revision_borrador',
      `INSERT INTO revision_cierre_proyecto (id_proyecto, numero_revision) VALUES (${P}, 2)`,
    );
    const submittedId = await insertRevision`INSERT INTO revision_cierre_proyecto (id_proyecto, numero_revision, estado_revision, id_solicitante, enviada_en, fingerprint_entrega) VALUES (${P}, 2, 'ENVIADA', ${L}, NOW(), ${HEX64}) RETURNING id_revision_cierre`;
    expect(submittedId).toBeGreaterThan(0);
    await expectUniqueViolation(
      prisma,
      's7_revision_enviada',
      `INSERT INTO revision_cierre_proyecto (id_proyecto, numero_revision, estado_revision, id_solicitante, enviada_en, fingerprint_entrega) VALUES (${P}, 3, 'ENVIADA', ${L}, NOW(), '${HEX64}')`,
    );

    // UNIQUE de numeración y de documento oficial.
    await expectUniqueViolation(
      prisma,
      'revision_cierre_proyecto_id_proyecto_numero_revision_key',
      `INSERT INTO revision_cierre_proyecto (id_proyecto, numero_revision, estado_revision, id_solicitante, enviada_en, fingerprint_entrega, id_revisor, resuelta_en, comentario_revisor) VALUES (${P}, 1, 'DEVUELTA_A_EJECUCION', ${L}, NOW(), '${HEX64}', ${ADMIN}, NOW(), 'vuelve a ejecución')`,
    );
    const approvedId = await insertRevision`INSERT INTO revision_cierre_proyecto (id_proyecto, numero_revision, estado_revision, id_solicitante, enviada_en, fingerprint_entrega, id_revisor, resuelta_en, id_documento_oficial) VALUES (${P}, 4, 'APROBADA', ${L}, NOW(), ${HEX64}, ${ADMIN}, NOW(), ${officialId}) RETURNING id_revision_cierre`;
    expect(approvedId).toBeGreaterThan(0);
    await expectUniqueViolation(
      prisma,
      'revision_cierre_proyecto_id_documento_oficial_key',
      `INSERT INTO revision_cierre_proyecto (id_proyecto, numero_revision, estado_revision, id_solicitante, enviada_en, fingerprint_entrega, id_revisor, resuelta_en, id_documento_oficial) VALUES (${P}, 5, 'APROBADA', ${L}, NOW(), '${HEX64}', ${ADMIN}, NOW(), ${officialId})`,
    );

    // Casos legítimos: BORRADOR (P) y ENVIADA (P2) coexisten en proyectos distintos; devolución completa con comentario.
    const otherSubmittedId = await insertRevision`INSERT INTO revision_cierre_proyecto (id_proyecto, numero_revision, estado_revision, id_solicitante, enviada_en, fingerprint_entrega) VALUES (${P2}, 1, 'ENVIADA', ${L}, NOW(), ${HEX64}) RETURNING id_revision_cierre`;
    expect(otherSubmittedId).toBeGreaterThan(0);
    const returnedId = await insertRevision`INSERT INTO revision_cierre_proyecto (id_proyecto, numero_revision, estado_revision, id_solicitante, enviada_en, fingerprint_entrega, id_revisor, resuelta_en, comentario_revisor) VALUES (${P2}, 2, 'DEVUELTA_A_EJECUCION', ${L}, NOW(), ${HEX64}, ${ADMIN}, NOW(), 'Falta el Sprint final') RETURNING id_revision_cierre`;
    expect(returnedId).toBeGreaterThan(0);

    expect(await prisma.revisionCierreProyecto.count({ where: { idProyecto: P } })).toBe(3);
    expect(await prisma.revisionCierreProyecto.count({ where: { idProyecto: P2 } })).toBe(2);
    const approved = await prisma.revisionCierreProyecto.findUniqueOrThrow({
      where: { idRevisionCierre: approvedId },
      include: { informeOficial: true, documentos: true },
    });
    expect(approved.informeOficial?.idDocumentoCierre).toBe(officialId);
    expect(approved.documentos).toHaveLength(0);
  });
  it('T38-F: DocumentoCierre exige proveedor, tipo de recurso, metadata por estado, límite 10485760 y una sola generación de informe por revisión', async () => {
    const leader = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario];
    const project = await createIntegrationProject(prisma, leader.idUsuario);
    scope.projectIds = [project.idProyecto];
    const P = project.idProyecto;
    const L = leader.idUsuario;
    const draftRows = await prisma.$queryRaw<Array<{ id_revision_cierre: number }>>`INSERT INTO revision_cierre_proyecto (id_proyecto, numero_revision) VALUES (${P}, 1) RETURNING id_revision_cierre`;
    const draftId = draftRows[0].id_revision_cierre;
    revisionIds.push(draftId);

    const reserved = (name: string, overrides: Record<string, SqlValue> = {}): Record<string, SqlValue> => ({
      id_proyecto: P,
      id_revision_origen: draftId,
      tipo_documento: 'EVIDENCIA_LIDER',
      external_id: `uvgenius/cierre/${P}/${name}.enc`,
      delivery_type: 'authenticated',
      nombre_archivo: `${name}.pdf`,
      id_autor: L,
      reserva_expira_en: NOW_PLUS_HOUR,
      ...overrides,
    });
    const loaded: Record<string, SqlValue> = {
      tamano_bytes: 1024,
      tamano_cifrado_bytes: 1024,
      checksum_sha256: HEX64,
      checksum_cifrado_sha256: HEX64,
      crypto_metadata: JSONB('{"format":"aes-256-gcm-v1"}'),
      carga_iniciada_en: NOW,
      carga_limite_en: NOW_PLUS_HOUR,
    };
    const insertAccepted = async (fields: Record<string, SqlValue>): Promise<number> => {
      const rows = await prisma.$queryRawUnsafe<Array<{ id_documento_cierre: number }>>(
        documentInsertSql(fields, true),
      );
      documentIds.push(rows[0].id_documento_cierre);
      return rows[0].id_documento_cierre;
    };
    const rejectBy = (constraint: string, fields: Record<string, SqlValue>) =>
      expectCheckViolation(prisma, constraint, (tx) => tx.$executeRawUnsafe(documentInsertSql(fields)));

    // Reserva válida de evidencia (RESERVADO, expira después de crearse).
    const reservedId = await insertAccepted(reserved('evidencia-1'));
    expect(reservedId).toBeGreaterThan(0);

    // CK21/CK22: proveedor, tipo de recurso, modalidad, mime y nombre.
    await rejectBy('s7_ck_21', reserved('x', { proveedor: 's3' }));
    await rejectBy('s7_ck_21', reserved('x', { resource_type: 'image' }));
    await rejectBy('s7_ck_21', reserved('x', { delivery_type: 'public' }));
    await rejectBy('s7_ck_22', reserved('x', { mime_type: 'text/plain' }));
    await rejectBy('s7_ck_22', reserved('x', { nombre_archivo: '   ' }));
    // CK23/CK24: metadata exigida por estado.
    await rejectBy('s7_ck_23', reserved('x', { estado_documento: 'EN_CARGA', carga_iniciada_en: NOW, carga_limite_en: NOW_PLUS_HOUR }));
    await rejectBy('s7_ck_24', reserved('x', { ...loaded, estado_documento: 'DISPONIBLE' }));
    // CK25: orden y presencia de las marcas de purga.
    await rejectBy('s7_ck_25', reserved('x', { estado_documento: 'PURGA_PENDIENTE', purga_solicitada_en: NOW, purgado_en: NOW }));
    await rejectBy('s7_ck_25', reserved('x', { estado_documento: 'PURGADO', purga_solicitada_en: NOW, purgado_en: { raw: "NOW() - INTERVAL '1 hour'" } }));
    // CK26: evidencia sin huellas; informe cargado con las cuatro columnas de reporte.
    await rejectBy('s7_ck_26', reserved('x', { fingerprint_ejecucion: HEX64 }));
    await rejectBy('s7_ck_26', reserved('x', { ...loaded, tipo_documento: 'INFORME_AUTOMATICO', estado_documento: 'DISPONIBLE', asset_id: 'asset', version_remota: '1', disponible_en: NOW }));
    // CK27/CK28/CK29/CK32: expiración, hex, límite inclusivo y ventana de carga.
    await rejectBy('s7_ck_27', reserved('x', { reserva_expira_en: { raw: "NOW() - INTERVAL '1 hour'" } }));
    await rejectBy('s7_ck_28', reserved('x', { checksum_sha256: HEX64.slice(0, 63) }));
    await rejectBy('s7_ck_29', reserved('x', { tamano_bytes: 0, tamano_cifrado_bytes: 0 }));
    await rejectBy('s7_ck_29', reserved('x', { tamano_bytes: MAX_DOCUMENT_SIZE + 1, tamano_cifrado_bytes: MAX_DOCUMENT_SIZE + 1 }));
    await rejectBy('s7_ck_29', reserved('x', { tamano_bytes: 1024, tamano_cifrado_bytes: 1025 }));
    await rejectBy('s7_ck_32', reserved('x', { carga_iniciada_en: NOW }));

    // Límite inclusivo exacto: 10485760 bytes de PDF y de ciphertext se aceptan.
    const maxSizedId = await insertAccepted(reserved('evidencia-max', { tamano_bytes: MAX_DOCUMENT_SIZE, tamano_cifrado_bytes: MAX_DOCUMENT_SIZE }));
    const maxSized = await prisma.documentoCierre.findUniqueOrThrow({ where: { idDocumentoCierre: maxSizedId } });
    expect(Number(maxSized.tamanoBytes)).toBe(MAX_DOCUMENT_SIZE);
    expect(Number(maxSized.tamanoCifradoBytes)).toBe(MAX_DOCUMENT_SIZE);

    // UNIQUE(proveedor, external_id).
    await expectUniqueViolation(
      prisma,
      'documento_cierre_proveedor_external_id_key',
      documentInsertSql(reserved('evidencia-1', { nombre_archivo: 'otro-nombre.pdf' })),
    );

    // Dos reservas de evidencia en la misma revisión son legales; el índice parcial solo serializa informes.
    const secondEvidenceId = await insertAccepted(reserved('evidencia-2'));
    expect(secondEvidenceId).toBeGreaterThan(0);
    const automaticId = await insertAccepted(reserved('informe-auto-1', { tipo_documento: 'INFORME_AUTOMATICO' }));
    await expectUniqueViolation(
      prisma,
      's7_informe_en_generacion',
      documentInsertSql(reserved('informe-auto-2', { tipo_documento: 'INFORME_AUTOMATICO' })),
    );

    // Un automático ya DISPONIBLE no bloquea reservar el oficial ni un segundo automático.
    await prisma.$executeRaw`UPDATE documento_cierre SET estado_documento = 'DISPONIBLE', tamano_bytes = 1024, tamano_cifrado_bytes = 1024, checksum_sha256 = ${HEX64}, checksum_cifrado_sha256 = ${HEX64}, crypto_metadata = '{"format":"aes-256-gcm-v1"}'::jsonb, carga_iniciada_en = NOW(), carga_limite_en = NOW() + INTERVAL '1 hour', asset_id = 'asset-auto', version_remota = '1', disponible_en = NOW(), generator_version = 'closure-report-v1', fingerprint_ejecucion = ${HEX64}, fingerprint_modelo = ${HEX64}, contexto_reporte = '{"schemaVersion":1}'::jsonb WHERE id_documento_cierre = ${automaticId}`;
    const officialId = await insertAccepted(reserved('informe-oficial', { tipo_documento: 'INFORME_OFICIAL_FINAL' }));
    expect(officialId).toBeGreaterThan(0);
    const secondAutomaticId = await insertAccepted(reserved('informe-auto-2', { tipo_documento: 'INFORME_AUTOMATICO' }));
    expect(secondAutomaticId).toBeGreaterThan(0);
    expect(await prisma.documentoCierre.count({ where: { idRevisionOrigen: draftId } })).toBe(6);
  });
  it('T38-G: DocumentoRevisionCierre limita el orden a 0..10 y prohíbe duplicar documento u orden dentro de la revisión', async () => {
    const leader = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario];
    const project = await createIntegrationProject(prisma, leader.idUsuario);
    scope.projectIds = [project.idProyecto];
    const P = project.idProyecto;
    const L = leader.idUsuario;

    // Revisión ENVIADA (origen de los documentos) y el nuevo BORRADOR de una corrección documental.
    const submittedRows = await prisma.$queryRaw<Array<{ id_revision_cierre: number }>>`INSERT INTO revision_cierre_proyecto (id_proyecto, numero_revision, estado_revision, id_solicitante, enviada_en, fingerprint_entrega) VALUES (${P}, 1, 'ENVIADA', ${L}, NOW(), ${HEX64}) RETURNING id_revision_cierre`;
    const submittedId = submittedRows[0].id_revision_cierre;
    revisionIds.push(submittedId);
    const draftRows = await prisma.$queryRaw<Array<{ id_revision_cierre: number }>>`INSERT INTO revision_cierre_proyecto (id_proyecto, numero_revision) VALUES (${P}, 2) RETURNING id_revision_cierre`;
    const draftId = draftRows[0].id_revision_cierre;
    revisionIds.push(draftId);

    // Doce documentos DISPONIBLE insertados directamente (el primero es el informe automático).
    const docIds: number[] = [];
    for (let index = 0; index < 12; index += 1) {
      const isReport = index === 0;
      const rows = await prisma.$queryRawUnsafe<Array<{ id_documento_cierre: number }>>(
        documentInsertSql(
          {
            id_proyecto: P,
            id_revision_origen: submittedId,
            tipo_documento: isReport ? 'INFORME_AUTOMATICO' : 'EVIDENCIA_LIDER',
            external_id: `uvgenius/cierre/${P}/t38g-${index}.enc`,
            delivery_type: 'authenticated',
            nombre_archivo: `documento-${index}.pdf`,
            id_autor: L,
            reserva_expira_en: NOW_PLUS_HOUR,
            estado_documento: 'DISPONIBLE',
            tamano_bytes: 1024,
            tamano_cifrado_bytes: 1024,
            checksum_sha256: HEX64,
            checksum_cifrado_sha256: HEX64,
            crypto_metadata: JSONB('{"format":"aes-256-gcm-v1"}'),
            carga_iniciada_en: NOW,
            carga_limite_en: NOW_PLUS_HOUR,
            asset_id: `asset-t38g-${index}`,
            version_remota: '1',
            disponible_en: NOW,
            ...(isReport
              ? {
                  generator_version: 'closure-report-v1',
                  fingerprint_ejecucion: HEX64,
                  fingerprint_modelo: HEX64,
                  contexto_reporte: JSONB('{"schemaVersion":1}'),
                }
              : {}),
          },
          true,
        ),
      );
      docIds.push(rows[0].id_documento_cierre);
      documentIds.push(rows[0].id_documento_cierre);
    }

    // Vínculo válido: el automático en el orden 0.
    await prisma.$executeRaw`INSERT INTO documento_revision_cierre (id_revision_cierre, id_documento_cierre, orden) VALUES (${submittedId}, ${docIds[0]}, 0)`;

    // CK30: fuera de 0..10.
    await expectCheckViolation(
      prisma,
      's7_ck_30',
      (tx) =>
        tx.$executeRaw`INSERT INTO documento_revision_cierre (id_revision_cierre, id_documento_cierre, orden) VALUES (${submittedId}, ${docIds[1]}, -1)`,
    );
    await expectCheckViolation(
      prisma,
      's7_ck_30',
      (tx) =>
        tx.$executeRaw`INSERT INTO documento_revision_cierre (id_revision_cierre, id_documento_cierre, orden) VALUES (${submittedId}, ${docIds[11]}, 11)`,
    );

    // Mismo documento dos veces en la misma revisión; dos documentos en el mismo orden.
    await expectUniqueViolation(
      prisma,
      'documento_revision_cierre_id_revision_cierre_id_documento_c_key',
      `INSERT INTO documento_revision_cierre (id_revision_cierre, id_documento_cierre, orden) VALUES (${submittedId}, ${docIds[0]}, 5)`,
    );
    await prisma.$executeRaw`INSERT INTO documento_revision_cierre (id_revision_cierre, id_documento_cierre, orden) VALUES (${submittedId}, ${docIds[2]}, 3)`;
    await expectUniqueViolation(
      prisma,
      'documento_revision_cierre_id_revision_cierre_orden_key',
      `INSERT INTO documento_revision_cierre (id_revision_cierre, id_documento_cierre, orden) VALUES (${submittedId}, ${docIds[3]}, 3)`,
    );

    // El mismo documento en OTRA revisión (herencia por corrección documental) y el orden máximo 10 se aceptan.
    await prisma.$executeRaw`INSERT INTO documento_revision_cierre (id_revision_cierre, id_documento_cierre, orden) VALUES (${draftId}, ${docIds[0]}, 0)`;
    await prisma.$executeRaw`INSERT INTO documento_revision_cierre (id_revision_cierre, id_documento_cierre, orden) VALUES (${submittedId}, ${docIds[10]}, 10)`;

    expect(await prisma.documentoRevisionCierre.count({ where: { idDocumentoCierre: docIds[0] } })).toBe(2);
    expect(await prisma.documentoRevisionCierre.count({ where: { idRevisionCierre: submittedId } })).toBe(3);
    expect(await prisma.documentoRevisionCierre.count({ where: { idRevisionCierre: draftId } })).toBe(1);
  });
  it('T38-H: las claves foráneas de Sprint 7 impiden borrar usuarios, proyectos, revisiones y asignaciones con historia', async () => {
    // Proyecto completo con historia de Sprint 7 en todas las tablas nuevas.
    const leader = await createIntegrationUser(prisma);
    const candidate = await createIntegrationUser(prisma);
    const admin = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario, candidate.idUsuario, admin.idUsuario];
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
      data: { idParticipacion: participation.idParticipacion, horasReales: '3.00' },
    });
    const P = project.idProyecto;
    const L = leader.idUsuario;
    const C = candidate.idUsuario;
    const ADMIN = admin.idUsuario;
    const inOneHour = new Date(Date.now() + 60 * 60 * 1000);

    const record = await prisma.registroTiempoTarea.create({
      data: {
        idAsignacion: assignment.idAsignacion,
        idUsuario: L,
        horas: '3.00',
        fecha: new Date('2026-09-02T00:00:00.000Z'),
        revocadoEn: new Date(),
        revocadoPor: L,
      },
    });
    recordIds.push(record.idRegistroTiempo);
    const annulled = await prisma.ajusteHoraTarea.create({
      data: { idAsignacion: assignment.idAsignacion, deltaHoras: '-1.00', horasBase: '3.00', justificacion: 'primer ajuste', idAutor: L, anuladoEn: new Date(), anuladoPor: L },
    });
    const successor = await prisma.ajusteHoraTarea.create({
      data: { idAsignacion: assignment.idAsignacion, deltaHoras: '-0.50', horasBase: '3.00', justificacion: 'corrección', idAutor: L, idAjusteAnterior: annulled.idAjusteHora },
    });
    adjustmentIds.push(annulled.idAjusteHora, successor.idAjusteHora);
    const appeal = await prisma.apelacionLiderazgo.create({
      data: { idProyecto: P, idLiderSolicitante: L, asunto: 'Transferencia', mensaje: 'Solicito transferir el liderazgo.', idCandidatoPropuesto: C, estadoApelacion: 'ACEPTADA', resueltaEn: new Date(), idAdminResolutor: ADMIN },
    });
    appealIds.push(appeal.idApelacion);
    const history = await prisma.historialLiderazgo.create({
      data: { idProyecto: P, idLiderAnterior: L, idLiderNuevo: C, idAdminResponsable: ADMIN, motivo: 'Apelación aceptada', origen: 'SOLICITUD_LIDER', idApelacion: appeal.idApelacion },
    });
    historyIds.push(history.idHistorialLiderazgo);
    const submitted = await prisma.revisionCierreProyecto.create({
      data: { idProyecto: P, numeroRevision: 1, estadoRevision: 'ENVIADA', idSolicitante: L, enviadaEn: new Date(), fingerprintEntrega: HEX64 },
    });
    revisionIds.push(submitted.idRevisionCierre);
    const availableDocument = (name: string, extra: Record<string, unknown>) => ({
      idProyecto: P,
      idRevisionOrigen: submitted.idRevisionCierre,
      externalId: `uvgenius/cierre/${P}/${name}.enc`,
      deliveryType: 'authenticated',
      nombreArchivo: `${name}.pdf`,
      tamanoBytes: 1024n,
      tamanoCifradoBytes: 1024n,
      checksumSha256: HEX64,
      checksumCifradoSha256: HEX64,
      cryptoMetadata: { format: 'aes-256-gcm-v1' },
      estadoDocumento: 'DISPONIBLE' as const,
      reservaExpiraEn: inOneHour,
      cargaIniciadaEn: new Date(),
      cargaLimiteEn: inOneHour,
      assetId: `asset-${name}`,
      versionRemota: '1',
      disponibleEn: new Date(),
      ...extra,
    });
    const evidence = await prisma.documentoCierre.create({
      data: availableDocument('evidencia-t38h', { tipoDocumento: 'EVIDENCIA_LIDER', idAutor: L }),
    });
    const official = await prisma.documentoCierre.create({
      data: availableDocument('oficial-t38h', {
        tipoDocumento: 'INFORME_OFICIAL_FINAL',
        idAutor: ADMIN,
        generatorVersion: 'closure-report-v1',
        fingerprintEjecucion: HEX64,
        fingerprintModelo: HEX64,
        contextoReporte: { schemaVersion: 1 },
      }),
    });
    documentIds.push(evidence.idDocumentoCierre, official.idDocumentoCierre);
    await prisma.documentoRevisionCierre.create({
      data: { idRevisionCierre: submitted.idRevisionCierre, idDocumentoCierre: evidence.idDocumentoCierre, orden: 1 },
    });
    const approved = await prisma.revisionCierreProyecto.create({
      data: { idProyecto: P, numeroRevision: 2, estadoRevision: 'APROBADA', idSolicitante: L, enviadaEn: new Date(), fingerprintEntrega: HEX64, idRevisor: ADMIN, resueltaEn: new Date(), idDocumentoOficial: official.idDocumentoCierre },
    });
    revisionIds.push(approved.idRevisionCierre);

    // Ningún padre con historia de Sprint 7 puede borrarse: RESTRICT en todas las FK nuevas y adaptadas.
    const userFks = [
      'registro_tiempo_tarea_revocado_por_fkey',
      'registro_tiempo_tarea_id_usuario_fkey',
      'ajuste_hora_tarea_id_autor_fkey',
      'ajuste_hora_tarea_anulado_por_fkey',
      'apelacion_liderazgo_id_lider_solicitante_fkey',
      'apelacion_liderazgo_id_candidato_propuesto_fkey',
      'apelacion_liderazgo_id_admin_resolutor_fkey',
      'historial_liderazgo_id_lider_anterior_fkey',
      'historial_liderazgo_id_lider_nuevo_fkey',
      'historial_liderazgo_id_admin_responsable_fkey',
      'revision_cierre_proyecto_id_solicitante_fkey',
      'revision_cierre_proyecto_id_revisor_fkey',
      'documento_cierre_id_autor_fkey',
      // FK preexistentes del fixture (proyecto, participación, tarea, asignación) también protegen al usuario.
      'proyecto_creado_por_fkey',
      'participacion_proyecto_id_usuario_fkey',
      'tarea_creada_por_fkey',
      'asignacion_tarea_id_usuario_fkey',
      'asignacion_tarea_asignado_por_fkey',
    ];
    for (const userId of [L, C, ADMIN]) {
      await expectForeignKeyViolation(prisma, `DELETE FROM usuario WHERE id_usuario = ${userId}`, userFks);
    }
    await expectForeignKeyViolation(prisma, `DELETE FROM proyecto WHERE id_proyecto = ${P}`, [
      'apelacion_liderazgo_id_proyecto_fkey',
      'historial_liderazgo_id_proyecto_fkey',
      'revision_cierre_proyecto_id_proyecto_fkey',
      'documento_cierre_id_proyecto_fkey',
      'rol_proyecto_id_proyecto_fkey',
      'sprint_id_proyecto_fkey',
      'tarea_id_proyecto_fkey',
    ]);
    await expectForeignKeyViolation(
      prisma,
      `DELETE FROM revision_cierre_proyecto WHERE id_revision_cierre = ${submitted.idRevisionCierre}`,
      ['documento_cierre_id_revision_origen_fkey', 'documento_revision_cierre_id_revision_cierre_fkey'],
    );
    await expectForeignKeyViolation(
      prisma,
      `DELETE FROM documento_cierre WHERE id_documento_cierre = ${evidence.idDocumentoCierre}`,
      ['documento_revision_cierre_id_documento_cierre_fkey'],
    );
    await expectForeignKeyViolation(
      prisma,
      `DELETE FROM documento_cierre WHERE id_documento_cierre = ${official.idDocumentoCierre}`,
      ['revision_cierre_proyecto_id_documento_oficial_fkey'],
    );
    await expectForeignKeyViolation(
      prisma,
      `DELETE FROM asignacion_tarea WHERE id_asignacion = ${assignment.idAsignacion}`,
      ['registro_tiempo_tarea_id_asignacion_fkey', 'ajuste_hora_tarea_id_asignacion_fkey'],
    );
    await expectForeignKeyViolation(
      prisma,
      `DELETE FROM ajuste_hora_tarea WHERE id_ajuste_hora = ${annulled.idAjusteHora}`,
      ['ajuste_hora_tarea_id_ajuste_anterior_fkey'],
    );
    await expectForeignKeyViolation(
      prisma,
      `DELETE FROM apelacion_liderazgo WHERE id_apelacion = ${appeal.idApelacion}`,
      ['historial_liderazgo_id_apelacion_fkey'],
    );
    // La participación del tramo ya no degrada a SET NULL: RESTRICT.
    await expectForeignKeyViolation(
      prisma,
      `DELETE FROM participacion_proyecto WHERE id_participacion = ${participation.idParticipacion}`,
      ['asignacion_tarea_id_participacion_fkey'],
    );
    const stillLinked = await prisma.asignacionTarea.findUniqueOrThrow({ where: { idAsignacion: assignment.idAsignacion } });
    expect(stillLinked.idParticipacion).toBe(participation.idParticipacion);
    expect(await prisma.usuario.count({ where: { idUsuario: { in: [L, C, ADMIN] } } })).toBe(3);

    // ON UPDATE CASCADE: cambiar la PK del candidato se propaga a todas las hijas sin huérfanos.
    const relocatedId = C + 1_000_000;
    await prisma.$executeRaw`UPDATE usuario SET id_usuario = ${relocatedId} WHERE id_usuario = ${C}`;
    scope.userIds = [L, relocatedId, ADMIN];
    const relocatedAppeal = await prisma.apelacionLiderazgo.findUniqueOrThrow({ where: { idApelacion: appeal.idApelacion } });
    const relocatedHistory = await prisma.historialLiderazgo.findUniqueOrThrow({ where: { idHistorialLiderazgo: history.idHistorialLiderazgo } });
    expect(relocatedAppeal.idCandidatoPropuesto).toBe(relocatedId);
    expect(relocatedHistory.idLiderNuevo).toBe(relocatedId);
    expect(await prisma.usuario.count({ where: { idUsuario: C } })).toBe(0);
    expect(await prisma.apelacionLiderazgo.count({ where: { idCandidatoPropuesto: C } })).toBe(0);
  });
});
