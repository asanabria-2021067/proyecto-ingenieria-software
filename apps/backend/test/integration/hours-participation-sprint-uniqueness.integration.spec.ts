import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import {
  createIntegrationUser,
  createIntegrationProject,
  createIntegrationProjectRole,
  createIntegrationParticipation,
  createIntegrationSprint,
} from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';

/**
 * Integración real A7.1: demuestra que el índice único parcial
 * `horas_participacion_sprint_unique` (migración
 * `20260816010000_add_sprint_hours_participation_uniqueness`) garantiza a
 * lo sumo una fila de HorasParticipacion por (idParticipacion, idSprint)
 * cuando idSprint NO es NULL, preservando intacta la semántica histórica
 * de ParticipacionProyecto 1:N HorasParticipacion para filas con
 * idSprint = NULL. Se activa solo con `INTEGRATION_DATABASE_URL`; sin esa
 * variable, SKIP limpio (describeIntegration), mismo patrón que el resto
 * de test/integration/.
 *
 * HorasParticipacion no tiene fixture compartido en setup/fixtures.ts, así
 * que las filas se crean directamente aquí (sin tocar ese archivo) y se
 * limpian manualmente en `afterEach` ANTES de `cleanupIntegrationFixtures`
 * porque `horas_participacion_id_participacion_fkey` es ON DELETE RESTRICT
 * (borrar la ParticipacionProyecto padre fallaría si quedan filas hijas).
 */
function createHorasParticipacion(
  prisma: PrismaClient,
  idParticipacion: number,
  idSprint: number | null,
) {
  return prisma.horasParticipacion.create({
    data: {
      idParticipacion,
      idSprint,
      periodoInicio: new Date('2026-01-01'),
      periodoFin: new Date('2026-01-31'),
      horasReportadas: 10,
    },
  });
}

describeIntegration(
  'HorasParticipacion — unicidad real por (idParticipacion, idSprint) cuando idSprint no es NULL (A7.1)',
  () => {
    let prisma: PrismaClient;
    let scope: IntegrationCleanupScope;
    let horasIds: number[];

    beforeAll(async () => {
      prisma = createIntegrationPrismaClient();
      await prisma.$connect();
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    beforeEach(() => {
      scope = {};
      horasIds = [];
    });

    afterEach(async () => {
      if (horasIds.length > 0) {
        await prisma.horasParticipacion.deleteMany({
          where: { idRegistroHoras: { in: horasIds } },
        });
      }
      await cleanupIntegrationFixtures(prisma, scope);
    });

    it('duplicado exacto (misma participación + mismo Sprint) es rechazado por PostgreSQL; queda 1 sola fila', async () => {
      const leader = await createIntegrationUser(prisma);
      scope.userIds = [leader.idUsuario];
      const project = await createIntegrationProject(prisma, leader.idUsuario);
      scope.projectIds = [project.idProyecto];
      const role = await createIntegrationProjectRole(prisma, project.idProyecto);
      scope.roleIds = [role.idRolProyecto];
      const participation = await createIntegrationParticipation(prisma, leader.idUsuario, role.idRolProyecto, {
        estadoParticipacion: 'ACTIVO',
      });
      scope.participationIds = [participation.idParticipacion];
      const sprint = await createIntegrationSprint(prisma, project.idProyecto, { estado: 'ACTIVO' });
      scope.sprintIds = [sprint.idSprint];

      const first = await createHorasParticipacion(prisma, participation.idParticipacion, sprint.idSprint);
      horasIds.push(first.idRegistroHoras);

      let rejection: unknown;
      try {
        await createHorasParticipacion(prisma, participation.idParticipacion, sprint.idSprint);
      } catch (error) {
        rejection = error;
      }

      expect(rejection).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      expect((rejection as Prisma.PrismaClientKnownRequestError).code).toBe('P2002');

      const rowCount = await prisma.horasParticipacion.count({
        where: { idParticipacion: participation.idParticipacion, idSprint: sprint.idSprint },
      });
      expect(rowCount).toBe(1);
    });

    it('misma participación + distinto Sprint: ambos registros son permitidos', async () => {
      const leader = await createIntegrationUser(prisma);
      scope.userIds = [leader.idUsuario];
      const project = await createIntegrationProject(prisma, leader.idUsuario);
      scope.projectIds = [project.idProyecto];
      const role = await createIntegrationProjectRole(prisma, project.idProyecto);
      scope.roleIds = [role.idRolProyecto];
      const participation = await createIntegrationParticipation(prisma, leader.idUsuario, role.idRolProyecto, {
        estadoParticipacion: 'ACTIVO',
      });
      scope.participationIds = [participation.idParticipacion];
      const sprint1 = await createIntegrationSprint(prisma, project.idProyecto, { numero: 1, estado: 'CERRADO' });
      const sprint2 = await createIntegrationSprint(prisma, project.idProyecto, { numero: 2, estado: 'ACTIVO' });
      scope.sprintIds = [sprint1.idSprint, sprint2.idSprint];

      const registroSprint1 = await createHorasParticipacion(prisma, participation.idParticipacion, sprint1.idSprint);
      const registroSprint2 = await createHorasParticipacion(prisma, participation.idParticipacion, sprint2.idSprint);
      horasIds.push(registroSprint1.idRegistroHoras, registroSprint2.idRegistroHoras);

      const rowCount = await prisma.horasParticipacion.count({
        where: { idParticipacion: participation.idParticipacion },
      });
      expect(rowCount).toBe(2);
    });

    it('distinta participación + mismo Sprint: ambos registros son permitidos', async () => {
      const leader = await createIntegrationUser(prisma);
      const memberUser = await createIntegrationUser(prisma);
      scope.userIds = [leader.idUsuario, memberUser.idUsuario];
      const project = await createIntegrationProject(prisma, leader.idUsuario);
      scope.projectIds = [project.idProyecto];
      const role = await createIntegrationProjectRole(prisma, project.idProyecto);
      scope.roleIds = [role.idRolProyecto];
      const participationA = await createIntegrationParticipation(prisma, leader.idUsuario, role.idRolProyecto, {
        estadoParticipacion: 'ACTIVO',
      });
      const participationB = await createIntegrationParticipation(prisma, memberUser.idUsuario, role.idRolProyecto, {
        estadoParticipacion: 'ACTIVO',
      });
      scope.participationIds = [participationA.idParticipacion, participationB.idParticipacion];
      const sprint = await createIntegrationSprint(prisma, project.idProyecto, { estado: 'ACTIVO' });
      scope.sprintIds = [sprint.idSprint];

      const registroA = await createHorasParticipacion(prisma, participationA.idParticipacion, sprint.idSprint);
      const registroB = await createHorasParticipacion(prisma, participationB.idParticipacion, sprint.idSprint);
      horasIds.push(registroA.idRegistroHoras, registroB.idRegistroHoras);

      const rowCount = await prisma.horasParticipacion.count({
        where: { idSprint: sprint.idSprint },
      });
      expect(rowCount).toBe(2);
    });

    it('registros históricos con idSprint = NULL: la misma participación conserva múltiples filas sin restricción', async () => {
      const leader = await createIntegrationUser(prisma);
      scope.userIds = [leader.idUsuario];
      const project = await createIntegrationProject(prisma, leader.idUsuario);
      scope.projectIds = [project.idProyecto];
      const role = await createIntegrationProjectRole(prisma, project.idProyecto);
      scope.roleIds = [role.idRolProyecto];
      const participation = await createIntegrationParticipation(prisma, leader.idUsuario, role.idRolProyecto, {
        estadoParticipacion: 'ACTIVO',
      });
      scope.participationIds = [participation.idParticipacion];

      const historico1 = await createHorasParticipacion(prisma, participation.idParticipacion, null);
      const historico2 = await createHorasParticipacion(prisma, participation.idParticipacion, null);
      horasIds.push(historico1.idRegistroHoras, historico2.idRegistroHoras);

      const rowCount = await prisma.horasParticipacion.count({
        where: { idParticipacion: participation.idParticipacion, idSprint: null },
      });
      expect(rowCount).toBe(2);
    });

    it('concurrencia real: dos creaciones simultáneas para la misma (participación, Sprint) — exactamente una gana', async () => {
      const leader = await createIntegrationUser(prisma);
      scope.userIds = [leader.idUsuario];
      const project = await createIntegrationProject(prisma, leader.idUsuario);
      scope.projectIds = [project.idProyecto];
      const role = await createIntegrationProjectRole(prisma, project.idProyecto);
      scope.roleIds = [role.idRolProyecto];
      const participation = await createIntegrationParticipation(prisma, leader.idUsuario, role.idRolProyecto, {
        estadoParticipacion: 'ACTIVO',
      });
      scope.participationIds = [participation.idParticipacion];
      const sprint = await createIntegrationSprint(prisma, project.idProyecto, { estado: 'ACTIVO' });
      scope.sprintIds = [sprint.idSprint];

      // Sin `await` entre ambas llamadas: la carrera real la resuelve
      // PostgreSQL, no un precheck de aplicación (no hay findFirst previo).
      const [r1, r2] = await Promise.allSettled([
        createHorasParticipacion(prisma, participation.idParticipacion, sprint.idSprint),
        createHorasParticipacion(prisma, participation.idParticipacion, sprint.idSprint),
      ]);

      const fulfilled = [r1, r2].filter((r) => r.status === 'fulfilled');
      const rejected = [r1, r2].filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
        Prisma.PrismaClientKnownRequestError,
      );

      const ganador = (fulfilled[0] as PromiseFulfilledResult<{ idRegistroHoras: number }>).value;
      horasIds.push(ganador.idRegistroHoras);

      // No basta con Promise.allSettled: se consulta PostgreSQL real
      // después de la carrera para confirmar el estado final persistido.
      const rowCount = await prisma.horasParticipacion.count({
        where: { idParticipacion: participation.idParticipacion, idSprint: sprint.idSprint },
      });
      expect(rowCount).toBe(1);
    });
  },
);
