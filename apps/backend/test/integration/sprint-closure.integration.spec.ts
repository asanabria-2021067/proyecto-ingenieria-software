import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import {
  createIntegrationUser,
  createIntegrationProject,
  createIntegrationProjectRole,
  createIntegrationParticipation,
  createIntegrationSprint,
} from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';
import { SprintsService } from '../../src/sprints/sprints.service';
import { SprintsContextService } from '../../src/sprints/sprints-context.service';
import { SprintsAuthorizationService } from '../../src/sprints/sprints-authorization.service';
import type { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Integración real A9: SprintsService.closeSprint (EN_FINALIZACION ->
 * CERRADO) contra PostgreSQL real. Verifica lo que un mock no puede
 * demostrar de forma creíble: atomicidad real (rollback real de PostgreSQL,
 * no solo "un mock de $transaction no llamó commit") y que las horas ya
 * revisadas por A7 sobreviven intactas al cierre. Se activa solo con
 * `INTEGRATION_DATABASE_URL`; sin esa variable, SKIP limpio
 * (describeIntegration), mismo patrón que el resto de test/integration/.
 * NUNCA se usa la base de desarrollo activa (uvg-collab-db) como sustituto:
 * si `INTEGRATION_DATABASE_URL` no apunta a una base de integración
 * explícita, esta suite queda SKIPPED, sin fallback silencioso.
 */
function makeNotificationsSpy() {
  return {
    notifyProjectActiveParticipants: async () => undefined,
    notifySprintFinalizationStarted: async () => undefined,
    notifySprintClosed: async () => undefined,
  };
}

function createHorasParticipacion(
  prisma: PrismaClient,
  idParticipacion: number,
  idSprint: number,
  horas: { horasReportadas: number; horasCalculadas: number; horasAprobadas: number; justificacionAjuste: string },
) {
  return prisma.horasParticipacion.create({
    data: {
      idParticipacion,
      idSprint,
      periodoInicio: new Date('2026-01-01'),
      periodoFin: new Date('2026-01-31'),
      horasReportadas: horas.horasReportadas,
      horasCalculadas: horas.horasCalculadas,
      horasAprobadas: horas.horasAprobadas,
      justificacionAjuste: horas.justificacionAjuste,
      estadoHoras: 'APROBADA',
    },
  });
}

/**
 * Envuelve ÚNICAMENTE `$transaction`: deja que el callback real de
 * `closeSprint` corra hasta el final contra el cliente `tx` REAL de Prisma
 * (así que `updateMany` ejecuta una escritura real dentro de la
 * transacción, y la relectura final incluso la ve, porque todavía está
 * dentro de la misma transacción), y justo DESPUÉS de que ese callback
 * resuelve — es decir, después de que la escritura real ya ocurrió —
 * lanza una excepción de test. Esa excepción hace que la función pasada al
 * `$transaction` REAL de Prisma rechace, así que PostgreSQL hace ROLLBACK
 * real de la transacción completa, incluyendo el `updateMany` que ya se
 * había ejecutado. Cero cambios en código de producción: closeSprint no
 * sabe que está siendo envuelto.
 */
function wrapWithRollbackAfterRealWrite(realPrisma: PrismaClient, injectedError: Error): PrismaService {
  return {
    $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
      realPrisma.$transaction(async (tx) => {
        await callback(tx);
        throw injectedError;
      }),
  } as unknown as PrismaService;
}

describeIntegration(
  'SprintsService.closeSprint — PostgreSQL real (atomicidad, rollback real, preservación de horas A7)',
  () => {
    let prisma: PrismaClient;
    let scope: IntegrationCleanupScope;
    let horasIds: number[];

    function makeService(prismaParaTransaccion: PrismaClient = prisma) {
      const context = new SprintsContextService(prisma as any);
      const authorization = new SprintsAuthorizationService(context);
      return new SprintsService(
        prismaParaTransaccion as any,
        context,
        authorization,
        makeNotificationsSpy() as any,
      );
    }

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
      // HorasParticipacion no forma parte de IntegrationCleanupScope (T15):
      // se limpia manualmente ANTES de cleanupIntegrationFixtures, mismo
      // orden que hours-participation-sprint-uniqueness.integration.spec.ts
      // (A7.1) y sprint-closing-summary.integration.spec.ts (A8), porque
      // horas_participacion_id_participacion_fkey es ON DELETE RESTRICT.
      if (horasIds.length > 0) {
        await prisma.horasParticipacion.deleteMany({ where: { idRegistroHoras: { in: horasIds } } });
      }
      await cleanupIntegrationFixtures(prisma, scope);
    });

    it('A. cierre exitoso: EN_FINALIZACION -> CERRADO, persiste fechaCierre y cerradoPor = líder', async () => {
      const leader = await createIntegrationUser(prisma);
      scope.userIds = [leader.idUsuario];
      const project = await createIntegrationProject(prisma, leader.idUsuario);
      scope.projectIds = [project.idProyecto];
      const sprint = await createIntegrationSprint(prisma, project.idProyecto, { estado: 'EN_FINALIZACION' });
      scope.sprintIds = [sprint.idSprint];

      const service = makeService();
      const antes = Date.now();
      const resultado = await service.closeSprint(project.idProyecto, sprint.idSprint, leader.idUsuario);
      expect(resultado.estado).toBe('CERRADO');

      const sprintFinal = await prisma.sprint.findUniqueOrThrow({ where: { idSprint: sprint.idSprint } });
      expect(sprintFinal.estado).toBe('CERRADO');
      expect(sprintFinal.fechaCierre).not.toBeNull();
      expect(sprintFinal.fechaCierre!.getTime()).toBeGreaterThanOrEqual(antes - 1000);
      expect(sprintFinal.cerradoPor).toBe(leader.idUsuario);
    });

    it('B. rollback real: la excepción inyectada DESPUÉS del UPDATE real revierte el Sprint a EN_FINALIZACION en PostgreSQL', async () => {
      const leader = await createIntegrationUser(prisma);
      scope.userIds = [leader.idUsuario];
      const project = await createIntegrationProject(prisma, leader.idUsuario);
      scope.projectIds = [project.idProyecto];
      const sprint = await createIntegrationSprint(prisma, project.idProyecto, { estado: 'EN_FINALIZACION' });
      scope.sprintIds = [sprint.idSprint];
      const role = await createIntegrationProjectRole(prisma, project.idProyecto);
      scope.roleIds = [role.idRolProyecto];
      const participation = await createIntegrationParticipation(prisma, leader.idUsuario, role.idRolProyecto, {
        estadoParticipacion: 'ACTIVO',
      });
      scope.participationIds = [participation.idParticipacion];
      const horas = await createHorasParticipacion(prisma, participation.idParticipacion, sprint.idSprint, {
        horasReportadas: 8,
        horasCalculadas: 8,
        horasAprobadas: 7,
        justificacionAjuste: 'ajuste previo al intento de cierre que falla',
      });
      horasIds = [horas.idRegistroHoras];

      const injectedError = new Error('A9 rollback test: fallo inyectado DESPUÉS de la escritura real');
      const rollbackPrisma = wrapWithRollbackAfterRealWrite(prisma, injectedError);
      const service = makeService(rollbackPrisma as unknown as PrismaClient);

      await expect(
        service.closeSprint(project.idProyecto, sprint.idSprint, leader.idUsuario),
      ).rejects.toBe(injectedError);

      // Consulta con el cliente REAL, fuera de la transacción que hizo
      // rollback: si el UPDATE hubiera sobrevivido, esto vería CERRADO.
      const sprintTrasRollback = await prisma.sprint.findUniqueOrThrow({
        where: { idSprint: sprint.idSprint },
      });
      expect(sprintTrasRollback.estado).toBe('EN_FINALIZACION');
      expect(sprintTrasRollback.fechaCierre).toBeNull();
      expect(sprintTrasRollback.cerradoPor).toBeNull();

      // Las horas ya aprobadas antes del intento de cierre tampoco se
      // vieron afectadas por la transacción revertida.
      const horasTrasRollback = await prisma.horasParticipacion.findUniqueOrThrow({
        where: { idRegistroHoras: horas.idRegistroHoras },
      });
      expect(Number(horasTrasRollback.horasCalculadas)).toBe(8);
      expect(Number(horasTrasRollback.horasAprobadas)).toBe(7);
      expect(horasTrasRollback.justificacionAjuste).toBe('ajuste previo al intento de cierre que falla');
    });

    it('C. CERRADO es terminal: un segundo cierre y un intento de finalizeSprint posterior fallan, el estado sigue CERRADO', async () => {
      const leader = await createIntegrationUser(prisma);
      scope.userIds = [leader.idUsuario];
      const project = await createIntegrationProject(prisma, leader.idUsuario);
      scope.projectIds = [project.idProyecto];
      const sprint = await createIntegrationSprint(prisma, project.idProyecto, { estado: 'EN_FINALIZACION' });
      scope.sprintIds = [sprint.idSprint];

      const service = makeService();
      const primerCierre = await service.closeSprint(project.idProyecto, sprint.idSprint, leader.idUsuario);
      expect(primerCierre.estado).toBe('CERRADO');

      await expect(
        service.closeSprint(project.idProyecto, sprint.idSprint, leader.idUsuario),
      ).rejects.toBeInstanceOf(ConflictException);

      await expect(
        service.finalizeSprint(project.idProyecto, sprint.idSprint, leader.idUsuario),
      ).rejects.toBeInstanceOf(ConflictException);

      const sprintFinal = await prisma.sprint.findUniqueOrThrow({ where: { idSprint: sprint.idSprint } });
      expect(sprintFinal.estado).toBe('CERRADO');
    });

    it('D. preservación de horas A7: horasCalculadas/horasAprobadas/justificacionAjuste sobreviven exactamente iguales al cierre', async () => {
      const leader = await createIntegrationUser(prisma);
      scope.userIds = [leader.idUsuario];
      const project = await createIntegrationProject(prisma, leader.idUsuario);
      scope.projectIds = [project.idProyecto];
      const sprint = await createIntegrationSprint(prisma, project.idProyecto, { estado: 'EN_FINALIZACION' });
      scope.sprintIds = [sprint.idSprint];
      const role = await createIntegrationProjectRole(prisma, project.idProyecto);
      scope.roleIds = [role.idRolProyecto];
      const participation = await createIntegrationParticipation(prisma, leader.idUsuario, role.idRolProyecto, {
        estadoParticipacion: 'ACTIVO',
      });
      scope.participationIds = [participation.idParticipacion];
      const horas = await createHorasParticipacion(prisma, participation.idParticipacion, sprint.idSprint, {
        horasReportadas: 8,
        horasCalculadas: 8,
        horasAprobadas: 7,
        justificacionAjuste: 'ajuste aprobado por el líder antes del cierre',
      });
      horasIds = [horas.idRegistroHoras];

      const service = makeService();
      const resultado = await service.closeSprint(project.idProyecto, sprint.idSprint, leader.idUsuario);
      expect(resultado.estado).toBe('CERRADO');

      const horasTrasCierre = await prisma.horasParticipacion.findUniqueOrThrow({
        where: { idRegistroHoras: horas.idRegistroHoras },
      });
      expect(Number(horasTrasCierre.horasCalculadas)).toBe(8);
      expect(Number(horasTrasCierre.horasAprobadas)).toBe(7);
      expect(horasTrasCierre.justificacionAjuste).toBe('ajuste aprobado por el líder antes del cierre');
    });

    it('E. A9.1: SPRINT_CLOSED se emite exactamente una vez tras un cierre real, con el payload correcto', async () => {
      const leader = await createIntegrationUser(prisma);
      scope.userIds = [leader.idUsuario];
      const project = await createIntegrationProject(prisma, leader.idUsuario);
      scope.projectIds = [project.idProyecto];
      const sprint = await createIntegrationSprint(prisma, project.idProyecto, { estado: 'EN_FINALIZACION' });
      scope.sprintIds = [sprint.idSprint];

      const notifySprintClosed = async () => undefined;
      const spy = { calls: [] as unknown[][] };
      const notifications = {
        notifyProjectActiveParticipants: async () => undefined,
        notifySprintFinalizationStarted: async () => undefined,
        notifySprintClosed: async (...args: unknown[]) => {
          spy.calls.push(args);
          return notifySprintClosed();
        },
      };
      const context = new SprintsContextService(prisma as any);
      const authorization = new SprintsAuthorizationService(context);
      const service = new SprintsService(prisma as any, context, authorization, notifications as any);

      await service.closeSprint(project.idProyecto, sprint.idSprint, leader.idUsuario);

      expect(spy.calls).toHaveLength(1);
      expect(spy.calls[0]).toEqual([
        project.idProyecto,
        leader.idUsuario,
        { projectId: project.idProyecto, sprintId: sprint.idSprint },
      ]);
    });

    it('F. A9.1: si la transacción hace rollback real, SPRINT_CLOSED nunca se emite', async () => {
      const leader = await createIntegrationUser(prisma);
      scope.userIds = [leader.idUsuario];
      const project = await createIntegrationProject(prisma, leader.idUsuario);
      scope.projectIds = [project.idProyecto];
      const sprint = await createIntegrationSprint(prisma, project.idProyecto, { estado: 'EN_FINALIZACION' });
      scope.sprintIds = [sprint.idSprint];

      const spy = { calls: [] as unknown[][] };
      const notifications = {
        notifyProjectActiveParticipants: async () => undefined,
        notifySprintFinalizationStarted: async () => undefined,
        notifySprintClosed: async (...args: unknown[]) => {
          spy.calls.push(args);
        },
      };
      const injectedError = new Error('A9.1 rollback test: fallo inyectado DESPUÉS de la escritura real');
      const rollbackPrisma = wrapWithRollbackAfterRealWrite(prisma, injectedError);
      const context = new SprintsContextService(prisma as any);
      const authorization = new SprintsAuthorizationService(context);
      const service = new SprintsService(
        rollbackPrisma as unknown as PrismaClient as any,
        context,
        authorization,
        notifications as any,
      );

      await expect(
        service.closeSprint(project.idProyecto, sprint.idSprint, leader.idUsuario),
      ).rejects.toBe(injectedError);

      expect(spy.calls).toHaveLength(0);
    });
  },
);
