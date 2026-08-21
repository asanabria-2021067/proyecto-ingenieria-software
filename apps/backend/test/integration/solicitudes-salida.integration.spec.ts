import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import type { PrismaService } from '../../src/prisma/prisma.service';
import type { NotificationsService } from '../../src/notifications/notifications.service';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import {
  createIntegrationUser,
  createIntegrationProject,
  createIntegrationProjectRole,
  createIntegrationParticipation,
} from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';
import { ExitRequestsAuthorizationService } from '../../src/exit-requests/exit-requests.authorization.service';
import { ExitRequestsContextService } from '../../src/exit-requests/exit-requests.context.service';
import { ExitRequestsService } from '../../src/exit-requests/exit-requests.service';

/**
 * Integración real T-111 (Tarea 7): concurrencia real de
 * ExitRequestsService.createSolicitudSalida contra el índice único parcial
 * `solicitud_salida_proyecto_pendiente_unique` (Tarea 5, migración
 * 20260811035302_add_solicitud_salida_proyecto) — algo que un mock de Prisma
 * no puede demostrar por sí solo, ya que el precheck de findFirst en la
 * Tarea 6 no cierra la condición de carrera, solo la reduce; la defensa
 * definitiva es la constraint real de PostgreSQL. Se activa solo con
 * `INTEGRATION_DATABASE_URL`; sin esa variable, SKIP limpio
 * (describeIntegration). No repite la matriz completa de 11 casos del
 * service spec unitario: se enfoca exclusivamente en la carrera real del
 * índice parcial, siguiendo el mismo patrón (una única instancia de
 * service/PrismaClient, dos llamadas vía Promise.allSettled) que
 * `roles-participation.integration.spec.ts` usa para su propio test
 * "CONCURRENCIA".
 */
const fakeNotifications = { isAdmin: async () => false } as unknown as NotificationsService;

describeIntegration(
  'ExitRequestsService.createSolicitudSalida — concurrencia real contra solicitud_salida_proyecto_pendiente_unique',
  () => {
    let prisma: PrismaClient;
    let service: ExitRequestsService;
    let scope: IntegrationCleanupScope;
    let solicitudIds: number[];

    beforeAll(async () => {
      prisma = createIntegrationPrismaClient();
      const context = new ExitRequestsContextService(prisma as unknown as PrismaService);
      service = new ExitRequestsService(
        prisma as unknown as PrismaService,
        fakeNotifications,
        new ExitRequestsAuthorizationService(context),
        context,
      );
      await prisma.$connect();
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    beforeEach(() => {
      scope = {};
      solicitudIds = [];
    });

    afterEach(async () => {
      // SolicitudSalidaProyecto (T15/T111) no forma parte de
      // IntegrationCleanupScope: tiene FK directa a proyecto/usuario (no a
      // ParticipacionProyecto), así que debe borrarse explícitamente antes
      // de que cleanupIntegrationFixtures elimine esos padres — mismo
      // patrón ya usado para HorasParticipacion en
      // projects-team-summary.integration.spec.ts (Tarea 4). No se
      // modifica cleanup.ts/fixtures.ts: el borrado dirigido por IDs dentro
      // del propio spec es suficiente y evita ampliar el harness compartido
      // sin necesidad real.
      if (solicitudIds.length > 0) {
        await prisma.solicitudSalidaProyecto.deleteMany({
          where: { idSolicitud: { in: solicitudIds } },
        });
      }
      await cleanupIntegrationFixtures(prisma, scope);
    });

    it('dos solicitudes concurrentes para el mismo (idProyecto, idUsuario) nunca dejan dos PREPARACION: una se cumple, la otra recibe ConflictException', async () => {
      const leader = await createIntegrationUser(prisma);
      const member = await createIntegrationUser(prisma);
      scope.userIds = [leader.idUsuario, member.idUsuario];

      const project = await createIntegrationProject(prisma, leader.idUsuario);
      scope.projectIds = [project.idProyecto];

      const role = await createIntegrationProjectRole(prisma, project.idProyecto);
      scope.roleIds = [role.idRolProyecto];

      // Participación ACTIVO del miembro; sin SolicitudSalidaProyecto abierta
      // previa (precondición de la carrera).
      const participation = await createIntegrationParticipation(
        prisma,
        member.idUsuario,
        role.idRolProyecto,
        { estadoParticipacion: 'ACTIVO' },
      );
      scope.participationIds = [participation.idParticipacion];

      const [r1, r2] = await Promise.allSettled([
        service.createSolicitudSalida(project.idProyecto, member.idUsuario, 'motivo A'),
        service.createSolicitudSalida(project.idProyecto, member.idUsuario, 'motivo B'),
      ]);

      const fulfilled = [r1, r2].filter((r) => r.status === 'fulfilled');
      const rejected = [r1, r2].filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);

      // No basta con mirar Promise.allSettled: se consulta la base real
      // después de la carrera para confirmar el estado final persistido.
      const creadas = await prisma.solicitudSalidaProyecto.findMany({
        where: { idProyecto: project.idProyecto, idUsuario: member.idUsuario },
        select: { idSolicitud: true, estadoSolicitud: true },
      });
      solicitudIds = creadas.map((s) => s.idSolicitud);

      const enPreparacion = creadas.filter((s) => s.estadoSolicitud === 'PREPARACION');
      expect(enPreparacion).toHaveLength(1);

      // Doble verificación vía COUNT con exactamente la misma condición que
      // protege el índice parcial real para el estado abierto PREPARACION.
      const conteoPreparacion = await prisma.solicitudSalidaProyecto.count({
        where: {
          idProyecto: project.idProyecto,
          idUsuario: member.idUsuario,
          estadoSolicitud: 'PREPARACION',
        },
      });
      expect(conteoPreparacion).toBe(1);
    });
  },
);
