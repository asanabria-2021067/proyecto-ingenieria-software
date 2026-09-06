import type { PrismaClient } from '@prisma/client';
import { vi } from 'vitest';
import { NotificationsService } from '../../../src/notifications/notifications.service';
import type { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { BitacoraEventosService } from '../../../src/bitacora/bitacora-eventos.service';
import { ProjectTransactionService } from '../../../src/common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../../../src/common/project-policy/project-policy.service';
import { ProjectIdResolverService } from '../../../src/common/project-policy/project-id-resolver.service';
import { ProjectCloseReadinessService } from '../../../src/project-closure/project-close-readiness.service';
import { ProjectClosureService } from '../../../src/project-closure/project-closure.service';
import { ProjectClosureReportService } from '../../../src/project-closure/project-closure-report.service';
import { closureDocumentsStack, closureConfig, pdfFixture } from './closure-storage';
import * as fixtures from './fixtures';
import { cleanupIntegrationFixtures } from './cleanup';
import type { ClosureCleanupScope } from './closure-storage';

/**
 * C129+ (06 v2 §21/§22/§24/§47 T13): pila real del ciclo de cierre sobre
 * PostgreSQL. Nada externo interviene: readiness y preparación son decisiones
 * de base de datos bajo el lock del proyecto.
 */
export function closureLifecycleStack(db: PrismaClient) {
  const prisma = db as unknown as PrismaService;
  const runner = new ProjectTransactionService(prisma);
  const policy = new ProjectPolicyService(new ProjectIdResolverService(prisma));
  const readiness = new ProjectCloseReadinessService(prisma);
  const audit = new BitacoraEventosService();
  const gateway = { server: {}, notifyUsers: vi.fn(), emitToUsers: vi.fn() };
  const notifications = new NotificationsService(prisma, gateway as unknown as NotificationsGateway);
  const closure = new ProjectClosureService(prisma, runner, policy, readiness, audit, notifications);
  // El almacenamiento va mockeado: lo que se prueba es el protocolo de
  // captura, render y vínculo, no la capacidad del proveedor.
  const documentos = closureDocumentsStack(db, closureConfig());
  const report = new ProjectClosureReportService(
    prisma,
    runner,
    policy,
    readiness,
    documentos.service,
    audit,
  );
  return { closure, readiness, runner, policy, audit, report, documentos, notifications, gateway };
}

export async function closureReadyFixture(db: PrismaClient, scope: ClosureCleanupScope) {
  const f = await proyectoListoParaGenerar(db, scope);
  const stack = closureLifecycleStack(db);
  const generated = await stack.report.generateAutoReport(f.project.idProyecto, f.leader.idUsuario, f.revision.idRevisionCierre);
  const grant = await stack.documentos.service.reserve(f.project.idProyecto, f.leader.idUsuario, {
    revisionId: f.revision.idRevisionCierre, nombreArchivo: 'evidencia.pdf',
  });
  await stack.documentos.service.uploadAndAttach(f.project.idProyecto, f.leader.idUsuario, grant.ticket, await pdfFixture());
  const dto = { revisionId: f.revision.idRevisionCierre, confirmado: true, expectedFingerprint: generated.fingerprintEjecucion };
  return { ...f, stack, generated, dto };
}

/**
 * Proyecto en ejecución con TODOS los incumplimientos a la vez: sin Sprint
 * cerrado, con tramo abierto, con tarea no hecha, con salida abierta y con
 * apelación pendiente. Sirve para comprobar que readiness los enumera todos.
 */
export async function proyectoConIncumplimientos(db: PrismaClient, scope: ClosureCleanupScope) {
  const collect = <K extends keyof ClosureCleanupScope>(clave: K, ids: number[]) => {
    scope[clave] = [...((scope[clave] ?? []) as number[]), ...ids] as ClosureCleanupScope[K];
  };
  const leader = await fixtures.createIntegrationUser(db);
  const miembro = await fixtures.createIntegrationUser(db);
  const externo = await fixtures.createIntegrationUser(db);
  collect('userIds', [leader.idUsuario, miembro.idUsuario, externo.idUsuario]);

  const project = await fixtures.createIntegrationProject(db, leader.idUsuario, {
    estadoProyecto: 'EN_PROGRESO',
  });
  collect('projectIds', [project.idProyecto]);
  const role = await fixtures.createIntegrationProjectRole(db, project.idProyecto, { cupos: 5 });
  collect('roleIds', [role.idRolProyecto]);
  const participacion = await fixtures.createIntegrationParticipation(
    db,
    miembro.idUsuario,
    role.idRolProyecto,
    { estadoParticipacion: 'ACTIVO' },
  );
  collect('participationIds', [participacion.idParticipacion]);

  // Sprint ACTIVO: ni cerrado ni ausente.
  const sprint = await fixtures.createIntegrationSprint(db, project.idProyecto, { estado: 'ACTIVO' });
  collect('sprintIds', [sprint.idSprint]);
  // Tarea sin terminar y tramo todavía abierto.
  const tarea = await fixtures.createIntegrationTask(
    db,
    project.idProyecto,
    leader.idUsuario,
    sprint.idSprint,
    { estadoTarea: 'EN_PROGRESO' },
  );
  collect('taskIds', [tarea.idTarea]);
  const asignacion = await fixtures.createIntegrationTaskAssignment(
    db,
    tarea.idTarea,
    miembro.idUsuario,
    leader.idUsuario,
    { idParticipacion: participacion.idParticipacion },
  );
  collect('assignmentIds', [asignacion.idAsignacion]);
  // Salida abierta y apelación pendiente.
  const salida = await db.solicitudSalidaProyecto.create({
    data: {
      idProyecto: project.idProyecto,
      idUsuario: miembro.idUsuario,
      motivo: 'salida abierta durante la preparación del cierre',
      estadoSolicitud: 'PENDIENTE_LIDER',
    },
  });
  collect('exitRequestIds', [salida.idSolicitud]);
  const apelacion = await db.apelacionLiderazgo.create({
    data: {
      idProyecto: project.idProyecto,
      idLiderSolicitante: leader.idUsuario,
      asunto: 'Apelación pendiente',
      mensaje: 'Sigue sin resolverse mientras se prepara el cierre.',
      idCandidatoPropuesto: miembro.idUsuario,
    },
  });
  // Postulación pendiente: advertencia, no bloqueo.
  const postulacion = await db.postulacion.create({
    data: {
      idRolProyecto: role.idRolProyecto,
      idUsuarioPostulante: externo.idUsuario,
      justificacion: 'Quiero unirme al proyecto',
    },
  });

  return { leader, miembro, externo, project, role, participacion, sprint, tarea, salida, apelacion, postulacion };
}

export async function cleanupClosureLifecycle(
  db: PrismaClient,
  scope: ClosureCleanupScope,
): Promise<void> {
  const projectIds = scope.projectIds ?? [];
  await db.bitacoraAuditoria.deleteMany({ where: { idUsuario: { in: scope.userIds ?? [] } } });
  await db.notificacion.deleteMany({ where: { idUsuario: { in: scope.userIds ?? [] } } });
  await db.postulacion.deleteMany({ where: { rolProyecto: { idProyecto: { in: projectIds } } } });
  await db.revisionCierreProyecto.updateMany({
    where: { idProyecto: { in: projectIds }, estadoRevision: 'APROBADA' },
    data: {
      estadoRevision: 'ENVIADA',
      idDocumentoOficial: null,
      idRevisor: null,
      resueltaEn: null,
      comentarioRevisor: null,
    },
  });
  await db.documentoRevisionCierre.deleteMany({
    where: { revision: { idProyecto: { in: projectIds } } },
  });
  await db.documentoCierre.deleteMany({ where: { idProyecto: { in: projectIds } } });
  await db.revisionCierreProyecto.deleteMany({ where: { idProyecto: { in: projectIds } } });
  await db.historialLiderazgo.deleteMany({ where: { idProyecto: { in: projectIds } } });
  await db.apelacionLiderazgo.deleteMany({ where: { idProyecto: { in: projectIds } } });
  await db.solicitudSalidaProyecto.deleteMany({
    where: { idSolicitud: { in: scope.exitRequestIds ?? [] } },
  });
  await db.usuarioRolAcceso.deleteMany({
    where: { idUsuario: { in: scope.accessRoleUserIds ?? [] } },
  });
  await db.ajusteHoraTarea.deleteMany({
    where: { idAsignacion: { in: scope.assignmentIds ?? [] } },
  });
  await db.horasParticipacion.deleteMany({
    where: { idParticipacion: { in: scope.participationIds ?? [] } },
  });
  await cleanupIntegrationFixtures(db, scope);
}

/**
 * Proyecto EN_PROGRESO listo para generar su informe: Sprint cerrado, tarea
 * hecha con su tramo cerrado y consolidado, sin salidas ni apelaciones, y con
 * su borrador ya creado. Le faltan las evidencias a propósito: la generación
 * debe poder ocurrir antes que ellas.
 */
export async function proyectoListoParaGenerar(db: PrismaClient, scope: ClosureCleanupScope) {
  const collect = <K extends keyof ClosureCleanupScope>(clave: K, ids: number[]) => {
    scope[clave] = [...((scope[clave] ?? []) as number[]), ...ids] as ClosureCleanupScope[K];
  };
  const leader = await fixtures.createIntegrationUser(db);
  const miembro = await fixtures.createIntegrationUser(db);
  collect('userIds', [leader.idUsuario, miembro.idUsuario]);

  const project = await fixtures.createIntegrationProject(db, leader.idUsuario, {
    estadoProyecto: 'EN_PROGRESO',
  });
  collect('projectIds', [project.idProyecto]);
  const role = await fixtures.createIntegrationProjectRole(db, project.idProyecto, { cupos: 4 });
  collect('roleIds', [role.idRolProyecto]);
  const participacion = await fixtures.createIntegrationParticipation(
    db,
    miembro.idUsuario,
    role.idRolProyecto,
    { estadoParticipacion: 'ACTIVO' },
  );
  collect('participationIds', [participacion.idParticipacion]);

  const sprint = await fixtures.createIntegrationSprint(db, project.idProyecto, {
    estado: 'CERRADO',
  });
  collect('sprintIds', [sprint.idSprint]);
  const tarea = await fixtures.createIntegrationTask(
    db,
    project.idProyecto,
    leader.idUsuario,
    sprint.idSprint,
    { estadoTarea: 'HECHO' },
  );
  collect('taskIds', [tarea.idTarea]);
  const asignacion = await fixtures.createIntegrationTaskAssignment(
    db,
    tarea.idTarea,
    miembro.idUsuario,
    leader.idUsuario,
    {
      idParticipacion: participacion.idParticipacion,
      desasignadaEn: new Date('2026-05-01T10:00:00.000Z'),
      horasReales: '4.00',
      reconocidoEn: new Date('2026-05-02T10:00:00.000Z'),
    },
  );
  collect('assignmentIds', [asignacion.idAsignacion]);
  await db.registroTiempoTarea.create({
    data: {
      idAsignacion: asignacion.idAsignacion,
      idUsuario: miembro.idUsuario,
      horas: '4.00',
      fecha: new Date('2026-04-20'),
    },
  });
  // Agregado consolidado y todavía PENDIENTE: acreditar es del administrador.
  await db.horasParticipacion.create({
    data: {
      idParticipacion: participacion.idParticipacion,
      idSprint: sprint.idSprint,
      periodoInicio: new Date('2026-04-01'),
      periodoFin: new Date('2026-04-30'),
      horasReportadas: '4.00',
      horasCalculadas: '4.00',
      estadoHoras: 'PENDIENTE',
    },
  });

  const revision = await db.revisionCierreProyecto.create({
    data: { idProyecto: project.idProyecto, numeroRevision: 1, estadoRevision: 'BORRADOR' },
  });
  collect('revisionIds', [revision.idRevisionCierre]);

  // Un proyecto y una revisión ajenos, para probar el cruce de identificadores.
  const otroProyecto = await fixtures.createIntegrationProject(db, leader.idUsuario, {
    estadoProyecto: 'EN_PROGRESO',
  });
  collect('projectIds', [otroProyecto.idProyecto]);
  const revisionAjena = await db.revisionCierreProyecto.create({
    data: { idProyecto: otroProyecto.idProyecto, numeroRevision: 1, estadoRevision: 'BORRADOR' },
  });
  collect('revisionIds', [revisionAjena.idRevisionCierre]);

  return {
    leader,
    miembro,
    project,
    role,
    participacion,
    sprint,
    tarea,
    asignacion,
    revision,
    otroProyecto,
    revisionAjena,
  };
}
