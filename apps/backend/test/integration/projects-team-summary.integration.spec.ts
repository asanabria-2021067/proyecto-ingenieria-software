import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
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
import { TeamService } from '../../src/team/team.service';

/**
 * Integración real T-106 (Tarea 4) contra PostgreSQL: getTeamSummary
 * agrupando multi-rol legal y aislamiento cross-project, contra la base de
 * datos real en lugar de mocks Prisma. Se activa solo con
 * `INTEGRATION_DATABASE_URL`; sin esa variable, SKIP limpio (describeIntegration).
 *
 * No repite la prueba genérica del índice parcial
 * `participacion_proyecto_activa_unique` (ya cubierta en
 * partial-index-invariants.integration.spec.ts): aquí solo se usa el hecho
 * de que ese índice es por (idUsuario, idRolProyecto) — así que dos roles
 * DISTINTOS del mismo usuario en el mismo proyecto sí pueden estar ambos
 * ACTIVO simultáneamente — para construir el escenario multi-rol real.
 */
describeIntegration('TeamService.getTeamSummary — integración PostgreSQL real', () => {
  let prisma: PrismaClient;
  let service: TeamService;
  let scope: IntegrationCleanupScope;
  let horasParticipacionIds: number[];

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    service = new TeamService(prisma as any, { findAll: async () => [] } as any, { getPendingLeaderReviews: async () => [] } as any);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    scope = {};
    horasParticipacionIds = [];
  });

  afterEach(async () => {
    // HorasParticipacion no forma parte de IntegrationCleanupScope (T15): se
    // borra aquí explícitamente, antes de las participaciones de las que
    // depende por FK, respetando el mismo orden FK-safe que cleanupIntegrationFixtures.
    if (horasParticipacionIds.length > 0) {
      await prisma.horasParticipacion.deleteMany({
        where: { idRegistroHoras: { in: horasParticipacionIds } },
      });
    }
    await cleanupIntegrationFixtures(prisma, scope);
  });

  async function crearHoras(
    idParticipacion: number,
    horasAprobadas: number | null,
    estadoHoras: 'APROBADA' | 'PENDIENTE' | 'RECHAZADA' = 'APROBADA',
  ) {
    const registro = await prisma.horasParticipacion.create({
      data: {
        idParticipacion,
        periodoInicio: new Date('2026-01-01'),
        periodoFin: new Date('2026-01-15'),
        horasReportadas: horasAprobadas ?? 0,
        horasAprobadas,
        estadoHoras,
      },
    });
    horasParticipacionIds.push(registro.idRegistroHoras);
    return registro;
  }

  it('multi-rol real: un usuario con dos ParticipacionProyecto ACTIVO en distintos roles del mismo proyecto aparece una sola vez en miembros con roles.length === 2', async () => {
    const leader = await createIntegrationUser(prisma);
    const memberX = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario, memberX.idUsuario];

    const project = await createIntegrationProject(prisma, leader.idUsuario);
    scope.projectIds = [project.idProyecto];

    const rolDev = await createIntegrationProjectRole(prisma, project.idProyecto, {
      nombreRol: 'Desarrollador',
    });
    const rolQa = await createIntegrationProjectRole(prisma, project.idProyecto, { nombreRol: 'QA' });
    scope.roleIds = [rolDev.idRolProyecto, rolQa.idRolProyecto];

    // El índice único parcial real es (id_usuario, id_rol_proyecto) WHERE
    // ACTIVO: dos roles distintos del mismo usuario nunca colisionan, así que
    // ambas participaciones ACTIVO son legales simultáneamente.
    const pDev = await createIntegrationParticipation(prisma, memberX.idUsuario, rolDev.idRolProyecto, {
      estadoParticipacion: 'ACTIVO',
    });
    const pQa = await createIntegrationParticipation(prisma, memberX.idUsuario, rolQa.idRolProyecto, {
      estadoParticipacion: 'ACTIVO',
    });
    scope.participationIds = [pDev.idParticipacion, pQa.idParticipacion];

    const resumen = await service.getTeamSummary(project.idProyecto, leader.idUsuario);

    expect(resumen.lider.idUsuario).toBe(leader.idUsuario);
    const miembrosX = resumen.miembros.filter((m) => m.idUsuario === memberX.idUsuario);
    expect(miembrosX).toHaveLength(1);
    expect(miembrosX[0].roles).toHaveLength(2);
    expect(miembrosX[0].roles.map((r) => r.idRolProyecto).sort()).toEqual(
      [rolDev.idRolProyecto, rolQa.idRolProyecto].sort(),
    );
  });

  it('aislamiento cross-project: tareas y horas del Proyecto B no contaminan el resumen del Proyecto A, aunque el mismo usuario participe en ambos', async () => {
    const leaderA = await createIntegrationUser(prisma);
    const leaderB = await createIntegrationUser(prisma);
    const memberX = await createIntegrationUser(prisma);
    scope.userIds = [leaderA.idUsuario, leaderB.idUsuario, memberX.idUsuario];

    const projectA = await createIntegrationProject(prisma, leaderA.idUsuario);
    const projectB = await createIntegrationProject(prisma, leaderB.idUsuario);
    scope.projectIds = [projectA.idProyecto, projectB.idProyecto];

    const rolA = await createIntegrationProjectRole(prisma, projectA.idProyecto);
    const rolB = await createIntegrationProjectRole(prisma, projectB.idProyecto);
    scope.roleIds = [rolA.idRolProyecto, rolB.idRolProyecto];

    const participacionA = await createIntegrationParticipation(prisma, memberX.idUsuario, rolA.idRolProyecto, {
      estadoParticipacion: 'ACTIVO',
    });
    const participacionB = await createIntegrationParticipation(prisma, memberX.idUsuario, rolB.idRolProyecto, {
      estadoParticipacion: 'ACTIVO',
    });
    scope.participationIds = [participacionA.idParticipacion, participacionB.idParticipacion];

    const sprintA = await createIntegrationSprint(prisma, projectA.idProyecto);
    const sprintB = await createIntegrationSprint(prisma, projectB.idProyecto);
    scope.sprintIds = [sprintA.idSprint, sprintB.idSprint];

    const taskA = await createIntegrationTask(prisma, projectA.idProyecto, leaderA.idUsuario, sprintA.idSprint, {
      estadoTarea: 'HECHO',
    });
    const taskB = await createIntegrationTask(prisma, projectB.idProyecto, leaderB.idUsuario, sprintB.idSprint, {
      estadoTarea: 'HECHO',
    });
    scope.taskIds = [taskA.idTarea, taskB.idTarea];

    const assignmentA = await createIntegrationTaskAssignment(
      prisma,
      taskA.idTarea,
      memberX.idUsuario,
      leaderA.idUsuario,
    );
    const assignmentB = await createIntegrationTaskAssignment(
      prisma,
      taskB.idTarea,
      memberX.idUsuario,
      leaderB.idUsuario,
    );
    scope.assignmentIds = [assignmentA.idAsignacion, assignmentB.idAsignacion];

    await crearHoras(participacionA.idParticipacion, 5);
    await crearHoras(participacionB.idParticipacion, 99);

    const resumenA = await service.getTeamSummary(projectA.idProyecto, leaderA.idUsuario);

    const miembrosXenA = resumenA.miembros.filter((m) => m.idUsuario === memberX.idUsuario);
    expect(miembrosXenA).toHaveLength(1);
    // Ni la tarea de B (también HECHO) ni sus horas (99) se filtran a A.
    expect(miembrosXenA[0].tareasCompletadas).toBe(1);
    expect(miembrosXenA[0].tareasActivas).toBe(0);
    expect(miembrosXenA[0].horasReconocidas).toBe(5);

    const resumenB = await service.getTeamSummary(projectB.idProyecto, leaderB.idUsuario);
    const miembrosXenB = resumenB.miembros.filter((m) => m.idUsuario === memberX.idUsuario);
    expect(miembrosXenB).toHaveLength(1);
    expect(miembrosXenB[0].tareasCompletadas).toBe(1);
    expect(miembrosXenB[0].horasReconocidas).toBe(99);
  });

  it('proyecto sin integrantes: retorna lider poblado y miembros: [] contra la base real', async () => {
    const leader = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario];

    const project = await createIntegrationProject(prisma, leader.idUsuario);
    scope.projectIds = [project.idProyecto];

    const resumen = await service.getTeamSummary(project.idProyecto, leader.idUsuario);

    expect(resumen.lider.idUsuario).toBe(leader.idUsuario);
    expect(resumen.miembros).toEqual([]);
  });
});
