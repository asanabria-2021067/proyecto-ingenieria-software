import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import {
  createIntegrationUser,
  createIntegrationProject,
  createIntegrationProjectRole,
  createIntegrationParticipation,
} from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';

/**
 * Smoke test end-to-end del harness de integración (T14-T17) contra el
 * índice único parcial real `participacion_proyecto_activa_unique`
 * (migración `20260726000100_enforce_one_active_participation`, documentado
 * en `schema.prisma` — Tarea 2): a lo sumo una ParticipacionProyecto ACTIVO
 * por (idUsuario, idRolProyecto). Se activa solo con `INTEGRATION_DATABASE_URL`.
 */
describeIntegration('partial PostgreSQL index invariants', () => {
  let prisma: PrismaClient;
  let scope: IntegrationCleanupScope;

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    scope = {};
  });

  afterEach(async () => {
    await cleanupIntegrationFixtures(prisma, scope);
  });

  it('rejects a second active participation for the same user and project role', async () => {
    const user = await createIntegrationUser(prisma);
    scope.userIds = [user.idUsuario];

    const project = await createIntegrationProject(prisma, user.idUsuario);
    scope.projectIds = [project.idProyecto];

    const role = await createIntegrationProjectRole(prisma, project.idProyecto);
    scope.roleIds = [role.idRolProyecto];

    const first = await createIntegrationParticipation(prisma, user.idUsuario, role.idRolProyecto, {
      estadoParticipacion: 'ACTIVO',
    });
    scope.participationIds = [first.idParticipacion];

    let rejection: unknown;
    try {
      await prisma.participacionProyecto.create({
        data: {
          idUsuario: user.idUsuario,
          idRolProyecto: role.idRolProyecto,
          estadoParticipacion: 'ACTIVO',
        },
      });
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((rejection as Prisma.PrismaClientKnownRequestError).code).toBe('P2002');

    const activas = await prisma.participacionProyecto.count({
      where: { idUsuario: user.idUsuario, idRolProyecto: role.idRolProyecto, estadoParticipacion: 'ACTIVO' },
    });
    expect(activas).toBe(1);
  });
});
