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
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import {
  assessManifest,
  diagnose,
  manifestEntriesHash,
  resolveAdmin,
  validateManifest,
  LegacyCliError,
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
});
