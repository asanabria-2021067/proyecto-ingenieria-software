import { vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { ExitRequestsService } from '../../../src/exit-requests/exit-requests.service';
import { ExitRequestsAuthorizationService } from '../../../src/exit-requests/exit-requests.authorization.service';
import { ExitRequestsContextService } from '../../../src/exit-requests/exit-requests.context.service';
import { HoursRecognitionService } from '../../../src/sprints/hours-recognition.service';
import { SprintsContextService } from '../../../src/sprints/sprints-context.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { NotificationsService } from '../../../src/notifications/notifications.service';
import { BitacoraEventosService } from '../../../src/bitacora/bitacora-eventos.service';
import { ProjectTransactionService } from '../../../src/common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../../../src/common/project-policy/project-policy.service';
import { ProjectIdResolverService } from '../../../src/common/project-policy/project-id-resolver.service';
import { ProjectReadPolicyService } from '../../../src/common/project-policy/project-read-policy.service';
import * as fixtures from './fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './cleanup';

/**
 * C084/C085 (06 v2 §13/§47 T10-T11): pila real de salidas sobre PostgreSQL.
 * La plantilla de notificación se persiste de verdad, porque forma parte de
 * la transacción de dominio y es justo lo que debe revertirse con ella.
 */
export function exitStack(db: PrismaClient) {
  const prisma = db as unknown as PrismaService;
  const context = new ExitRequestsContextService(prisma);
  const realNotifications = new NotificationsService(prisma, undefined as never);
  const notifyFromTemplate = vi.fn().mockImplementation(
    realNotifications.notifyFromTemplate.bind(realNotifications),
  );
  const audit = new BitacoraEventosService();
  const service = new ExitRequestsService(
    prisma,
    { notifyFromTemplate } as unknown as NotificationsService,
    new ExitRequestsAuthorizationService(context),
    context,
    new ProjectTransactionService(prisma),
    new ProjectPolicyService(new ProjectIdResolverService(prisma)),
    new ProjectReadPolicyService(prisma),
    new HoursRecognitionService(prisma),
    new SprintsContextService(prisma),
    audit,
  );
  return { service, notifyFromTemplate, audit };
}

/**
 * C087–C090 (06 v2 §42/§47 T02-T03): escenario compartido de las cuatro
 * carreras entre una operación del autor sobre sus horas y el consumo por
 * salida aprobada. El tramo está CERRADO y NO consumido, y la solicitud queda
 * lista para aprobarse: lo único que cambia entre pruebas es quién gana.
 */
export async function raceFixture(
  db: PrismaClient,
  scope: IntegrationCleanupScope,
  registros: string[],
) {
  const collect = <K extends keyof IntegrationCleanupScope>(key: K, ids: number[]) => {
    scope[key] = [...(scope[key] ?? []), ...ids];
  };
  const leader = await fixtures.createIntegrationUser(db);
  const autor = await fixtures.createIntegrationUser(db);
  collect('userIds', [leader.idUsuario, autor.idUsuario]);
  const project = await fixtures.createIntegrationProject(db, leader.idUsuario, { estadoProyecto: 'EN_PROGRESO' });
  collect('projectIds', [project.idProyecto]);
  const role = await fixtures.createIntegrationProjectRole(db, project.idProyecto, { cupos: 3 });
  collect('roleIds', [role.idRolProyecto]);
  const participacion = await fixtures.createIntegrationParticipation(db, autor.idUsuario, role.idRolProyecto, { estadoParticipacion: 'ACTIVO' });
  collect('participationIds', [participacion.idParticipacion]);
  const sprint = await fixtures.createIntegrationSprint(db, project.idProyecto, { estado: 'ACTIVO' });
  collect('sprintIds', [sprint.idSprint]);
  const task = await fixtures.createIntegrationTask(db, project.idProyecto, leader.idUsuario, sprint.idSprint, { estadoTarea: 'HECHO' });
  collect('taskIds', [task.idTarea]);
  const total = registros.reduce((acc, valor) => acc + Number(valor), 0).toFixed(2);
  const assignment = await fixtures.createIntegrationTaskAssignment(db, task.idTarea, autor.idUsuario, leader.idUsuario, {
    idParticipacion: participacion.idParticipacion,
    desasignadaEn: new Date('2026-09-04T12:00:00.000Z'),
    horasReales: total,
  });
  collect('assignmentIds', [assignment.idAsignacion]);
  const creados = [];
  for (const horas of registros) {
    creados.push(
      await db.registroTiempoTarea.create({
        data: { idAsignacion: assignment.idAsignacion, idUsuario: autor.idUsuario, horas, fecha: new Date('2026-09-03') },
      }),
    );
  }
  const solicitud = await db.solicitudSalidaProyecto.create({
    data: {
      idProyecto: project.idProyecto,
      idUsuario: autor.idUsuario,
      motivo: 'Carrera entre edición/revocación del autor y consumo por salida',
      estadoSolicitud: 'PENDIENTE_LIDER',
    },
  });
  return { leader, autor, project, role, participacion, sprint, task, assignment, registros: creados, solicitud, total };
}

export async function cleanupRaceFixture(db: PrismaClient, scope: IntegrationCleanupScope, solicitudIds: number[]) {
  await db.notificacion.deleteMany({ where: { idUsuario: { in: scope.userIds ?? [] } } });
  await db.bitacoraAuditoria.deleteMany({ where: { idUsuario: { in: scope.userIds ?? [] } } });
  await db.horasParticipacion.deleteMany({ where: { idParticipacion: { in: scope.participationIds ?? [] } } });
  if (solicitudIds.length > 0) {
    await db.solicitudSalidaProyecto.deleteMany({ where: { idSolicitud: { in: solicitudIds } } });
  }
  await cleanupIntegrationFixtures(db, scope);
}
