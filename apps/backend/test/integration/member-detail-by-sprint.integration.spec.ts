import { afterAll, afterEach, beforeAll, beforeEach, expect } from 'vitest';
import { EstadoParticipacion, EstadoSprint, EstadoTarea, type PrismaClient } from '@prisma/client';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import {
  createIntegrationParticipation,
  createIntegrationProject,
  createIntegrationProjectRole,
  createIntegrationSprint,
  createIntegrationTask,
  createIntegrationTaskAssignment,
  createIntegrationUser,
} from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';
import { TeamService } from '../../src/team/team.service';

describeIntegration('TeamService.findTeamMemberDetail — agrupación por Sprint PostgreSQL real', () => {
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
    if (horasParticipacionIds.length > 0) {
      await prisma.horasParticipacion.deleteMany({
        where: { idRegistroHoras: { in: horasParticipacionIds } },
      });
    }
    await cleanupIntegrationFixtures(prisma, scope);
  });

  async function crearHorasSprint(
    idParticipacion: number,
    idSprint: number,
    horas: number,
  ) {
    const registro = await prisma.horasParticipacion.create({
      data: {
        idParticipacion,
        idSprint,
        periodoInicio: new Date('2026-01-01'),
        periodoFin: new Date('2026-01-15'),
        horasReportadas: horas,
        horasCalculadas: horas,
        horasAprobadas: horas,
        estadoHoras: 'APROBADA',
      },
    });
    horasParticipacionIds.push(registro.idRegistroHoras);
    return registro;
  }

  it('mantiene tareas y horas separadas por Sprint y excluye actividad de otro proyecto', async () => {
    const leaderP = await createIntegrationUser(prisma);
    const leaderQ = await createIntegrationUser(prisma);
    const member = await createIntegrationUser(prisma);
    scope.userIds = [leaderP.idUsuario, leaderQ.idUsuario, member.idUsuario];

    const projectP = await createIntegrationProject(prisma, leaderP.idUsuario);
    const projectQ = await createIntegrationProject(prisma, leaderQ.idUsuario);
    scope.projectIds = [projectP.idProyecto, projectQ.idProyecto];

    const roleP = await createIntegrationProjectRole(prisma, projectP.idProyecto, {
      nombreRol: 'Desarrollador P',
    });
    const roleQ = await createIntegrationProjectRole(prisma, projectQ.idProyecto, {
      nombreRol: 'Desarrollador Q',
    });
    scope.roleIds = [roleP.idRolProyecto, roleQ.idRolProyecto];

    const participationP = await createIntegrationParticipation(
      prisma,
      member.idUsuario,
      roleP.idRolProyecto,
      { estadoParticipacion: EstadoParticipacion.ACTIVO },
    );
    const participationQ = await createIntegrationParticipation(
      prisma,
      member.idUsuario,
      roleQ.idRolProyecto,
      { estadoParticipacion: EstadoParticipacion.ACTIVO },
    );
    scope.participationIds = [participationP.idParticipacion, participationQ.idParticipacion];

    const sprintP1 = await createIntegrationSprint(prisma, projectP.idProyecto, {
      numero: 1,
      estado: EstadoSprint.CERRADO,
    });
    const sprintP2 = await createIntegrationSprint(prisma, projectP.idProyecto, {
      numero: 2,
      estado: EstadoSprint.CERRADO,
    });
    const sprintQ1 = await createIntegrationSprint(prisma, projectQ.idProyecto, {
      numero: 1,
      estado: EstadoSprint.CERRADO,
    });
    scope.sprintIds = [sprintP1.idSprint, sprintP2.idSprint, sprintQ1.idSprint];

    const taskP1 = await createIntegrationTask(
      prisma,
      projectP.idProyecto,
      leaderP.idUsuario,
      sprintP1.idSprint,
      { tituloTarea: 'Tarea P Sprint 1', estadoTarea: EstadoTarea.HECHO },
    );
    const taskP2 = await createIntegrationTask(
      prisma,
      projectP.idProyecto,
      leaderP.idUsuario,
      sprintP2.idSprint,
      { tituloTarea: 'Tarea P Sprint 2', estadoTarea: EstadoTarea.HECHO },
    );
    const taskQ1 = await createIntegrationTask(
      prisma,
      projectQ.idProyecto,
      leaderQ.idUsuario,
      sprintQ1.idSprint,
      { tituloTarea: 'Tarea Q Sprint 1', estadoTarea: EstadoTarea.HECHO },
    );
    scope.taskIds = [taskP1.idTarea, taskP2.idTarea, taskQ1.idTarea];

    const assignmentP1 = await createIntegrationTaskAssignment(
      prisma,
      taskP1.idTarea,
      member.idUsuario,
      leaderP.idUsuario,
    );
    const assignmentP2 = await createIntegrationTaskAssignment(
      prisma,
      taskP2.idTarea,
      member.idUsuario,
      leaderP.idUsuario,
    );
    const assignmentQ1 = await createIntegrationTaskAssignment(
      prisma,
      taskQ1.idTarea,
      member.idUsuario,
      leaderQ.idUsuario,
    );
    scope.assignmentIds = [
      assignmentP1.idAsignacion,
      assignmentP2.idAsignacion,
      assignmentQ1.idAsignacion,
    ];

    await prisma.asignacionTarea.update({
      where: { idAsignacion: assignmentP1.idAsignacion },
      data: { horasReales: 3 },
    });
    await prisma.asignacionTarea.update({
      where: { idAsignacion: assignmentP2.idAsignacion },
      data: { horasReales: 7 },
    });
    await prisma.asignacionTarea.update({
      where: { idAsignacion: assignmentQ1.idAsignacion },
      data: { horasReales: 11 },
    });

    await crearHorasSprint(participationP.idParticipacion, sprintP1.idSprint, 3);
    await crearHorasSprint(participationP.idParticipacion, sprintP2.idSprint, 7);
    await crearHorasSprint(participationQ.idParticipacion, sprintQ1.idSprint, 11);

    const detalle = await service.findTeamMemberDetail(
      projectP.idProyecto,
      member.idUsuario,
      leaderP.idUsuario,
    );

    expect(detalle.sprints).toHaveLength(2);

    const grupoP1 = detalle.sprints.find((s) => s.idSprint === sprintP1.idSprint);
    const grupoP2 = detalle.sprints.find((s) => s.idSprint === sprintP2.idSprint);
    const grupoQ1 = detalle.sprints.find((s) => s.idSprint === sprintQ1.idSprint);

    expect(grupoP1).toBeDefined();
    expect(grupoP2).toBeDefined();
    expect(grupoQ1).toBeUndefined();

    expect(grupoP1!.tareas.map((t) => t.idTarea)).toEqual([taskP1.idTarea]);
    expect(grupoP1!.tareas.some((t) => t.idTarea === taskP2.idTarea)).toBe(false);
    expect(grupoP1!.horasAprobadas).toBe(3);

    expect(grupoP2!.tareas.map((t) => t.idTarea)).toEqual([taskP2.idTarea]);
    expect(grupoP2!.tareas.some((t) => t.idTarea === taskP1.idTarea)).toBe(false);
    expect(grupoP2!.horasAprobadas).toBe(7);

    expect(detalle.tareas.map((t) => t.idTarea).sort()).toEqual(
      [taskP1.idTarea, taskP2.idTarea].sort(),
    );
    expect(detalle.tareas.some((t) => t.idTarea === taskQ1.idTarea)).toBe(false);
    expect(detalle.sprints.some((s) => s.horasAprobadas === 11)).toBe(false);
  });
});
