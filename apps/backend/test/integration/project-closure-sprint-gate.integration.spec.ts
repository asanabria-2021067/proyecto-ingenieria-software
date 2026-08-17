import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { ConflictException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import {
  createIntegrationProject,
  createIntegrationSprint,
  createIntegrationTask,
  createIntegrationUser,
} from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';
import { PrismaService } from '../../src/prisma/prisma.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { ProjectsService } from '../../src/projects/projects.service';
import { SprintsAuthorizationService } from '../../src/sprints/sprints-authorization.service';
import { SprintsContextService } from '../../src/sprints/sprints-context.service';
import { SprintsService } from '../../src/sprints/sprints.service';

/**
 * X3 (Escenario B) — regresión cross-flow: Decisión #2 (congelada, A11) —
 * `ProjectsService.requestClose` debe rechazarse mientras el proyecto tenga
 * un Sprint operable (ACTIVO o EN_FINALIZACION) y solo permitirse una vez
 * ese Sprint queda CERRADO. Verificado contra PostgreSQL real, atravesando
 * el método productivo real (`requestClose`) y las transiciones reales de
 * Sprint (`finalizeSprint`/`closeSprint`), nunca escribiendo
 * `EstadoProyecto.EN_SOLICITUD_CIERRE` ni `Sprint.estado` directamente con
 * Prisma como sustituto del comportamiento bajo prueba.
 *
 * `EstadoProyecto.EN_PROGRESO` (precondición de `requestClose`, no el
 * comportamiento verificado por X3) se fija directamente vía Prisma tras
 * `createIntegrationProject` — mismo criterio ya aceptado en el resto del
 * harness de integración (p. ej. `desasignadaEn`/`horasReales` en
 * exit-request-resolution.integration.spec.ts): un precondition de fixture,
 * no una simulación del resultado terminal bajo prueba.
 */

function makeFakeNotifications(): NotificationsService {
  return {
    notifyFromTemplate: async () => undefined,
    notifyUsers: async () => undefined,
    notifyRoleMembers: async () => undefined,
    notifyProjectActiveParticipants: async () => undefined,
    notifySprintFinalizationStarted: async () => undefined,
    notifySprintClosed: async () => undefined,
    notifyAdminsFromTemplate: async () => undefined,
  } as unknown as NotificationsService;
}

function makeFakeCacheManager() {
  return { get: async () => null, set: async () => undefined, del: async () => undefined } as any;
}

async function markProjectInProgress(prisma: PrismaClient, idProyecto: number) {
  return prisma.proyecto.update({
    where: { idProyecto },
    data: { estadoProyecto: 'EN_PROGRESO' },
  });
}

describeIntegration(
  'X3 (Escenario B) — Decisión #2: cierre de Proyecto condicionado al estado del Sprint (A11)',
  () => {
    let prisma: PrismaClient;
    let projectsService: ProjectsService;
    let sprintsService: SprintsService;
    let scope: IntegrationCleanupScope;

    beforeAll(async () => {
      prisma = createIntegrationPrismaClient();
      await prisma.$connect();
      const prismaService = prisma as unknown as PrismaService;
      const notifications = makeFakeNotifications();

      projectsService = new ProjectsService(prismaService, notifications, makeFakeCacheManager());

      const sprintsContext = new SprintsContextService(prismaService);
      const sprintsAuthorization = new SprintsAuthorizationService(sprintsContext);
      sprintsService = new SprintsService(prismaService, sprintsContext, sprintsAuthorization, notifications);
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

    it('ACTIVO rechaza requestClose; EN_FINALIZACION rechaza requestClose; CERRADO permite requestClose', async () => {
      const leader = await createIntegrationUser(prisma);
      scope.userIds = [leader.idUsuario];

      const project = await createIntegrationProject(prisma, leader.idUsuario);
      scope.projectIds = [project.idProyecto];
      await markProjectInProgress(prisma, project.idProyecto);

      const sprint = await createIntegrationSprint(prisma, project.idProyecto, { estado: 'ACTIVO' });
      scope.sprintIds = [sprint.idSprint];

      // --- Sprint ACTIVO: requestClose real, RECHAZADO ---
      let rejectionActivo: unknown;
      try {
        await projectsService.requestClose(project.idProyecto, leader.idUsuario);
      } catch (error) {
        rejectionActivo = error;
      }
      expect(rejectionActivo).toBeInstanceOf(ConflictException);
      expect((rejectionActivo as ConflictException).message).toBe(
        'Debes cerrar el Sprint actual antes de solicitar el cierre del proyecto',
      );

      const proyectoTrasActivo = await prisma.proyecto.findUniqueOrThrow({
        where: { idProyecto: project.idProyecto },
        select: { estadoProyecto: true },
      });
      expect(proyectoTrasActivo.estadoProyecto).toBe('EN_PROGRESO');

      // --- Sprint EN_FINALIZACION (A4 real): requestClose real, RECHAZADO ---
      const enFinalizacion = await sprintsService.finalizeSprint(project.idProyecto, sprint.idSprint, leader.idUsuario);
      expect(enFinalizacion.estado).toBe('EN_FINALIZACION');

      let rejectionFinalizacion: unknown;
      try {
        await projectsService.requestClose(project.idProyecto, leader.idUsuario);
      } catch (error) {
        rejectionFinalizacion = error;
      }
      expect(rejectionFinalizacion).toBeInstanceOf(ConflictException);
      expect((rejectionFinalizacion as ConflictException).message).toBe(
        'Debes cerrar el Sprint actual antes de solicitar el cierre del proyecto',
      );

      const proyectoTrasFinalizacion = await prisma.proyecto.findUniqueOrThrow({
        where: { idProyecto: project.idProyecto },
        select: { estadoProyecto: true },
      });
      expect(proyectoTrasFinalizacion.estadoProyecto).toBe('EN_PROGRESO');

      // --- Sprint CERRADO (A9 real): requestClose real, PERMITIDO ---
      const cerrado = await sprintsService.closeSprint(project.idProyecto, sprint.idSprint, leader.idUsuario);
      expect(cerrado.estado).toBe('CERRADO');

      const solicitudPermitida = await projectsService.requestClose(project.idProyecto, leader.idUsuario);
      expect(solicitudPermitida.estadoProyecto).toBe('EN_SOLICITUD_CIERRE');

      const proyectoFinal = await prisma.proyecto.findUniqueOrThrow({
        where: { idProyecto: project.idProyecto },
        select: { estadoProyecto: true },
      });
      expect(proyectoFinal.estadoProyecto).toBe('EN_SOLICITUD_CIERRE');
    });

    /**
     * Caso Sprint 1 sintético/backfillado (FND-02 + corrección FND-02.B).
     *
     * Cómo funciona FND-02 realmente (migraciones
     * 20260815120000_backfill_sprint_1 y 20260815130000_correct_legacy_sprint_states,
     * inspeccionadas en modo lectura): para todo proyecto legacy con tareas
     * huérfanas (`Tarea.idSprint IS NULL` en el momento en que la migración
     * se ejecutó), se crea un Sprint `numero = 1` y sus tareas huérfanas se
     * asocian a él. El estado final de ese Sprint 1 depende únicamente de
     * `Proyecto.estadoProyecto` en ese momento: CERRADO/CANCELADO -> Sprint
     * 1 CERRADO (con `fechaCierre` derivada); cualquier otro estado no
     * terminal (incluido EN_PROGRESO) -> Sprint 1 ACTIVO, con
     * `fechaCierre = NULL` (corrección FND-02.B).
     *
     * Esta migración solo actúa sobre datos presentes en el momento del
     * `prisma migrate deploy` — contra la base de integración temporal
     * (vacía antes de aplicar migraciones) es un no-op real, no hay forma
     * de "reejecutarla" de forma significativa sin datos legacy previos.
     * Recrear ese escenario histórico completo (crear datos con
     * `id_sprint NULL` antes de que exista la columna, y reproducir el
     * orden exacto de 29 migraciones) duplicaría la prueba dedicada de
     * FND-02/FND-02.B (`foundation-invariants.integration.spec.ts`) sin
     * aportar cobertura nueva sobre la Decisión #2 que X3 verifica aquí.
     *
     * Por eso se usa la Opción C documentada en el prompt: un fixture
     * "post-backfill" fiel, reutilizando EXACTAMENTE el mismo patrón ya
     * usado por `foundation-invariants.integration.spec.ts` para
     * representar un Sprint 1 sintético
     * (`createIntegrationSprint(prisma, idProyecto, { numero: 1, estado: 'ACTIVO' })`,
     * cuyo `fechaCierre` queda `NULL` por el propio default de Prisma —
     * exactamente la forma que deja FND-02.B para un proyecto EN_PROGRESO),
     * con una tarea real asociada (mismo efecto del backfill: tareas
     * legacy quedan vinculadas a este Sprint). Lo único que X3 verifica
     * aquí es que A11 (`assertNoOperableSprint`) trata este Sprint 1
     * exactamente igual que cualquier otro Sprint ACTIVO — sin ningún
     * bypass por ser `numero === 1` u origen de backfill.
     */
    it('proyecto legado con Sprint 1 sintético/backfillado (numero=1, ACTIVO, fechaCierre=NULL, con tarea legacy asociada): requestClose sigue RECHAZADO — sin bypass por ser Sprint 1', async () => {
      const leader = await createIntegrationUser(prisma);
      scope.userIds = [leader.idUsuario];

      const project = await createIntegrationProject(prisma, leader.idUsuario);
      scope.projectIds = [project.idProyecto];
      await markProjectInProgress(prisma, project.idProyecto);

      // Sprint 1 sintético: misma forma exacta que FND-02.B deja para un
      // proyecto EN_PROGRESO (numero=1, ACTIVO, fechaCierre=NULL por
      // default de Prisma, cerradoPor=NULL).
      const sprintBackfilled = await createIntegrationSprint(prisma, project.idProyecto, {
        numero: 1,
        estado: 'ACTIVO',
      });
      scope.sprintIds = [sprintBackfilled.idSprint];
      expect(sprintBackfilled.numero).toBe(1);
      expect(sprintBackfilled.fechaCierre).toBeNull();
      expect(sprintBackfilled.cerradoPor).toBeNull();

      // Tarea legacy vinculada a ese Sprint 1 — mismo efecto que el
      // backfill real produce sobre tareas huérfanas.
      const legacyTask = await createIntegrationTask(
        prisma,
        project.idProyecto,
        leader.idUsuario,
        sprintBackfilled.idSprint,
        { tituloTarea: 'X3 tarea legacy vinculada por backfill' },
      );
      scope.taskIds = [legacyTask.idTarea];

      let rejection: unknown;
      try {
        await projectsService.requestClose(project.idProyecto, leader.idUsuario);
      } catch (error) {
        rejection = error;
      }
      expect(rejection).toBeInstanceOf(ConflictException);
      expect((rejection as ConflictException).message).toBe(
        'Debes cerrar el Sprint actual antes de solicitar el cierre del proyecto',
      );

      const proyectoTrasIntento = await prisma.proyecto.findUniqueOrThrow({
        where: { idProyecto: project.idProyecto },
        select: { estadoProyecto: true },
      });
      // Sin bypass: el proyecto permanece EN_PROGRESO, nunca avanzó a
      // EN_SOLICITUD_CIERRE solo porque el Sprint operable era "el número 1".
      expect(proyectoTrasIntento.estadoProyecto).toBe('EN_PROGRESO');
    });
  },
);
