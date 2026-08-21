import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import { createIntegrationProject, createIntegrationUser } from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';

/**
 * Suite A/B deliberadamente secuencial: Vitest ejecuta los tests del archivo en
 * orden de declaracion mientras no se use `.concurrent`, y B consume los IDs de
 * A para verificar el lifecycle fixture + scope + cleanup con consultas por PK.
 */
describeIntegration('integration harness cleanup isolation', () => {
  let prisma: PrismaClient;
  let scope: IntegrationCleanupScope;
  let cleanedScenarioA:
    | {
        userId: number;
        projectId: number;
      }
    | undefined;

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

  it('scenario A creates scoped fixture records that afterEach must clean', async () => {
    const user = await createIntegrationUser(prisma);
    scope.userIds = [user.idUsuario];

    const project = await createIntegrationProject(prisma, user.idUsuario);
    scope.projectIds = [project.idProyecto];

    cleanedScenarioA = {
      userId: user.idUsuario,
      projectId: project.idProyecto,
    };

    await expect(
      prisma.usuario.findUnique({ where: { idUsuario: cleanedScenarioA.userId } }),
    ).resolves.toMatchObject({ idUsuario: cleanedScenarioA.userId });
    await expect(
      prisma.proyecto.findUnique({ where: { idProyecto: cleanedScenarioA.projectId } }),
    ).resolves.toMatchObject({ idProyecto: cleanedScenarioA.projectId });
  });

  it('scenario B verifies scenario A records no longer exist by primary key', async () => {
    expect(cleanedScenarioA).toBeDefined();

    const [userAfterCleanup, projectAfterCleanup] = await Promise.all([
      prisma.usuario.findUnique({ where: { idUsuario: cleanedScenarioA!.userId } }),
      prisma.proyecto.findUnique({ where: { idProyecto: cleanedScenarioA!.projectId } }),
    ]);

    expect(userAfterCleanup).toBeNull();
    expect(projectAfterCleanup).toBeNull();
  });
});
