import { afterAll, beforeAll, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  createIntegrationParticipation,
  createIntegrationProject,
  createIntegrationProjectRole,
  createIntegrationSprint,
  createIntegrationTask,
  createIntegrationTaskAssignment,
  createIntegrationUser,
} from './setup/fixtures';
import { cleanupIntegrationFixtures } from './setup/cleanup';
import { closureLifecycleStack } from './setup/closure-lifecycle';
import { flowAStack } from './setup/flow-a';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import {
  applyManifest,
  assessManifest,
  computeBaseline,
  diagnose,
  manifestHash,
  verifyManifest,
  manifestEntriesHash,
  resolveAdmin,
  validateManifest,
  LegacyCliError,
  LegacyDivergenceError,
  LEGACY_MANIFEST_VERSION,
  type LegacyManifest,
  type LegacyManifestEntry,
} from '../../scripts/sprint7-legacy';

/**
 * T23-A (06 v2 §14): el modo `diagnose` de la CLI de conciliación legacy
 * clasifica los siete predicados sin escribir absolutamente nada.
 *
 * La prueba planta un caso de cada predicado, incluido un tramo cuya tarea está
 * eliminada, y compara un hash de todas las tablas implicadas antes y después
 * de diagnosticar.
 */
describeIntegration('S7 conciliación legacy (T23)', () => {
  let prisma: PrismaClient;

  // Scope de limpieza: solo IDs creados por esta suite.
  const scope: {
    assignmentIds: number[];
    taskIds: number[];
    sprintIds: number[];
    participationIds: number[];
    roleIds: number[];
    projectIds: number[];
    userIds: number[];
  } = {
    assignmentIds: [],
    taskIds: [],
    sprintIds: [],
    participationIds: [],
    roleIds: [],
    projectIds: [],
    userIds: [],
  };

  let adminId = 0;
  let outsiderId = 0;
  let healthyProjectId = 0;
  let mainProjectId = 0;

  // T24-A: tramo con fuente mixta en disputa (caché manual 12.00 frente a
  // registros que suman 7.00), clasificado POR_CONCILIAR.
  const disputed = {
    projectId: 0,
    sprintId: 0,
    taskId: 0,
    assignmentId: 0,
    participationId: 0,
    leaderId: 0,
    memberId: 0,
  };

  // T24-B: tramo LEGACY con importe histórico y sin registros.
  const legacyCase = {
    projectId: 0,
    sprintId: 0,
    taskId: 0,
    legacyAssignmentId: 0,
    participationId: 0,
    leaderId: 0,
    memberId: 0,
  };

  // T22-A: caso inequívoco — FK ausente pero demostrable, no consumido y sin
  // agregado previo (fila 2 de la tabla de 06 v2 §14).
  const unequivocal = {
    projectId: 0,
    sprintId: 0,
    taskId: 0,
    assignmentId: 0,
    participationId: 0,
  };

  // Casos de T23-B: atribuciones que NO pueden demostrarse.
  const ambiguous = {
    projectId: 0,
    sprintId: 0,
    multiHistoryAssignment: 0,
    firstParticipation: 0,
    secondParticipation: 0,
    reactivatedAssignment: 0,
    reactivatedParticipation: 0,
    approvedAggregateAssignment: 0,
    approvedAggregateParticipation: 0,
    approvedAggregate: 0,
    porConciliarAssignment: 0,
  };
  let rolAccesoId: number | null = null;
  let usuarioRolAccesoId: number | null = null;

  // IDs concretos que los asserts esperan encontrar en cada grupo.
  const planted = {
    p01Assignment: 0,
    p02OpenAssignment: 0,
    p02RecognisedAssignment: 0,
    p03OpenAssignment: 0,
    p03DoneTask: 0,
    p04Project: 0,
    p05Assignment: 0,
    p06Aggregate: 0,
    p07Project: 0,
    deletedTaskAssignment: 0,
    legacyAssignment: 0,
    granularAssignment: 0,
    nullCacheAssignment: 0,
    porConciliarAssignment: 0,
  };

  /**
   * Huella de todas las tablas que el diagnóstico consulta. Cualquier escritura
   * — insert, update o delete — cambiaría este valor.
   */
  async function fingerprintTables(): Promise<string> {
    const rows = await prisma.$queryRawUnsafe<Array<{ tabla: string; huella: string }>>(`
      SELECT 'asignacion_tarea' AS tabla,
             COALESCE(md5(string_agg(t::text, '|' ORDER BY t.id_asignacion)), 'vacio') AS huella
      FROM asignacion_tarea t
      UNION ALL
      SELECT 'registro_tiempo_tarea',
             COALESCE(md5(string_agg(t::text, '|' ORDER BY t.id_registro_tiempo)), 'vacio')
      FROM registro_tiempo_tarea t
      UNION ALL
      SELECT 'tarea', COALESCE(md5(string_agg(t::text, '|' ORDER BY t.id_tarea)), 'vacio') FROM tarea t
      UNION ALL
      SELECT 'sprint', COALESCE(md5(string_agg(t::text, '|' ORDER BY t.id_sprint)), 'vacio') FROM sprint t
      UNION ALL
      SELECT 'proyecto', COALESCE(md5(string_agg(t::text, '|' ORDER BY t.id_proyecto)), 'vacio') FROM proyecto t
      UNION ALL
      SELECT 'participacion_proyecto',
             COALESCE(md5(string_agg(t::text, '|' ORDER BY t.id_participacion)), 'vacio')
      FROM participacion_proyecto t
      UNION ALL
      SELECT 'horas_participacion',
             COALESCE(md5(string_agg(t::text, '|' ORDER BY t.id_registro_horas)), 'vacio')
      FROM horas_participacion t
      UNION ALL
      SELECT 'bitacora_auditoria',
             COALESCE(md5(string_agg(t::text, '|' ORDER BY t.id_auditoria)), 'vacio')
      FROM bitacora_auditoria t
      ORDER BY tabla
    `);
    return rows.map((row) => `${row.tabla}=${row.huella}`).join(';');
  }

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();

    const admin = await createIntegrationUser(prisma);
    const outsider = await createIntegrationUser(prisma);
    const worker = await createIntegrationUser(prisma);
    adminId = admin.idUsuario;
    outsiderId = outsider.idUsuario;
    scope.userIds.push(admin.idUsuario, outsider.idUsuario, worker.idUsuario);

    // El admin se resuelve exactamente como en producción: usuarioRolAcceso →
    // rolAcceso.nombrePerfil = 'administrador'.
    const rolAcceso = await prisma.rolAcceso.upsert({
      where: { nombrePerfil: 'administrador' },
      update: {},
      create: { nombrePerfil: 'administrador' },
    });
    rolAccesoId = rolAcceso.idRolAcceso;
    const link = await prisma.usuarioRolAcceso.create({
      data: { idUsuario: adminId, idRolAcceso: rolAcceso.idRolAcceso },
    });
    usuarioRolAccesoId = link.idUsuarioRolAcceso;

    // ── Proyecto principal: alberga P-01, P-02, P-03, P-05 y la clasificación.
    const project = await createIntegrationProject(prisma, adminId, {
      estadoProyecto: 'EN_PROGRESO',
    });
    mainProjectId = project.idProyecto;
    scope.projectIds.push(project.idProyecto);
    const role = await createIntegrationProjectRole(prisma, project.idProyecto);
    scope.roleIds.push(role.idRolProyecto);
    const participation = await createIntegrationParticipation(
      prisma,
      worker.idUsuario,
      role.idRolProyecto,
    );
    scope.participationIds.push(participation.idParticipacion);

    const closedSprint = await createIntegrationSprint(prisma, project.idProyecto, {
      numero: 1,
      estado: 'CERRADO',
    });
    const activeSprint = await createIntegrationSprint(prisma, project.idProyecto, {
      numero: 2,
      estado: 'ACTIVO',
    });
    scope.sprintIds.push(closedSprint.idSprint, activeSprint.idSprint);

    const closedTask = await createIntegrationTask(
      prisma,
      project.idProyecto,
      adminId,
      closedSprint.idSprint,
    );
    const activeTask = await createIntegrationTask(
      prisma,
      project.idProyecto,
      adminId,
      activeSprint.idSprint,
    );
    // `asignacion_tarea_activa_unique` permite un único tramo ABIERTO por
    // tarea, así que cada tramo abierto de esta suite necesita su propia tarea.
    const healthyTask = await createIntegrationTask(
      prisma,
      project.idProyecto,
      adminId,
      activeSprint.idSprint,
    );
    // Tarea eliminada: el diagnóstico DEBE seguir viéndola (06 v2 §14/§15).
    const deletedTask = await createIntegrationTask(
      prisma,
      project.idProyecto,
      adminId,
      closedSprint.idSprint,
    );
    await prisma.tarea.update({
      where: { idTarea: deletedTask.idTarea },
      data: { eliminadoEn: new Date() },
    });
    // Tarea HECHO en Sprint cerrado y sin ninguna asignación → P-03.
    const doneTask = await createIntegrationTask(
      prisma,
      project.idProyecto,
      adminId,
      closedSprint.idSprint,
      { estadoTarea: 'HECHO' },
    );
    scope.taskIds.push(
      closedTask.idTarea,
      activeTask.idTarea,
      healthyTask.idTarea,
      deletedTask.idTarea,
      doneTask.idTarea,
    );
    planted.p03DoneTask = doneTask.idTarea;

    // P-01: importe presente, participación NULA.
    const p01 = await createIntegrationTaskAssignment(
      prisma,
      activeTask.idTarea,
      worker.idUsuario,
      adminId,
      { horasReales: '4.00', desasignadaEn: new Date(), origenReporte: 'LEGACY' },
    );
    scope.assignmentIds.push(p01.idAsignacion);
    planted.p01Assignment = p01.idAsignacion;
    planted.legacyAssignment = p01.idAsignacion;

    // P-02 abierto: GRANULAR con un registro de 3.00 pero caché 5.00.
    const p02Open = await createIntegrationTaskAssignment(
      prisma,
      activeTask.idTarea,
      worker.idUsuario,
      adminId,
      { idParticipacion: participation.idParticipacion, horasReales: '5.00' },
    );
    scope.assignmentIds.push(p02Open.idAsignacion);
    planted.p02OpenAssignment = p02Open.idAsignacion;
    planted.porConciliarAssignment = p02Open.idAsignacion;
    await prisma.registroTiempoTarea.create({
      data: {
        idAsignacion: p02Open.idAsignacion,
        idUsuario: worker.idUsuario,
        horas: '3.00',
        fecha: new Date('2026-03-02'),
      },
    });

    // P-02 ya reconocido: GRANULAR, caché 9.00, registro 2.00, reconocidoEn set.
    const p02Recognised = await createIntegrationTaskAssignment(
      prisma,
      closedTask.idTarea,
      worker.idUsuario,
      adminId,
      {
        idParticipacion: participation.idParticipacion,
        horasReales: '9.00',
        desasignadaEn: new Date(),
        reconocidoEn: new Date(),
      },
    );
    scope.assignmentIds.push(p02Recognised.idAsignacion);
    planted.p02RecognisedAssignment = p02Recognised.idAsignacion;
    await prisma.registroTiempoTarea.create({
      data: {
        idAsignacion: p02Recognised.idAsignacion,
        idUsuario: worker.idUsuario,
        horas: '2.00',
        fecha: new Date('2026-03-03'),
      },
    });

    // P-03: tramo todavía abierto dentro de un Sprint CERRADO.
    const p03 = await createIntegrationTaskAssignment(
      prisma,
      closedTask.idTarea,
      worker.idUsuario,
      adminId,
      { idParticipacion: participation.idParticipacion, desasignadaEn: null },
    );
    scope.assignmentIds.push(p03.idAsignacion);
    planted.p03OpenAssignment = p03.idAsignacion;
    planted.nullCacheAssignment = p03.idAsignacion;

    // P-05: Sprint cerrado, importe presente y reconocidoEn NULL. Además su
    // tarea está ELIMINADA, así que cubre a la vez la exigencia de incluir
    // tareas eliminadas en el diagnóstico.
    const p05 = await createIntegrationTaskAssignment(
      prisma,
      deletedTask.idTarea,
      worker.idUsuario,
      adminId,
      {
        idParticipacion: participation.idParticipacion,
        horasReales: '7.50',
        desasignadaEn: new Date(),
        origenReporte: 'LEGACY',
      },
    );
    scope.assignmentIds.push(p05.idAsignacion);
    planted.p05Assignment = p05.idAsignacion;
    planted.deletedTaskAssignment = p05.idAsignacion;

    // Tramo sano: GRANULAR con caché igual a la suma de sus registros.
    const healthy = await createIntegrationTaskAssignment(
      prisma,
      healthyTask.idTarea,
      worker.idUsuario,
      adminId,
      { idParticipacion: participation.idParticipacion, horasReales: '6.00' },
    );
    scope.assignmentIds.push(healthy.idAsignacion);
    planted.granularAssignment = healthy.idAsignacion;
    await prisma.registroTiempoTarea.create({
      data: {
        idAsignacion: healthy.idAsignacion,
        idUsuario: worker.idUsuario,
        horas: '6.00',
        fecha: new Date('2026-03-04'),
      },
    });

    // P-06: agregado con idSprint NULL sobre la participación existente.
    const aggregate = await prisma.horasParticipacion.create({
      data: {
        idParticipacion: participation.idParticipacion,
        periodoInicio: new Date('2026-03-01'),
        periodoFin: new Date('2026-03-31'),
        horasReportadas: '10.00',
        idSprint: null,
      },
    });
    planted.p06Aggregate = aggregate.idRegistroHoras;

    // ── P-04: proyecto terminal con soft-delete.
    const terminal = await createIntegrationProject(prisma, adminId, {
      estadoProyecto: 'CERRADO',
    });
    await prisma.proyecto.update({
      where: { idProyecto: terminal.idProyecto },
      data: { eliminadoEn: new Date() },
    });
    planted.p04Project = terminal.idProyecto;
    scope.projectIds.push(terminal.idProyecto);

    // ── P-07: proyecto en solicitud de cierre sin ninguna revisión.
    const awaiting = await createIntegrationProject(prisma, adminId, {
      estadoProyecto: 'EN_SOLICITUD_CIERRE',
    });
    planted.p07Project = awaiting.idProyecto;
    scope.projectIds.push(awaiting.idProyecto);

    // ────────────────────────────────────────────────────────────────────────
    // T23-B: proyecto con tres atribuciones NO demostrables.
    // ────────────────────────────────────────────────────────────────────────
    const ambiguousProject = await createIntegrationProject(prisma, adminId, {
      estadoProyecto: 'EN_PROGRESO',
    });
    ambiguous.projectId = ambiguousProject.idProyecto;
    scope.projectIds.push(ambiguousProject.idProyecto);
    const ambiguousSprint = await createIntegrationSprint(prisma, ambiguousProject.idProyecto, {
      numero: 1,
      estado: 'CERRADO',
    });
    ambiguous.sprintId = ambiguousSprint.idSprint;
    scope.sprintIds.push(ambiguousSprint.idSprint);

    // Caso 1 — dos historias de participación con ROLES DISTINTOS.
    const roleA = await createIntegrationProjectRole(prisma, ambiguousProject.idProyecto, {
      nombreRol: 'Rol historico A',
    });
    const roleB = await createIntegrationProjectRole(prisma, ambiguousProject.idProyecto, {
      nombreRol: 'Rol historico B',
    });
    scope.roleIds.push(roleA.idRolProyecto, roleB.idRolProyecto);
    const historyA = await createIntegrationParticipation(prisma, worker.idUsuario, roleA.idRolProyecto, {
      estadoParticipacion: 'RETIRADO',
    });
    // La segunda historia está ACTIVA hoy: es precisamente la que un
    // desempate ingenuo elegiría, y la que la CLI NO debe elegir.
    const historyB = await createIntegrationParticipation(prisma, worker.idUsuario, roleB.idRolProyecto, {
      estadoParticipacion: 'ACTIVO',
    });
    scope.participationIds.push(historyA.idParticipacion, historyB.idParticipacion);
    ambiguous.firstParticipation = historyA.idParticipacion;
    ambiguous.secondParticipation = historyB.idParticipacion;

    const multiTask = await createIntegrationTask(
      prisma,
      ambiguousProject.idProyecto,
      adminId,
      ambiguousSprint.idSprint,
    );
    scope.taskIds.push(multiTask.idTarea);
    const multiAssignment = await createIntegrationTaskAssignment(
      prisma,
      multiTask.idTarea,
      worker.idUsuario,
      adminId,
      { horasReales: '3.00', desasignadaEn: new Date(), origenReporte: 'POR_CONCILIAR' },
    );
    scope.assignmentIds.push(multiAssignment.idAsignacion);
    ambiguous.multiHistoryAssignment = multiAssignment.idAsignacion;
    // Este mismo tramo es el que deja el proyecto en LEGACY_SIN_CONCILIAR.
    ambiguous.porConciliarAssignment = multiAssignment.idAsignacion;

    // Caso 2 — participación reactivada: fechaIngreso posterior al tramo.
    const reactivatedUser = await createIntegrationUser(prisma);
    scope.userIds.push(reactivatedUser.idUsuario);
    const roleC = await createIntegrationProjectRole(prisma, ambiguousProject.idProyecto, {
      nombreRol: 'Rol reactivado',
    });
    scope.roleIds.push(roleC.idRolProyecto);
    const reactivated = await createIntegrationParticipation(
      prisma,
      reactivatedUser.idUsuario,
      roleC.idRolProyecto,
    );
    scope.participationIds.push(reactivated.idParticipacion);
    ambiguous.reactivatedParticipation = reactivated.idParticipacion;

    const reactivatedTask = await createIntegrationTask(
      prisma,
      ambiguousProject.idProyecto,
      adminId,
      ambiguousSprint.idSprint,
    );
    scope.taskIds.push(reactivatedTask.idTarea);
    const reactivatedAssignment = await createIntegrationTaskAssignment(
      prisma,
      reactivatedTask.idTarea,
      reactivatedUser.idUsuario,
      adminId,
      { horasReales: '2.00', desasignadaEn: new Date(), origenReporte: 'LEGACY' },
    );
    scope.assignmentIds.push(reactivatedAssignment.idAsignacion);
    ambiguous.reactivatedAssignment = reactivatedAssignment.idAsignacion;
    // El tramo es anterior; la reactivación reescribió la fecha de ingreso.
    await prisma.asignacionTarea.update({
      where: { idAsignacion: reactivatedAssignment.idAsignacion },
      data: { fechaAsignacion: new Date('2026-01-10T00:00:00.000Z') },
    });
    await prisma.participacionProyecto.update({
      where: { idParticipacion: reactivated.idParticipacion },
      data: { fechaIngreso: new Date('2026-05-01T00:00:00.000Z') },
    });

    // Caso 3 — agregado ya APROBADA sobre una participación inequívoca.
    const approvedUser = await createIntegrationUser(prisma);
    scope.userIds.push(approvedUser.idUsuario);
    const roleD = await createIntegrationProjectRole(prisma, ambiguousProject.idProyecto, {
      nombreRol: 'Rol con agregado aprobado',
    });
    scope.roleIds.push(roleD.idRolProyecto);
    const approvedParticipation = await createIntegrationParticipation(
      prisma,
      approvedUser.idUsuario,
      roleD.idRolProyecto,
    );
    scope.participationIds.push(approvedParticipation.idParticipacion);
    ambiguous.approvedAggregateParticipation = approvedParticipation.idParticipacion;

    const approvedTask = await createIntegrationTask(
      prisma,
      ambiguousProject.idProyecto,
      adminId,
      ambiguousSprint.idSprint,
    );
    scope.taskIds.push(approvedTask.idTarea);
    const approvedAssignment = await createIntegrationTaskAssignment(
      prisma,
      approvedTask.idTarea,
      approvedUser.idUsuario,
      adminId,
      {
        idParticipacion: approvedParticipation.idParticipacion,
        horasReales: '1.00',
        desasignadaEn: new Date(),
        origenReporte: 'LEGACY',
      },
    );
    scope.assignmentIds.push(approvedAssignment.idAsignacion);
    ambiguous.approvedAggregateAssignment = approvedAssignment.idAsignacion;

    const approvedAggregate = await prisma.horasParticipacion.create({
      data: {
        idParticipacion: approvedParticipation.idParticipacion,
        periodoInicio: new Date('2026-01-01'),
        periodoFin: new Date('2026-01-31'),
        horasReportadas: '1.00',
        horasCalculadas: '1.00',
        horasAprobadas: '1.00',
        estadoHoras: 'APROBADA',
        aprobadoPor: adminId,
        fechaAprobacion: new Date('2026-02-01T00:00:00.000Z'),
        idSprint: ambiguousSprint.idSprint,
      },
    });
    ambiguous.approvedAggregate = approvedAggregate.idRegistroHoras;

    // ────────────────────────────────────────────────────────────────────────
    // T22-A: proyecto con un único caso inequívoco.
    // ────────────────────────────────────────────────────────────────────────
    const unequivocalUser = await createIntegrationUser(prisma);
    scope.userIds.push(unequivocalUser.idUsuario);
    const unequivocalProject = await createIntegrationProject(prisma, adminId, {
      estadoProyecto: 'EN_PROGRESO',
    });
    unequivocal.projectId = unequivocalProject.idProyecto;
    scope.projectIds.push(unequivocalProject.idProyecto);
    const unequivocalRole = await createIntegrationProjectRole(
      prisma,
      unequivocalProject.idProyecto,
    );
    scope.roleIds.push(unequivocalRole.idRolProyecto);
    // UNA sola historia de participación: nada que desempatar.
    const unequivocalParticipation = await createIntegrationParticipation(
      prisma,
      unequivocalUser.idUsuario,
      unequivocalRole.idRolProyecto,
    );
    scope.participationIds.push(unequivocalParticipation.idParticipacion);
    unequivocal.participationId = unequivocalParticipation.idParticipacion;
    await prisma.participacionProyecto.update({
      where: { idParticipacion: unequivocalParticipation.idParticipacion },
      data: { fechaIngreso: new Date('2026-01-01T00:00:00.000Z') },
    });

    const unequivocalSprint = await createIntegrationSprint(prisma, unequivocalProject.idProyecto, {
      numero: 1,
      estado: 'CERRADO',
    });
    unequivocal.sprintId = unequivocalSprint.idSprint;
    scope.sprintIds.push(unequivocalSprint.idSprint);
    const unequivocalTask = await createIntegrationTask(
      prisma,
      unequivocalProject.idProyecto,
      adminId,
      unequivocalSprint.idSprint,
      { estadoTarea: 'HECHO' },
    );
    unequivocal.taskId = unequivocalTask.idTarea;
    scope.taskIds.push(unequivocalTask.idTarea);
    const unequivocalAssignment = await createIntegrationTaskAssignment(
      prisma,
      unequivocalTask.idTarea,
      unequivocalUser.idUsuario,
      adminId,
      {
        // Sin participación: es justo lo que el manifiesto debe completar.
        horasReales: '8.00',
        desasignadaEn: new Date('2026-03-15T00:00:00.000Z'),
        origenReporte: 'LEGACY',
      },
    );
    unequivocal.assignmentId = unequivocalAssignment.idAsignacion;
    scope.assignmentIds.push(unequivocalAssignment.idAsignacion);
    await prisma.asignacionTarea.update({
      where: { idAsignacion: unequivocalAssignment.idAsignacion },
      data: { fechaAsignacion: new Date('2026-02-01T00:00:00.000Z') },
    });

    // ────────────────────────────────────────────────────────────────────────
    // T24-A: fuente mixta que NO puede resolverse por suma ciega.
    // ────────────────────────────────────────────────────────────────────────
    const disputedLeader = await createIntegrationUser(prisma);
    const disputedMember = await createIntegrationUser(prisma);
    scope.userIds.push(disputedLeader.idUsuario, disputedMember.idUsuario);
    disputed.leaderId = disputedLeader.idUsuario;
    disputed.memberId = disputedMember.idUsuario;

    const disputedProject = await createIntegrationProject(prisma, disputedLeader.idUsuario, {
      estadoProyecto: 'EN_PROGRESO',
    });
    disputed.projectId = disputedProject.idProyecto;
    scope.projectIds.push(disputedProject.idProyecto);
    const disputedRole = await createIntegrationProjectRole(prisma, disputedProject.idProyecto, {
      cupos: 3,
    });
    scope.roleIds.push(disputedRole.idRolProyecto);
    const disputedParticipation = await createIntegrationParticipation(
      prisma,
      disputedMember.idUsuario,
      disputedRole.idRolProyecto,
      { estadoParticipacion: 'ACTIVO' },
    );
    scope.participationIds.push(disputedParticipation.idParticipacion);
    disputed.participationId = disputedParticipation.idParticipacion;

    const disputedSprint = await createIntegrationSprint(prisma, disputedProject.idProyecto, {
      numero: 1,
      estado: 'ACTIVO',
    });
    disputed.sprintId = disputedSprint.idSprint;
    scope.sprintIds.push(disputedSprint.idSprint);
    const disputedTask = await createIntegrationTask(
      prisma,
      disputedProject.idProyecto,
      disputedLeader.idUsuario,
      disputedSprint.idSprint,
      { estadoTarea: 'HECHO' },
    );
    disputed.taskId = disputedTask.idTarea;
    scope.taskIds.push(disputedTask.idTarea);
    const disputedAssignment = await createIntegrationTaskAssignment(
      prisma,
      disputedTask.idTarea,
      disputedMember.idUsuario,
      disputedLeader.idUsuario,
      {
        idParticipacion: disputedParticipation.idParticipacion,
        // Caché manual histórica que NO coincide con la suma de registros.
        horasReales: '12.00',
        origenReporte: 'POR_CONCILIAR',
        // Cerrado: así el Sprint no se detiene antes por «asignaciones
        // abiertas» y llega al predicado de procedencia, que es lo que
        // este contrato demuestra.
        desasignadaEn: new Date('2026-04-30T00:00:00.000Z'),
      },
    );
    disputed.assignmentId = disputedAssignment.idAsignacion;
    scope.assignmentIds.push(disputedAssignment.idAsignacion);
    for (const horas of ['4.00', '3.00']) {
      await prisma.registroTiempoTarea.create({
        data: {
          idAsignacion: disputedAssignment.idAsignacion,
          idUsuario: disputedMember.idUsuario,
          horas,
          fecha: new Date('2026-04-10'),
        },
      });
    }

    // ────────────────────────────────────────────────────────────────────────
    // T24-B: tramo LEGACY de 9.00 sin registros, abierto.
    // ────────────────────────────────────────────────────────────────────────
    const legacyLeader = await createIntegrationUser(prisma);
    const legacyMember = await createIntegrationUser(prisma);
    scope.userIds.push(legacyLeader.idUsuario, legacyMember.idUsuario);
    legacyCase.leaderId = legacyLeader.idUsuario;
    legacyCase.memberId = legacyMember.idUsuario;

    const legacyProject = await createIntegrationProject(prisma, legacyLeader.idUsuario, {
      estadoProyecto: 'EN_PROGRESO',
    });
    legacyCase.projectId = legacyProject.idProyecto;
    scope.projectIds.push(legacyProject.idProyecto);
    const legacyRole = await createIntegrationProjectRole(prisma, legacyProject.idProyecto, {
      cupos: 3,
    });
    scope.roleIds.push(legacyRole.idRolProyecto);
    const legacyParticipation = await createIntegrationParticipation(
      prisma,
      legacyMember.idUsuario,
      legacyRole.idRolProyecto,
      { estadoParticipacion: 'ACTIVO' },
    );
    scope.participationIds.push(legacyParticipation.idParticipacion);
    legacyCase.participationId = legacyParticipation.idParticipacion;

    const legacySprint = await createIntegrationSprint(prisma, legacyProject.idProyecto, {
      numero: 1,
      estado: 'ACTIVO',
    });
    legacyCase.sprintId = legacySprint.idSprint;
    scope.sprintIds.push(legacySprint.idSprint);
    const legacyTask = await createIntegrationTask(
      prisma,
      legacyProject.idProyecto,
      legacyLeader.idUsuario,
      legacySprint.idSprint,
      { estadoTarea: 'HECHO', idRolProyecto: legacyRole.idRolProyecto },
    );
    legacyCase.taskId = legacyTask.idTarea;
    scope.taskIds.push(legacyTask.idTarea);
    // Estimación deliberadamente pequeña: si el legacy contase para la
    // sobreestimación, la dispararía. No debe hacerlo.
    await prisma.tarea.update({
      where: { idTarea: legacyTask.idTarea },
      data: { tiempoEstimadoHoras: 5 },
    });
    const legacyAssignment = await createIntegrationTaskAssignment(
      prisma,
      legacyTask.idTarea,
      legacyMember.idUsuario,
      legacyLeader.idUsuario,
      {
        idParticipacion: legacyParticipation.idParticipacion,
        horasReales: '9.00',
        origenReporte: 'LEGACY',
      },
    );
    legacyCase.legacyAssignmentId = legacyAssignment.idAsignacion;
    scope.assignmentIds.push(legacyAssignment.idAsignacion);

    // ── Proyecto SANO de control: nada que conciliar.
    const controlProject = await createIntegrationProject(prisma, adminId, {
      estadoProyecto: 'EN_PROGRESO',
    });
    healthyProjectId = controlProject.idProyecto;
    scope.projectIds.push(controlProject.idProyecto);
    const healthySprint = await createIntegrationSprint(prisma, controlProject.idProyecto, {
      numero: 1,
      estado: 'CERRADO',
    });
    scope.sprintIds.push(healthySprint.idSprint);
  });

  afterAll(async () => {
    await prisma.horasParticipacion.deleteMany({
      where: { idParticipacion: { in: scope.participationIds } },
    });
    if (usuarioRolAccesoId !== null) {
      await prisma.usuarioRolAcceso.deleteMany({
        where: { idUsuarioRolAcceso: usuarioRolAccesoId },
      });
    }
    await cleanupIntegrationFixtures(prisma, scope);
    // El rol de acceso se creó con upsert: solo se retira si quedó huérfano,
    // para no arrastrarse a suites que lo hayan encontrado ya creado.
    if (rolAccesoId !== null) {
      const remaining = await prisma.usuarioRolAcceso.count({
        where: { idRolAcceso: rolAccesoId },
      });
      if (remaining === 0) {
        await prisma.rolAcceso.deleteMany({ where: { idRolAcceso: rolAccesoId } });
      }
    }
    await prisma.$disconnect();
  });

  it('T23-A: diagnose clasifica los siete predicados incluyendo tareas eliminadas y no escribe nada', async () => {
    // ── Un actor sin rol de administrador aborta antes de consultar nada.
    await expect(resolveAdmin(prisma, outsiderId)).rejects.toBeInstanceOf(LegacyCliError);
    await expect(resolveAdmin(prisma, outsiderId)).rejects.toMatchObject({ exitCode: 3 });

    // ── El admin real sí resuelve.
    const admin = await resolveAdmin(prisma, adminId);
    expect(admin.idUsuario).toBe(adminId);

    const before = await fingerprintTables();
    const report = await diagnose(prisma);
    const after = await fingerprintTables();

    // ── Ninguna fila cambió: el modo es estrictamente de lectura.
    expect(after).toBe(before);

    const ids = (rows: Array<Record<string, unknown>>, column: string): unknown[] =>
      rows.map((row) => row[column]);

    // ── P-01: el tramo con participación nula aparece con su motivo.
    expect(ids(report.p01, 'idAsignacion')).toContain(planted.p01Assignment);
    expect(
      report.p01.find((row) => row.idAsignacion === planted.p01Assignment)?.motivo,
    ).toBe('PARTICIPACION_NULA');

    // ── P-02: la divergencia caché/suma se detecta tanto abierta como ya
    //    reconocida; el tramo coherente NO aparece.
    expect(ids(report.p02, 'idAsignacion')).toEqual(
      expect.arrayContaining([planted.p02OpenAssignment, planted.p02RecognisedAssignment]),
    );
    expect(ids(report.p02, 'idAsignacion')).not.toContain(planted.granularAssignment);
    expect(
      report.p02.find((row) => row.idAsignacion === planted.p02OpenAssignment)?.abierto,
    ).toBe(true);
    expect(
      report.p02.find((row) => row.idAsignacion === planted.p02RecognisedAssignment)?.reconocido,
    ).toBe(true);

    // ── P-03: tramo abierto en Sprint cerrado y tarea HECHO sin ejecución.
    expect(ids(report.p03, 'idAsignacion')).toContain(planted.p03OpenAssignment);
    expect(
      report.p03.some(
        (row) => row.idTarea === planted.p03DoneTask && row.motivo === 'TAREA_HECHO_SIN_EJECUCION',
      ),
    ).toBe(true);

    // ── P-04: proyecto terminal con soft-delete.
    expect(ids(report.p04, 'idProyecto')).toContain(planted.p04Project);
    expect(
      report.p04.find((row) => row.idProyecto === planted.p04Project)?.motivo,
    ).toBe('TERMINAL_CON_SOFT_DELETE');

    // ── P-05: reporte no consumido en Sprint cerrado, con la proyección de
    //    columnas EXACTA de 06 v2 §14 y la tarea eliminada incluida.
    const p05Row = report.p05.find((row) => row.id_asignacion === planted.p05Assignment);
    expect(p05Row).toBeDefined();
    expect(Object.keys(p05Row as object)).toEqual([
      'id_proyecto',
      'id_sprint',
      'id_asignacion',
      'id_usuario',
      'id_participacion',
      'horas_reales',
      'desasignada_en',
      'reconocido_en',
      'eliminado_en',
    ]);
    expect(p05Row?.eliminado_en).not.toBeNull();

    // ── P-06: agregado con idSprint NULL.
    expect(ids(report.p06, 'idRegistroHoras')).toContain(planted.p06Aggregate);
    expect(
      report.p06.find((row) => row.idRegistroHoras === planted.p06Aggregate)?.motivo,
    ).toBe('AGREGADO_SIN_SPRINT');

    // ── P-07: proyecto en solicitud de cierre sin revisiones.
    expect(ids(report.p07, 'idProyecto')).toContain(planted.p07Project);

    // ── Clasificación de procedencia por las cuatro reglas de §14.
    const byAssignment = new Map(report.clasificacion.map((row) => [row.idAsignacion, row]));
    expect(byAssignment.get(planted.legacyAssignment)?.origenSugerido).toBe('LEGACY');
    expect(byAssignment.get(planted.legacyAssignment)?.motivo).toBe('SIN_REGISTROS_CACHE_NO_NULA');
    expect(byAssignment.get(planted.granularAssignment)?.origenSugerido).toBe('GRANULAR');
    expect(byAssignment.get(planted.granularAssignment)?.motivo).toBe(
      'REGISTROS_Y_CACHE_COHERENTE',
    );
    expect(byAssignment.get(planted.nullCacheAssignment)?.origenSugerido).toBe('GRANULAR');
    expect(byAssignment.get(planted.nullCacheAssignment)?.motivo).toBe('SIN_REGISTROS_CACHE_NULA');
    expect(byAssignment.get(planted.porConciliarAssignment)?.origenSugerido).toBe('POR_CONCILIAR');
    expect(byAssignment.get(planted.porConciliarAssignment)?.motivo).toBe('MEZCLA_O_DISCREPANCIA');

    // ── El tramo de la tarea eliminada está clasificado igual que cualquier
    //    otro: el conjunto histórico no excluye lo borrado.
    expect(byAssignment.has(planted.deletedTaskAssignment)).toBe(true);

    // ── La bitácora no participa en ninguna decisión de importes: el
    //    diagnóstico no la consulta y su huella permanece intacta.
    expect(after).toContain('bitacora_auditoria=');
  });
  it('T23-B: apply rechaza los casos ambiguos, no elige la participación activa actual y bloquea solo el proyecto afectado', async () => {
    const before = await fingerprintTables();

    const entradas: LegacyManifestEntry[] = [
      // Caso 1: el usuario tuvo DOS historias de participación con roles
      // distintos. El manifiesto propone una; la CLI no puede demostrarla.
      {
        accion: 'ENLAZAR',
        idAsignacion: ambiguous.multiHistoryAssignment,
        idParticipacion: ambiguous.firstParticipation,
        idRegistroHoras: null,
        importeAnterior: '3.00',
        importeEsperado: '3.00',
      },
      // Caso 2: la participación fue reactivada y su fechaIngreso reescrita, de
      // modo que es posterior al propio tramo.
      {
        accion: 'ENLAZAR',
        idAsignacion: ambiguous.reactivatedAssignment,
        idParticipacion: ambiguous.reactivatedParticipation,
        idRegistroHoras: null,
        importeAnterior: '2.00',
        importeEsperado: '2.00',
      },
      // Caso 3: el agregado citado ya está APROBADA.
      {
        accion: 'CONSUMIR_INCREMENTO',
        idAsignacion: ambiguous.approvedAggregateAssignment,
        idParticipacion: ambiguous.approvedAggregateParticipation,
        idRegistroHoras: ambiguous.approvedAggregate,
        importeAnterior: '1.00',
        importeEsperado: '1.00',
      },
    ];
    const manifest: LegacyManifest = {
      version: LEGACY_MANIFEST_VERSION,
      baseline: 'diagnose-t23b',
      adminId,
      projectId: ambiguous.projectId,
      sprintId: ambiguous.sprintId,
      evidencia: 'acta-de-revision-T23B',
      entradas,
      sha256: manifestEntriesHash(entradas),
    };

    const refusals = await assessManifest(prisma, manifest);

    // ── Los tres casos se rechazan, cada uno con su motivo y sus IDs.
    expect(refusals).toHaveLength(3);
    const byAssignment = new Map(refusals.map((row) => [row.idAsignacion, row]));

    const multi = byAssignment.get(ambiguous.multiHistoryAssignment);
    expect(multi?.motivo).toBe('PARTICIPACION_AMBIGUA');
    // El diagnóstico cita AMBAS historias: no elige ninguna.
    expect(multi?.ids).toEqual(
      expect.arrayContaining([ambiguous.firstParticipation, ambiguous.secondParticipation]),
    );

    const reactivated = byAssignment.get(ambiguous.reactivatedAssignment);
    expect(reactivated?.motivo).toBe('FECHA_INGRESO_REESCRITA');
    expect(reactivated?.ids).toEqual([ambiguous.reactivatedParticipation]);

    const approved = byAssignment.get(ambiguous.approvedAggregateAssignment);
    expect(approved?.motivo).toBe('AGREGADO_NO_PENDIENTE');
    expect(approved?.ids).toEqual([ambiguous.approvedAggregate]);

    // ── Evaluar el manifiesto no escribió absolutamente nada.
    expect(await fingerprintTables()).toBe(before);

    // ── El agregado APROBADA conserva su estado y su importe.
    const untouched = await prisma.horasParticipacion.findUniqueOrThrow({
      where: { idRegistroHoras: ambiguous.approvedAggregate },
    });
    expect(untouched.estadoHoras).toBe('APROBADA');
    expect(untouched.horasAprobadas?.toFixed(2)).toBe('1.00');

    // ── El proyecto afectado queda bloqueado por LEGACY_SIN_CONCILIAR.
    const { readiness } = closureLifecycleStack(prisma);
    const afectado = await readiness.evaluate(undefined, ambiguous.projectId, { phase: 'REQUEST' });
    expect(afectado.canSubmit).toBe(false);
    const codigos = afectado.blockers.map((blocker) => blocker.code);
    expect(codigos).toContain('LEGACY_SIN_CONCILIAR');
    const conciliacion = afectado.blockers.find(
      (blocker) => blocker.code === 'LEGACY_SIN_CONCILIAR',
    );
    expect(conciliacion?.ids).toEqual(
      expect.arrayContaining([ambiguous.porConciliarAssignment]),
    );

    // ── La otra mitad de §22: un agregado PENDIENTE sin Sprint tampoco deja
    //    cerrar, y se cita por su identificador.
    const conAgregadoSinSprint = await readiness.evaluate(undefined, mainProjectId, {
      phase: 'REQUEST',
    });
    const agregadoBlocker = conAgregadoSinSprint.blockers.find(
      (blocker) => blocker.code === 'LEGACY_SIN_CONCILIAR',
    );
    expect(agregadoBlocker?.ids).toEqual(expect.arrayContaining([planted.p06Aggregate]));

    // ── El bloqueo está ACOTADO: el proyecto sano no lo sufre.
    const sano = await readiness.evaluate(undefined, healthyProjectId, { phase: 'REQUEST' });
    expect(sano.blockers.map((blocker) => blocker.code)).not.toContain('LEGACY_SIN_CONCILIAR');

    // ── Un manifiesto cuyo SHA-256 no corresponde al conjunto se rechaza
    //    antes de mirar la base: la firma no es decorativa.
    expect(() => validateManifest({ ...manifest, sha256: 'f'.repeat(64) })).toThrow(
      LegacyCliError,
    );

    // ── Y sigue sin haberse tocado ninguna fila.
    expect(await fingerprintTables()).toBe(before);
  });
  it('T22-A: un caso P-05 inequívoco se aplica bajo manifiesto dejando PENDIENTE y una entrada de bitácora auditable', async () => {
    const baseline = await computeBaseline(prisma, unequivocal.projectId, unequivocal.sprintId);
    const build = (
      overrides: Partial<LegacyManifest> = {},
      entryOverrides: Partial<LegacyManifestEntry> = {},
    ): LegacyManifest => {
      const entradas: LegacyManifestEntry[] = [
        {
          accion: 'CONSUMIR_NUEVO',
          idAsignacion: unequivocal.assignmentId,
          idParticipacion: unequivocal.participationId,
          idRegistroHoras: null,
          importeAnterior: '8.00',
          importeEsperado: '8.00',
          ...entryOverrides,
        },
      ];
      return {
        version: LEGACY_MANIFEST_VERSION,
        baseline,
        adminId,
        projectId: unequivocal.projectId,
        sprintId: unequivocal.sprintId,
        evidencia: 'acta-de-revision-T22A',
        entradas,
        sha256: manifestEntriesHash(entradas),
        ...overrides,
      };
    };

    const before = await fingerprintTables();

    // ── Variante 1: SHA-256 del conjunto incorrecto. Ni siquiera se carga.
    expect(() => validateManifest({ ...build(), sha256: '0'.repeat(64) })).toThrow(LegacyCliError);

    // ── Variante 2: importe esperado distinto del almacenado.
    const wrongAmount = build({}, { importeAnterior: '99.00' });
    await expect(
      applyManifest(prisma, wrongAmount, adminId),
    ).rejects.toBeInstanceOf(LegacyDivergenceError);

    // ── Variante 3: baseline de otra ejecución.
    const staleBaseline = build({ baseline: 'baseline-de-otra-ejecucion' });
    await expect(
      applyManifest(prisma, staleBaseline, adminId),
    ).rejects.toBeInstanceOf(LegacyDivergenceError);

    // ── Las tres variantes hicieron rollback completo: cero cambios.
    expect(await fingerprintTables()).toBe(before);

    // ── El manifiesto correcto sí se aplica.
    const result = await applyManifest(prisma, build(), adminId);
    expect(result.applied).toBe(1);
    expect(result.noop).toBe(0);

    const tramo = await prisma.asignacionTarea.findUniqueOrThrow({
      where: { idAsignacion: unequivocal.assignmentId },
    });
    // FK completada y tramo marcado como consumido, con su importe intacto.
    expect(tramo.idParticipacion).toBe(unequivocal.participationId);
    expect(tramo.reconocidoEn).not.toBeNull();
    expect(tramo.horasReales?.toFixed(2)).toBe('8.00');

    // ── El agregado nace PENDIENTE. NUNCA APROBADA.
    const agregados = await prisma.horasParticipacion.findMany({
      where: { idParticipacion: unequivocal.participationId },
    });
    expect(agregados).toHaveLength(1);
    expect(agregados[0].estadoHoras).toBe('PENDIENTE');
    expect(agregados[0].idSprint).toBe(unequivocal.sprintId);
    expect(agregados[0].horasReportadas.toFixed(2)).toBe('8.00');
    expect(agregados[0].horasCalculadas?.toFixed(2)).toBe('8.00');
    expect(agregados[0].horasAprobadas).toBeNull();
    expect(agregados[0].aprobadoPor).toBeNull();

    // ── El Sprint no se reabrió y la tarea cerrada no se tocó.
    const sprint = await prisma.sprint.findUniqueOrThrow({
      where: { idSprint: unequivocal.sprintId },
    });
    expect(sprint.estado).toBe('CERRADO');
    const tarea = await prisma.tarea.findUniqueOrThrow({
      where: { idTarea: unequivocal.taskId },
    });
    expect(tarea.estadoTarea).toBe('HECHO');

    // ── Bitácora: un evento con antes, después y el hash del manifiesto.
    const eventos = await prisma.bitacoraAuditoria.findMany({
      where: { accion: 'LEGACY_HOURS_RECONCILED', idObjeto: String(unequivocal.assignmentId) },
    });
    expect(eventos).toHaveLength(1);
    const detalle = eventos[0].detalleJson as Record<string, unknown>;
    const nuevo = detalle.valorNuevo as Record<string, unknown>;
    const anterior = detalle.valorAnterior as Record<string, unknown>;
    expect(anterior.idParticipacion).toBeNull();
    expect(anterior.reconocido).toBe(false);
    expect(nuevo.idParticipacion).toBe(unequivocal.participationId);
    expect(nuevo.reconocido).toBe(true);
    expect(nuevo.manifestHash).toBe(manifestHash(build()));
    expect(detalle.idProyecto).toBe(unequivocal.projectId);
  });
  it('T22-B: repetir apply con el mismo manifiesto no incrementa nada y verify confirma el estado', async () => {
    // El manifiesto es el MISMO de T22-A; su baseline se recalcula sobre el
    // estado ya conciliado, porque un manifiesto se aplica sobre lo que describe.
    const baseline = await computeBaseline(prisma, unequivocal.projectId, unequivocal.sprintId);
    const entradas: LegacyManifestEntry[] = [
      {
        accion: 'CONSUMIR_NUEVO',
        idAsignacion: unequivocal.assignmentId,
        idParticipacion: unequivocal.participationId,
        idRegistroHoras: null,
        importeAnterior: '8.00',
        importeEsperado: '8.00',
      },
    ];
    const manifest: LegacyManifest = {
      version: LEGACY_MANIFEST_VERSION,
      baseline,
      adminId,
      projectId: unequivocal.projectId,
      sprintId: unequivocal.sprintId,
      evidencia: 'acta-de-revision-T22A',
      entradas,
      sha256: manifestEntriesHash(entradas),
    };

    const agregadoAntes = await prisma.horasParticipacion.findFirstOrThrow({
      where: { idParticipacion: unequivocal.participationId },
    });
    const tramoAntes = await prisma.asignacionTarea.findUniqueOrThrow({
      where: { idAsignacion: unequivocal.assignmentId },
    });
    const eventosAntes = await prisma.bitacoraAuditoria.count({
      where: { accion: 'LEGACY_HOURS_RECONCILED', idObjeto: String(unequivocal.assignmentId) },
    });
    expect(eventosAntes).toBe(1);

    // ── Segundo apply del MISMO manifiesto: no-op.
    const repeated = await applyManifest(prisma, manifest, adminId);
    expect(repeated.applied).toBe(0);
    expect(repeated.noop).toBe(1);

    // El agregado conserva su importe exacto: no se sumó dos veces.
    const agregadoDespues = await prisma.horasParticipacion.findFirstOrThrow({
      where: { idParticipacion: unequivocal.participationId },
    });
    expect(agregadoDespues.horasReportadas.toFixed(2)).toBe(
      agregadoAntes.horasReportadas.toFixed(2),
    );
    expect(agregadoDespues.horasCalculadas?.toFixed(2)).toBe(
      agregadoAntes.horasCalculadas?.toFixed(2),
    );
    expect(agregadoDespues.estadoHoras).toBe('PENDIENTE');

    // El marcador conserva su fecha original: no se reescribe sin motivo.
    const tramoDespues = await prisma.asignacionTarea.findUniqueOrThrow({
      where: { idAsignacion: unequivocal.assignmentId },
    });
    expect(tramoDespues.reconocidoEn?.toISOString()).toBe(tramoAntes.reconocidoEn?.toISOString());

    // Y NO se emitió un segundo evento de conciliación.
    const eventosDespues = await prisma.bitacoraAuditoria.count({
      where: { accion: 'LEGACY_HOURS_RECONCILED', idObjeto: String(unequivocal.assignmentId) },
    });
    expect(eventosDespues).toBe(1);

    // ── verify confirma la correspondencia.
    const verified = await verifyManifest(prisma, manifest);
    expect(verified.ok).toBe(true);
    expect(verified.comprobadas).toBe(1);
    expect(verified.divergencias).toEqual([]);

    // ── Un cambio externo del importe hace fallar a verify.
    await prisma.horasParticipacion.update({
      where: { idRegistroHoras: agregadoDespues.idRegistroHoras },
      data: { horasReportadas: '99.00' },
    });

    const drifted = await verifyManifest(prisma, manifest);
    expect(drifted.ok).toBe(false);
    const divergencia = drifted.divergencias.find(
      (row) => row.motivo === 'IMPORTE_AGREGADO_DIVERGENTE',
    );
    expect(divergencia).toBeDefined();
    expect(divergencia?.idAsignacion).toBe(unequivocal.assignmentId);
    expect(divergencia?.idRegistroHoras).toBe(agregadoDespues.idRegistroHoras);
    expect(divergencia?.esperado).toBe('8.00');
    expect(divergencia?.actual).toBe('99.00');

    // ── verify NO corrigió nada: el drift sigue exactamente donde estaba.
    const trasVerify = await prisma.horasParticipacion.findUniqueOrThrow({
      where: { idRegistroHoras: agregadoDespues.idRegistroHoras },
    });
    expect(trasVerify.horasReportadas.toFixed(2)).toBe('99.00');

    // Se restaura para no contaminar el resto de la suite.
    await prisma.horasParticipacion.update({
      where: { idRegistroHoras: agregadoDespues.idRegistroHoras },
      data: { horasReportadas: agregadoAntes.horasReportadas },
    });
  });
  it('T24-A: un tramo POR_CONCILIAR bloquea consolidar y cerrar, y ningún recálculo destruye su importe', async () => {
    const { service, timeRecords, runner } = flowAStack(prisma);
    const cacheAntes = (
      await prisma.asignacionTarea.findUniqueOrThrow({
        where: { idAsignacion: disputed.assignmentId },
      })
    ).horasReales?.toFixed(2);
    expect(cacheAntes).toBe('12.00');

    const citaElTramo = (error: unknown): void => {
      const response = (error as { getResponse?: () => unknown }).getResponse?.() as {
        code?: string;
        idsAsignacion?: number[];
      };
      expect(response.code).toBe('ORIGEN_SIN_CONCILIAR');
      expect(response.idsAsignacion).toContain(disputed.assignmentId);
    };

    // ── 1. Finalizar el Sprint: 409 citando el tramo ofensivo.
    await expect(
      service.finalizeSprint(disputed.projectId, disputed.sprintId, disputed.leaderId),
    ).rejects.toSatisfy((error: unknown) => {
      citaElTramo(error);
      return true;
    });

    // ── 2. Cerrar el Sprint: también se rechaza. No puede citar el mismo
    //    código porque el Sprint sigue ACTIVO —finalizar acaba de ser
    //    rechazado—, pero cerrar comparte el MISMO
    //    `assertFinalizationPredicatesTx`, así que la procedencia en disputa
    //    lo detendría igualmente si llegara a evaluarse.
    await expect(
      service.closeSprint(disputed.projectId, disputed.sprintId, disputed.leaderId),
    ).rejects.toBeDefined();

    // ── 3. Solicitar el cierre del proyecto: LEGACY_SIN_CONCILIAR.
    const { readiness } = closureLifecycleStack(prisma);
    const resumen = await readiness.evaluate(undefined, disputed.projectId, { phase: 'REQUEST' });
    expect(resumen.canSubmit).toBe(false);
    const blocker = resumen.blockers.find((row) => row.code === 'LEGACY_SIN_CONCILIAR');
    expect(blocker?.ids).toContain(disputed.assignmentId);

    // ── 4. Registrar horas nuevas en ese tramo: tampoco se permite.
    await expect(
      timeRecords.create(disputed.projectId, disputed.taskId, disputed.memberId, {
        horas: 1,
        fecha: '2026-04-11',
      }),
    ).rejects.toBeDefined();

    // ── 5. Un recálculo NO destruye el importe en disputa.
    await expect(
      runner.run(disputed.projectId, disputed.leaderId, 'test.recalculate', ({ tx }) =>
        timeRecords.recalculateAssignment(tx, disputed.assignmentId),
      ),
    ).rejects.toBeDefined();

    // ── La caché sigue en 12.00 y NO fue sobrescrita con 7.00.
    const cacheDespues = (
      await prisma.asignacionTarea.findUniqueOrThrow({
        where: { idAsignacion: disputed.assignmentId },
      })
    ).horasReales?.toFixed(2);
    expect(cacheDespues).toBe('12.00');
    expect(cacheDespues).not.toBe('7.00');

    // ── El Sprint sigue ACTIVO: ninguna transición se coló.
    const sprint = await prisma.sprint.findUniqueOrThrow({
      where: { idSprint: disputed.sprintId },
    });
    expect(sprint.estado).toBe('ACTIVO');

    // ── El resto del sistema sigue utilizable: el proyecto sano no se ve
    //    afectado por la disputa de otro proyecto.
    const sano = await readiness.evaluate(undefined, healthyProjectId, { phase: 'REQUEST' });
    expect(sano.blockers.map((row) => row.code)).not.toContain('LEGACY_SIN_CONCILIAR');
  });
  it('T24-B: un tramo LEGACY conserva su importe, rechaza nuevas entradas granulares y se reporta por separado', async () => {
    const { service, timeRecords, runner } = flowAStack(prisma);

    // ── 1. Una entrada granular sobre el tramo LEGACY se rechaza.
    await expect(
      timeRecords.create(legacyCase.projectId, legacyCase.taskId, legacyCase.memberId, {
        horas: 2,
        fecha: '2026-04-12',
      }),
    ).rejects.toBeDefined();
    const sinRegistros = await prisma.registroTiempoTarea.count({
      where: { idAsignacion: legacyCase.legacyAssignmentId },
    });
    expect(sinRegistros).toBe(0);

    // ── 2. Al cerrar el tramo, la caché sigue en 9.00 y NO se normaliza a 0.
    await prisma.asignacionTarea.update({
      where: { idAsignacion: legacyCase.legacyAssignmentId },
      data: { desasignadaEn: new Date('2026-04-20T00:00:00.000Z') },
    });
    await runner.run(legacyCase.projectId, legacyCase.leaderId, 'test.normalize', ({ tx }) =>
      timeRecords.normalizeClosedGranularTx(tx, {
        projectId: legacyCase.projectId,
        sprintId: legacyCase.sprintId,
      }),
    );
    const trasCerrar = await prisma.asignacionTarea.findUniqueOrThrow({
      where: { idAsignacion: legacyCase.legacyAssignmentId },
    });
    expect(trasCerrar.horasReales?.toFixed(2)).toBe('9.00');
    expect(trasCerrar.origenReporte).toBe('LEGACY');

    // ── 3. El flujo normal abre OTRO tramo del mismo usuario y acepta 3.00.
    const nuevoTramo = await createIntegrationTaskAssignment(
      prisma,
      legacyCase.taskId,
      legacyCase.memberId,
      legacyCase.leaderId,
      { idParticipacion: legacyCase.participationId },
    );
    scope.assignmentIds.push(nuevoTramo.idAsignacion);
    await timeRecords.create(legacyCase.projectId, legacyCase.taskId, legacyCase.memberId, {
      horas: 3,
      fecha: '2026-04-21',
    });
    const nuevoDespues = await prisma.asignacionTarea.findUniqueOrThrow({
      where: { idAsignacion: nuevoTramo.idAsignacion },
    });
    expect(nuevoDespues.horasReales?.toFixed(2)).toBe('3.00');
    expect(nuevoDespues.origenReporte).toBe('GRANULAR');

    // ── 4. El resumen expone los dos importes SEPARADOS.
    const resumen = await timeRecords.getTaskHoursSummary(
      legacyCase.projectId,
      legacyCase.taskId,
      legacyCase.leaderId,
    );
    expect(resumen.horasReportadasTarea).toBe('3.00');
    expect(resumen.horasLegacyNoGranulares).toBe('9.00');
    // Estimación 5.00 contra 3.00 granulares: NO hay sobreestimación, porque
    // el legacy no entra en la regla aunque 9 + 3 la superaría con creces.
    expect(resumen.sobreEstimacion).toBe('0.00');
    expect(resumen.restantes).toBe('2.00');

    // ── 5. La consolidación incluye ambos importes sin confundir su origen.
    //    El tramo granular se cierra por la vía normal antes de finalizar.
    await prisma.asignacionTarea.update({
      where: { idAsignacion: nuevoTramo.idAsignacion },
      data: { desasignadaEn: new Date('2026-04-22T00:00:00.000Z') },
    });
    await service.finalizeSprint(legacyCase.projectId, legacyCase.sprintId, legacyCase.leaderId);
    const cierre = await service.getSprintClosingSummary(
      legacyCase.projectId,
      legacyCase.sprintId,
      legacyCase.leaderId,
    );
    const miembro = cierre.participantes.find((row) => row.idUsuario === legacyCase.memberId);
    expect(miembro).toBeDefined();
    const totales = miembro?.totales;
    expect(totales).toBeDefined();
    expect(totales?.reportadas).toBe('3.00');
    expect(totales?.legacy).toBe('9.00');
    // La propuesta suma ambos, pero cada tramo conserva su procedencia.
    expect(totales?.propuestas).toBe('12.00');
    const origenes = (totales?.tramos ?? []).map((tramo) => tramo.origen).sort();
    expect(origenes).toEqual(['GRANULAR', 'LEGACY']);

    // ── 6. La CLI no fabrica registros para convertir el tramo LEGACY.
    const antesDiagnose = await prisma.registroTiempoTarea.count({
      where: { idAsignacion: legacyCase.legacyAssignmentId },
    });
    const report = await diagnose(prisma, { projectId: legacyCase.projectId });
    const clasificado = report.clasificacion.find(
      (row) => row.idAsignacion === legacyCase.legacyAssignmentId,
    );
    expect(clasificado?.origenSugerido).toBe('LEGACY');
    expect(clasificado?.motivo).toBe('SIN_REGISTROS_CACHE_NO_NULA');
    const despuesDiagnose = await prisma.registroTiempoTarea.count({
      where: { idAsignacion: legacyCase.legacyAssignmentId },
    });
    expect(despuesDiagnose).toBe(antesDiagnose);
    expect(despuesDiagnose).toBe(0);
  });
});
