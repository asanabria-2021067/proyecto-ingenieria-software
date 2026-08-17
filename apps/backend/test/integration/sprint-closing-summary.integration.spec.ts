import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import {
  createIntegrationUser,
  createIntegrationProject,
  createIntegrationProjectRole,
  createIntegrationParticipation,
  createIntegrationSprint,
  createIntegrationTask,
  createIntegrationTaskAssignment,
} from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';
import { SprintsService } from '../../src/sprints/sprints.service';
import { SprintsContextService } from '../../src/sprints/sprints-context.service';
import { SprintsAuthorizationService } from '../../src/sprints/sprints-authorization.service';

/**
 * Integración real A8: SprintsService.getSprintClosingSummary
 * (SprintClosingSummary) contra PostgreSQL real. Verifica lo que un mock no
 * puede demostrar de forma creíble:
 *   - la agregación SQL (CTEs + json_agg + COUNT DISTINCT + SUM) produce
 *     resultados correctos sobre datos reales, no sobre fixtures de mock
 *     ya "pre-agregados" a mano;
 *   - el aislamiento projectId+sprintId es real: dos proyectos con datos
 *     deliberadamente distinguibles (5/5, 8/7 vs. 99/98) nunca se mezclan;
 *   - multirol (una misma persona con 2 ParticipacionProyecto en el mismo
 *     proyecto) no duplica al participante ni sus tareas/horas;
 *   - varios tramos históricos de AsignacionTarea sobre la MISMA tarea no
 *     inflan tareasRealizadas (COUNT DISTINCT real, no un mock que ya
 *     asume la deduplicación).
 * Se activa solo con `INTEGRATION_DATABASE_URL`; sin esa variable, SKIP
 * limpio (describeIntegration), mismo patrón que el resto de
 * test/integration/. NotificationsService no aplica aquí: A8 es de solo
 * lectura y SprintsService no lo invoca desde este método.
 */
function createHorasParticipacion(
  prisma: PrismaClient,
  idParticipacion: number,
  idSprint: number,
  horas: { horasReportadas: number; horasCalculadas: number; horasAprobadas: number },
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
      estadoHoras: 'APROBADA',
    },
  });
}

describeIntegration(
  'SprintsService.getSprintClosingSummary — PostgreSQL real (aislamiento cross-project + multirol)',
  () => {
    let prisma: PrismaClient;
    let service: SprintsService;
    let scope: IntegrationCleanupScope;
    let horasIds: number[];

    beforeAll(async () => {
      prisma = createIntegrationPrismaClient();
      const context = new SprintsContextService(prisma as any);
      const authorization = new SprintsAuthorizationService(context);
      const notifications = {} as any;
      service = new SprintsService(prisma as any, context, authorization, notifications);
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
      // (A7.1), porque horas_participacion_id_participacion_fkey es ON
      // DELETE RESTRICT.
      if (horasIds.length > 0) {
        await prisma.horasParticipacion.deleteMany({ where: { idRegistroHoras: { in: horasIds } } });
      }
      await cleanupIntegrationFixtures(prisma, scope);
    });

    /**
     * Fixture compartido: Proyecto A (con un participante multirol y otro
     * de un solo rol) y Proyecto B (con datos deliberadamente distintos:
     * 99/98 en vez de 5/5 y 8/7), reutilizando el MISMO usuario
     * (usuarioCompartido) en ambos proyectos con roles y horas
     * completamente distintos por proyecto — el caso más fuerte de
     * aislamiento: un idUsuario real que aparece en ambos summaries pero
     * nunca con los datos del otro proyecto.
     */
    async function buildFixture() {
      const leaderA = await createIntegrationUser(prisma);
      const leaderB = await createIntegrationUser(prisma);
      const usuarioCompartido = await createIntegrationUser(prisma);
      const usuarioSoloA = await createIntegrationUser(prisma);
      scope.userIds = [leaderA.idUsuario, leaderB.idUsuario, usuarioCompartido.idUsuario, usuarioSoloA.idUsuario];

      const projectA = await createIntegrationProject(prisma, leaderA.idUsuario);
      const projectB = await createIntegrationProject(prisma, leaderB.idUsuario);
      scope.projectIds = [projectA.idProyecto, projectB.idProyecto];

      const rolADev = await createIntegrationProjectRole(prisma, projectA.idProyecto, { nombreRol: 'Desarrollador A' });
      const rolAQa = await createIntegrationProjectRole(prisma, projectA.idProyecto, { nombreRol: 'QA A' });
      const rolB = await createIntegrationProjectRole(prisma, projectB.idProyecto, { nombreRol: 'Rol exclusivo B' });
      scope.roleIds = [rolADev.idRolProyecto, rolAQa.idRolProyecto, rolB.idRolProyecto];

      // usuarioCompartido: multirol dentro de Proyecto A (dev + QA) — debe
      // aparecer UNA sola vez en el summary de A, con roles.length === 2.
      const participacionCompartidaDev = await createIntegrationParticipation(
        prisma,
        usuarioCompartido.idUsuario,
        rolADev.idRolProyecto,
        { estadoParticipacion: 'ACTIVO' },
      );
      const participacionCompartidaQa = await createIntegrationParticipation(
        prisma,
        usuarioCompartido.idUsuario,
        rolAQa.idRolProyecto,
        { estadoParticipacion: 'ACTIVO' },
      );
      const participacionSoloA = await createIntegrationParticipation(
        prisma,
        usuarioSoloA.idUsuario,
        rolADev.idRolProyecto,
        { estadoParticipacion: 'ACTIVO' },
      );
      // Mismo usuario, participación INDEPENDIENTE en Proyecto B.
      const participacionCompartidaB = await createIntegrationParticipation(
        prisma,
        usuarioCompartido.idUsuario,
        rolB.idRolProyecto,
        { estadoParticipacion: 'ACTIVO' },
      );
      scope.participationIds = [
        participacionCompartidaDev.idParticipacion,
        participacionCompartidaQa.idParticipacion,
        participacionSoloA.idParticipacion,
        participacionCompartidaB.idParticipacion,
      ];

      const sprintA = await createIntegrationSprint(prisma, projectA.idProyecto, { estado: 'ACTIVO' });
      const sprintB = await createIntegrationSprint(prisma, projectB.idProyecto, { estado: 'ACTIVO' });
      scope.sprintIds = [sprintA.idSprint, sprintB.idSprint];

      // Dos tareas de Sprint A asignadas a usuarioCompartido — una de ellas
      // con DOS tramos históricos (reasignación) sobre la MISMA Tarea, para
      // demostrar COUNT(DISTINCT id_tarea) real: debe seguir contando 2
      // tareas, no 3 tramos.
      const taskA1 = await createIntegrationTask(prisma, projectA.idProyecto, leaderA.idUsuario, sprintA.idSprint, {
        estadoTarea: 'HECHO',
      });
      const taskA2 = await createIntegrationTask(prisma, projectA.idProyecto, leaderA.idUsuario, sprintA.idSprint, {
        estadoTarea: 'HECHO',
      });
      const taskA3 = await createIntegrationTask(prisma, projectA.idProyecto, leaderA.idUsuario, sprintA.idSprint, {
        estadoTarea: 'HECHO',
      });
      scope.taskIds = [taskA1.idTarea, taskA2.idTarea, taskA3.idTarea];

      const tramo1 = await createIntegrationTaskAssignment(
        prisma,
        taskA1.idTarea,
        usuarioCompartido.idUsuario,
        leaderA.idUsuario,
      );
      await prisma.asignacionTarea.update({
        where: { idAsignacion: tramo1.idAsignacion },
        data: { desasignadaEn: new Date('2026-01-05') },
      });
      const tramo2 = await createIntegrationTaskAssignment(
        prisma,
        taskA1.idTarea,
        usuarioCompartido.idUsuario,
        leaderA.idUsuario,
      );
      const tramoTaskA2 = await createIntegrationTaskAssignment(
        prisma,
        taskA2.idTarea,
        usuarioCompartido.idUsuario,
        leaderA.idUsuario,
      );
      const tramoTaskA3 = await createIntegrationTaskAssignment(
        prisma,
        taskA3.idTarea,
        usuarioSoloA.idUsuario,
        leaderA.idUsuario,
      );
      scope.assignmentIds = [tramo1.idAsignacion, tramo2.idAsignacion, tramoTaskA2.idAsignacion, tramoTaskA3.idAsignacion];

      // Tarea + asignación exclusiva de Sprint B, con el MISMO usuario
      // compartido — el summary de A jamás debe reportar esta tarea.
      const taskB1 = await createIntegrationTask(prisma, projectB.idProyecto, leaderB.idUsuario, sprintB.idSprint, {
        estadoTarea: 'HECHO',
      });
      scope.taskIds.push(taskB1.idTarea);
      const tramoTaskB1 = await createIntegrationTaskAssignment(
        prisma,
        taskB1.idTarea,
        usuarioCompartido.idUsuario,
        leaderB.idUsuario,
      );
      scope.assignmentIds.push(tramoTaskB1.idAsignacion);

      // Horas: usuarioCompartido en Proyecto A suma 5/5/5 repartido entre
      // sus dos participaciones (dev: 3, qa: 2) — SUM real por usuario,
      // nunca duplicado por rol. usuarioSoloA: 8 reportadas/8 calculadas/7
      // aprobadas (ajuste). Proyecto B: 99/99/98, deliberadamente muy
      // distinto y fuera de rango de A para detectar cualquier fuga.
      const horasCompartidaDev = await createHorasParticipacion(prisma, participacionCompartidaDev.idParticipacion, sprintA.idSprint, {
        horasReportadas: 3,
        horasCalculadas: 3,
        horasAprobadas: 3,
      });
      const horasCompartidaQa = await createHorasParticipacion(prisma, participacionCompartidaQa.idParticipacion, sprintA.idSprint, {
        horasReportadas: 2,
        horasCalculadas: 2,
        horasAprobadas: 2,
      });
      const horasSoloA = await createHorasParticipacion(prisma, participacionSoloA.idParticipacion, sprintA.idSprint, {
        horasReportadas: 8,
        horasCalculadas: 8,
        horasAprobadas: 7,
      });
      const horasCompartidaB = await createHorasParticipacion(prisma, participacionCompartidaB.idParticipacion, sprintB.idSprint, {
        horasReportadas: 99,
        horasCalculadas: 99,
        horasAprobadas: 98,
      });
      horasIds = [
        horasCompartidaDev.idRegistroHoras,
        horasCompartidaQa.idRegistroHoras,
        horasSoloA.idRegistroHoras,
        horasCompartidaB.idRegistroHoras,
      ];

      return {
        leaderA,
        leaderB,
        usuarioCompartido,
        usuarioSoloA,
        projectA,
        projectB,
        sprintA,
        sprintB,
        rolADev,
        rolAQa,
        rolB,
        participacionCompartidaDev,
        participacionCompartidaQa,
        participacionSoloA,
        participacionCompartidaB,
      };
    }

    it('Proyecto A: agrega multirol sin duplicar persona, deduplica tramos por Tarea, y NUNCA expone datos de Proyecto B', async () => {
      const fx = await buildFixture();

      const summary = await service.getSprintClosingSummary(
        fx.projectA.idProyecto,
        fx.sprintA.idSprint,
        fx.leaderA.idUsuario,
      );

      expect(summary.idProyecto).toBe(fx.projectA.idProyecto);
      expect(summary.idSprint).toBe(fx.sprintA.idSprint);
      // Person-centric: exactamente 2 participantes (usuarioCompartido +
      // usuarioSoloA), nunca 3 (que sería el resultado de duplicar por rol).
      expect(summary.participantes).toHaveLength(2);

      const entradaCompartida = summary.participantes.find(
        (p) => p.idUsuario === fx.usuarioCompartido.idUsuario,
      );
      expect(entradaCompartida).toBeDefined();
      // Multirol: 2 roles, ambos de Proyecto A, ninguno de Proyecto B.
      expect(entradaCompartida!.roles).toHaveLength(2);
      const nombresRoles = entradaCompartida!.roles.map((r) => r.nombreRol).sort();
      expect(nombresRoles).toEqual(['Desarrollador A', 'QA A']);
      expect(nombresRoles).not.toContain('Rol exclusivo B');
      // 2 tareas distintas (taskA1 + taskA2), pese a 2 tramos sobre taskA1.
      expect(entradaCompartida!.tareasRealizadas).toBe(2);
      // Horas: SUM de sus 2 participaciones en Proyecto A (3+2), nunca la
      // fila de Proyecto B (99/99/98).
      expect(entradaCompartida!.horasReportadas).toBe(5);
      expect(entradaCompartida!.horasCalculadas).toBe(5);
      expect(entradaCompartida!.horasAprobadas).toBe(5);
      expect(entradaCompartida!.horasReportadas).not.toBe(99);
      expect(entradaCompartida!.horasAprobadas).not.toBe(98);

      // A8.1: desglose por participación — usuarioCompartido tiene 2
      // ParticipacionProyecto en A (dev=3h, qa=2h); ambas deben aparecer con
      // su propio idParticipacion real, y su suma debe coincidir con el
      // total person-centric de arriba (5 = 3 + 2).
      expect(entradaCompartida!.participaciones).toHaveLength(2);
      const idsParticipacion = entradaCompartida!.participaciones.map((p) => p.idParticipacion).sort();
      expect(idsParticipacion).toEqual(
        [fx.participacionCompartidaDev.idParticipacion, fx.participacionCompartidaQa.idParticipacion].sort(),
      );
      const dev = entradaCompartida!.participaciones.find(
        (p) => p.idParticipacion === fx.participacionCompartidaDev.idParticipacion,
      )!;
      const qa = entradaCompartida!.participaciones.find(
        (p) => p.idParticipacion === fx.participacionCompartidaQa.idParticipacion,
      )!;
      expect(dev.nombreRol).toBe('Desarrollador A');
      expect(dev.horasCalculadas).toBe(3);
      expect(dev.horasAprobadas).toBe(3);
      expect(qa.nombreRol).toBe('QA A');
      expect(qa.horasCalculadas).toBe(2);
      expect(qa.horasAprobadas).toBe(2);
      expect(
        entradaCompartida!.participaciones.reduce((acc, p) => acc + (p.horasCalculadas ?? 0), 0),
      ).toBe(entradaCompartida!.horasCalculadas);

      const entradaSoloA = summary.participantes.find((p) => p.idUsuario === fx.usuarioSoloA.idUsuario);
      expect(entradaSoloA).toBeDefined();
      expect(entradaSoloA!.roles).toHaveLength(1);
      expect(entradaSoloA!.roles[0].nombreRol).toBe('Desarrollador A');
      expect(entradaSoloA!.tareasRealizadas).toBe(1);
      expect(entradaSoloA!.horasReportadas).toBe(8);
      expect(entradaSoloA!.horasCalculadas).toBe(8);
      expect(entradaSoloA!.horasAprobadas).toBe(7);
      // Participación única: desglose de un solo elemento, con el ajuste
      // (8 calculadas -> 7 aprobadas) reflejado exactamente ahí.
      expect(entradaSoloA!.participaciones).toHaveLength(1);
      expect(entradaSoloA!.participaciones[0].idParticipacion).toBe(fx.participacionSoloA.idParticipacion);
      expect(entradaSoloA!.participaciones[0].horasCalculadas).toBe(8);
      expect(entradaSoloA!.participaciones[0].horasAprobadas).toBe(7);

      // Ningún participante de A trae el usuario/rol/hora exclusivo de B.
      expect(summary.participantes.every((p) => p.idUsuario !== fx.leaderB.idUsuario)).toBe(true);
      expect(summary.participantes.every((p) => !p.roles.some((r) => r.nombreRol === 'Rol exclusivo B'))).toBe(
        true,
      );
    });

    it('Proyecto B: el summary del OTRO proyecto reporta al mismo usuario compartido con SUS PROPIOS datos (99/98), sin roles ni horas de Proyecto A', async () => {
      const fx = await buildFixture();

      const summary = await service.getSprintClosingSummary(
        fx.projectB.idProyecto,
        fx.sprintB.idSprint,
        fx.leaderB.idUsuario,
      );

      expect(summary.participantes).toHaveLength(1);
      const entrada = summary.participantes[0];
      expect(entrada.idUsuario).toBe(fx.usuarioCompartido.idUsuario);
      expect(entrada.roles).toHaveLength(1);
      expect(entrada.roles[0].nombreRol).toBe('Rol exclusivo B');
      expect(entrada.tareasRealizadas).toBe(1);
      expect(entrada.horasReportadas).toBe(99);
      expect(entrada.horasCalculadas).toBe(99);
      expect(entrada.horasAprobadas).toBe(98);
      // Ninguna fuga de las horas/roles del mismo usuario en Proyecto A.
      expect(entrada.horasAprobadas).not.toBe(5);
      const nombresRoles = entrada.roles.map((r) => r.nombreRol);
      expect(nombresRoles).not.toContain('Desarrollador A');
      expect(nombresRoles).not.toContain('QA A');

      // A8.1: el desglose de Proyecto B expone únicamente la participación
      // de B (99/98), nunca los idParticipacion de A (dev/qa) del mismo
      // usuario compartido — aislamiento cross-project real a nivel de
      // participación individual, no solo del total agregado.
      expect(entrada.participaciones).toHaveLength(1);
      expect(entrada.participaciones[0].idParticipacion).toBe(fx.participacionCompartidaB.idParticipacion);
      expect(entrada.participaciones[0].horasCalculadas).toBe(99);
      expect(entrada.participaciones[0].horasAprobadas).toBe(98);
      const idsParticipacionB = entrada.participaciones.map((p) => p.idParticipacion);
      expect(idsParticipacionB).not.toContain(fx.participacionCompartidaDev.idParticipacion);
      expect(idsParticipacionB).not.toContain(fx.participacionCompartidaQa.idParticipacion);
    });

    it('A8.1: justificacionAjuste ya persistida por un ajuste previo se expone en la participación correcta, no en las demás', async () => {
      const fx = await buildFixture();
      // Ajusta directamente el registro de horas de la participación "dev"
      // (mismo efecto que dejaría un PATCH A7 exitoso), sin tocar "qa".
      await prisma.horasParticipacion.update({
        where: { idRegistroHoras: horasIds[0] }, // horasCompartidaDev, ver buildFixture
        data: {
          horasAprobadas: 5,
          justificacionAjuste: 'Se reconocen dos horas adicionales por soporte fuera de horario.',
        },
      });

      const summary = await service.getSprintClosingSummary(
        fx.projectA.idProyecto,
        fx.sprintA.idSprint,
        fx.leaderA.idUsuario,
      );

      const entradaCompartida = summary.participantes.find(
        (p) => p.idUsuario === fx.usuarioCompartido.idUsuario,
      )!;
      const dev = entradaCompartida.participaciones.find(
        (p) => p.idParticipacion === fx.participacionCompartidaDev.idParticipacion,
      )!;
      const qa = entradaCompartida.participaciones.find(
        (p) => p.idParticipacion === fx.participacionCompartidaQa.idParticipacion,
      )!;
      expect(dev.horasAprobadas).toBe(5);
      expect(dev.justificacionAjuste).toBe(
        'Se reconocen dos horas adicionales por soporte fuera de horario.',
      );
      expect(qa.justificacionAjuste).toBeNull();
      expect(qa.horasAprobadas).toBe(2);
    });

    it('Sprint ajeno: sprintId de Proyecto B consultado bajo Proyecto A lanza NotFoundException, sin filtrar ningún dato', async () => {
      const fx = await buildFixture();

      await expect(
        service.getSprintClosingSummary(fx.projectA.idProyecto, fx.sprintB.idSprint, fx.leaderA.idUsuario),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  },
);
