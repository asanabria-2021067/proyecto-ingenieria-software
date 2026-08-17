import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import { createIntegrationUser, createIntegrationProject } from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';
import { SprintsService } from '../../src/sprints/sprints.service';
import { SprintsContextService } from '../../src/sprints/sprints-context.service';
import { SprintsAuthorizationService } from '../../src/sprints/sprints-authorization.service';

/**
 * Integración real A2: concurrencia de SprintsService.startSprint contra el
 * índice único parcial `sprint_operable_unique` (Foundation, migración
 * 20260815000000_add_sprint) — a lo sumo un Sprint ACTIVO/EN_FINALIZACION
 * por idProyecto. El precheck de SprintsContextService.getCurrentSprint
 * dentro de la transacción reduce la ventana de carrera pero no la cierra
 * por sí solo; la defensa definitiva es la constraint real de PostgreSQL.
 * Mismo patrón (una única instancia de service/PrismaClient, dos llamadas
 * vía Promise.allSettled, verificación posterior contra la base real) que
 * `solicitudes-salida.integration.spec.ts` y
 * `roles-participation.integration.spec.ts` ya usan para sus propios tests
 * de concurrencia. Se activa solo con `INTEGRATION_DATABASE_URL`; sin esa
 * variable, SKIP limpio (describeIntegration).
 */
describeIntegration(
  'SprintsService.startSprint — concurrencia real contra sprint_operable_unique',
  () => {
    let prisma: PrismaClient;
    let service: SprintsService;
    let scope: IntegrationCleanupScope;

    beforeAll(async () => {
      prisma = createIntegrationPrismaClient();
      const context = new SprintsContextService(prisma as any);
      const authorization = new SprintsAuthorizationService(context);
      // startSprint (A2) nunca llama a NotificationsService — solo
      // finalizeSprint (A4) lo hace — así que un doble vacío es suficiente
      // aquí; nunca se invoca en este archivo.
      const notifications = {} as any;
      service = new SprintsService(prisma as any, context, authorization, notifications);
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

    it('dos inicios de Sprint concurrentes para el mismo proyecto nunca dejan dos Sprints operables: uno gana, el otro recibe ConflictException', async () => {
      const leader = await createIntegrationUser(prisma);
      scope.userIds = [leader.idUsuario];

      const project = await createIntegrationProject(prisma, leader.idUsuario);
      scope.projectIds = [project.idProyecto];

      // Precondición: proyecto válido, líder válido, sin ningún Sprint
      // previo (ni operable ni cerrado) para este proyecto.

      const [r1, r2] = await Promise.allSettled([
        service.startSprint(project.idProyecto, leader.idUsuario),
        service.startSprint(project.idProyecto, leader.idUsuario),
      ]);

      const fulfilled = [r1, r2].filter((r) => r.status === 'fulfilled');
      const rejected = [r1, r2].filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);

      const sprintGanador = (fulfilled[0] as PromiseFulfilledResult<{ idSprint: number }>).value;
      scope.sprintIds = [sprintGanador.idSprint];

      // No basta con mirar Promise.allSettled: se consulta la base real
      // después de la carrera para confirmar el estado final persistido.
      const sprintsDelProyecto = await prisma.sprint.findMany({
        where: { idProyecto: project.idProyecto },
        select: { idSprint: true, numero: true, estado: true },
      });
      expect(sprintsDelProyecto).toHaveLength(1);
      expect(sprintsDelProyecto[0].estado).toBe('ACTIVO');
      expect(sprintsDelProyecto[0].idSprint).toBe(sprintGanador.idSprint);

      // Doble verificación vía COUNT con exactamente la misma condición que
      // protege el índice parcial real (id_proyecto, estado operable).
      const conteoOperables = await prisma.sprint.count({
        where: {
          idProyecto: project.idProyecto,
          estado: { in: ['ACTIVO', 'EN_FINALIZACION'] },
        },
      });
      expect(conteoOperables).toBe(1);
    });

    it('el segundo Sprint del proyecto usa MAX(numero) + 1 después de cerrar el primero', async () => {
      const leader = await createIntegrationUser(prisma);
      scope.userIds = [leader.idUsuario];

      const project = await createIntegrationProject(prisma, leader.idUsuario);
      scope.projectIds = [project.idProyecto];

      const primero = await service.startSprint(project.idProyecto, leader.idUsuario);
      expect(primero.numero).toBe(1);
      expect(primero.estado).toBe('ACTIVO');

      await prisma.sprint.update({
        where: { idSprint: primero.idSprint },
        data: { estado: 'CERRADO' },
      });

      const segundo = await service.startSprint(project.idProyecto, leader.idUsuario);
      scope.sprintIds = [primero.idSprint, segundo.idSprint];

      expect(segundo.numero).toBe(2);
      expect(segundo.estado).toBe('ACTIVO');
    });
  },
);
