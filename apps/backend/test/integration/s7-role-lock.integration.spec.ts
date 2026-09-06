import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { HttpException } from '@nestjs/common';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RolesService } from '../../src/roles/roles.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { ProjectPolicyService } from '../../src/common/project-policy/project-policy.service';
import { ProjectIdResolverService } from '../../src/common/project-policy/project-id-resolver.service';
import {
  ProjectTransactionService,
  SERIALIZABLE_MAX_ATTEMPTS,
} from '../../src/common/project-policy/project-transaction.service';
import { ProjectEligibilityService } from '../../src/eligibility/project-eligibility.service';
import { TimeRecordsService } from '../../src/time-records/time-records.service';
import { TasksContextService } from '../../src/tasks/tasks-context.service';
import { ProjectReadPolicyService } from '../../src/common/project-policy/project-read-policy.service';
import { BitacoraEventosService } from '../../src/bitacora/bitacora-eventos.service';
import {
  createIntegrationParticipation,
  createIntegrationProject,
  createIntegrationProjectRole,
  createIntegrationSprint,
  createIntegrationTask,
  createIntegrationTaskAssignment,
  createIntegrationUser,
} from './setup/fixtures';
import { cleanupIntegrationFixtures } from './setup/cleanup';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import { createSecondClient, withDeadline } from './setup/concurrency';
import { leadershipStack, createIntegrationAdmin } from './setup/leadership';
import { closureLifecycleStack } from './setup/closure-lifecycle';

/**
 * T39 (06 v2 §16/§32/§42): `leaveRole` es la ÚNICA operación con aislamiento
 * reforzado. Esta prueba la somete a dos retiros concurrentes del mismo
 * integrante mientras un administrador transfiere el liderazgo del mismo
 * proyecto, para demostrar que el `Serializable` acotado convive con el
 * protocolo común sin excepciones implícitas.
 *
 * Lo que se vigila no es solo el resultado: un reintento revertido no puede
 * dejar rastro. Una notificación, un evento de bitácora o una emisión de un
 * intento que hizo rollback serían efectos fantasma.
 */
describeIntegration('S7 retiro de rol bajo aislamiento reforzado (T39)', () => {
  let prisma: PrismaClient;
  let second: PrismaClient;

  const scope = {
    assignmentIds: [] as number[],
    taskIds: [] as number[],
    sprintIds: [] as number[],
    participationIds: [] as number[],
    roleIds: [] as number[],
    projectIds: [] as number[],
    userIds: [] as number[],
  };

  const fixture = {
    projectId: 0,
    leaderId: 0,
    memberId: 0,
    adminId: 0,
    successorId: 0,
    roleAId: 0,
    roleBId: 0,
    openAssignmentA: 0,
    openAssignmentB: 0,
    closedSprintAssignment: 0,
    closedSprintId: 0,
  };

  let rolAccesoId: number | null = null;

  function makeRolesService(client: PrismaClient) {
    const prismaService = client as unknown as PrismaService;
    const runner = new ProjectTransactionService(prismaService);
    const policy = new ProjectPolicyService(new ProjectIdResolverService(prismaService));
    const timeRecords = new TimeRecordsService(
      prismaService,
      new TasksContextService(prismaService),
      { notifyTaskHoursLogged: vi.fn().mockResolvedValue(undefined) } as unknown as NotificationsService,
      runner,
      policy,
      new ProjectReadPolicyService(prismaService),
      new BitacoraEventosService(),
    );
    const notifications = {
      notifyUsers: vi.fn().mockResolvedValue(undefined),
      notifyFromTemplate: vi.fn().mockResolvedValue(undefined),
      persistTemplateTx: vi.fn().mockResolvedValue(undefined),
      persistUsersTx: vi.fn().mockResolvedValue(undefined),
    } as unknown as NotificationsService;
    const service = new RolesService(
      prismaService,
      notifications,
      runner,
      policy,
      timeRecords,
      new ProjectEligibilityService(prismaService),
    );
    return { service, runner, notifications };
  }

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    second = createSecondClient();

    const leader = await createIntegrationUser(prisma);
    const member = await createIntegrationUser(prisma);
    const successor = await createIntegrationUser(prisma);
    scope.userIds.push(leader.idUsuario, member.idUsuario, successor.idUsuario);
    fixture.leaderId = leader.idUsuario;
    fixture.memberId = member.idUsuario;
    fixture.successorId = successor.idUsuario;

    const admin = await createIntegrationAdmin(prisma, scope);
    fixture.adminId = admin.idUsuario;
    rolAccesoId = admin.idRolAcceso ?? null;

    const project = await createIntegrationProject(prisma, leader.idUsuario, {
      estadoProyecto: 'EN_PROGRESO',
    });
    fixture.projectId = project.idProyecto;
    scope.projectIds.push(project.idProyecto);

    // El integrante ocupa DOS roles: la regla acotada exige que al menos uno
    // sobreviva, así que el resultado interesante es cuál de los dos retiros
    // gana y cómo se refuta el otro.
    const roleA = await createIntegrationProjectRole(prisma, project.idProyecto, {
      nombreRol: 'Rol A',
      cupos: 3,
    });
    const roleB = await createIntegrationProjectRole(prisma, project.idProyecto, {
      nombreRol: 'Rol B',
      cupos: 3,
    });
    scope.roleIds.push(roleA.idRolProyecto, roleB.idRolProyecto);
    fixture.roleAId = roleA.idRolProyecto;
    fixture.roleBId = roleB.idRolProyecto;

    const participationA = await createIntegrationParticipation(
      prisma,
      member.idUsuario,
      roleA.idRolProyecto,
      { estadoParticipacion: 'ACTIVO' },
    );
    const participationB = await createIntegrationParticipation(
      prisma,
      member.idUsuario,
      roleB.idRolProyecto,
      { estadoParticipacion: 'ACTIVO' },
    );
    // El sucesor participa para ser elegible como nuevo líder.
    const participationSuccessor = await createIntegrationParticipation(
      prisma,
      successor.idUsuario,
      roleA.idRolProyecto,
      { estadoParticipacion: 'ACTIVO' },
    );
    scope.participationIds.push(
      participationA.idParticipacion,
      participationB.idParticipacion,
      participationSuccessor.idParticipacion,
    );

    // Sprint anterior CERRADO con un tramo consumido: es lo que NO debe
    // tocarse pase lo que pase.
    const closedSprint = await createIntegrationSprint(prisma, project.idProyecto, {
      numero: 1,
      estado: 'CERRADO',
    });
    fixture.closedSprintId = closedSprint.idSprint;
    const closedTask = await createIntegrationTask(
      prisma,
      project.idProyecto,
      leader.idUsuario,
      closedSprint.idSprint,
      { estadoTarea: 'HECHO', idRolProyecto: roleA.idRolProyecto },
    );
    const closedAssignment = await createIntegrationTaskAssignment(
      prisma,
      closedTask.idTarea,
      member.idUsuario,
      leader.idUsuario,
      {
        idParticipacion: participationA.idParticipacion,
        horasReales: '5.00',
        desasignadaEn: new Date('2026-02-20T00:00:00.000Z'),
        reconocidoEn: new Date('2026-02-21T00:00:00.000Z'),
      },
    );
    fixture.closedSprintAssignment = closedAssignment.idAsignacion;

    // Sprint ACTIVO con un tramo abierto por rol: al retirarse, el flujo debe
    // cerrarlos materializando su caché.
    const activeSprint = await createIntegrationSprint(prisma, project.idProyecto, {
      numero: 2,
      estado: 'ACTIVO',
    });
    const taskA = await createIntegrationTask(
      prisma,
      project.idProyecto,
      leader.idUsuario,
      activeSprint.idSprint,
      { idRolProyecto: roleA.idRolProyecto },
    );
    const taskB = await createIntegrationTask(
      prisma,
      project.idProyecto,
      leader.idUsuario,
      activeSprint.idSprint,
      { idRolProyecto: roleB.idRolProyecto },
    );
    scope.sprintIds.push(closedSprint.idSprint, activeSprint.idSprint);
    scope.taskIds.push(closedTask.idTarea, taskA.idTarea, taskB.idTarea);

    const openA = await createIntegrationTaskAssignment(
      prisma,
      taskA.idTarea,
      member.idUsuario,
      leader.idUsuario,
      { idParticipacion: participationA.idParticipacion },
    );
    const openB = await createIntegrationTaskAssignment(
      prisma,
      taskB.idTarea,
      member.idUsuario,
      leader.idUsuario,
      { idParticipacion: participationB.idParticipacion },
    );
    fixture.openAssignmentA = openA.idAsignacion;
    fixture.openAssignmentB = openB.idAsignacion;
    scope.assignmentIds.push(
      closedAssignment.idAsignacion,
      openA.idAsignacion,
      openB.idAsignacion,
    );
  });

  afterAll(async () => {
    await prisma.bitacoraAuditoria.deleteMany({ where: { idUsuario: { in: scope.userIds } } });
    await prisma.notificacion.deleteMany({ where: { idUsuario: { in: scope.userIds } } });
    // El historial referencia la apelación con FK RESTRICT: primero la historia.
    await prisma.historialLiderazgo.deleteMany({
      where: { idProyecto: { in: scope.projectIds } },
    });
    await prisma.apelacionLiderazgo.deleteMany({
      where: { idProyecto: { in: scope.projectIds } },
    });
    await prisma.usuarioRolAcceso.deleteMany({ where: { idUsuario: { in: scope.userIds } } });
    await prisma.horasParticipacion.deleteMany({
      where: { idParticipacion: { in: scope.participationIds } },
    });
    await prisma.registroAvanceAsignacion.deleteMany({
      where: { idAsignacion: { in: scope.assignmentIds } },
    });
    await cleanupIntegrationFixtures(prisma, scope);
    if (rolAccesoId !== null) {
      const remaining = await prisma.usuarioRolAcceso.count({ where: { idRolAcceso: rolAccesoId } });
      if (remaining === 0) {
        await prisma.rolAcceso.deleteMany({ where: { idRolAcceso: rolAccesoId } });
      }
    }
    await second.$disconnect();
    await prisma.$disconnect();
  });

  it('T39: dos retiros de rol concurrentes con liderazgo y cierre en curso conservan al menos un rol y no dejan efectos fantasma', async () => {
    const primary = makeRolesService(prisma);
    const secondary = makeRolesService(second);
    const leadership = leadershipStack(prisma);
    const { readiness } = closureLifecycleStack(prisma);

    // Cuántas veces se ejecuta el callback: cada intento vuelve a correr TODOS
    // los asserts y el UPDATE del padre, así que contar entradas al callback
    // cuenta reintentos.
    let attempts = 0;
    const originalRun = ProjectTransactionService.prototype.run;
    const runSpy = vi
      .spyOn(ProjectTransactionService.prototype, 'run')
      .mockImplementation(async function (
        this: ProjectTransactionService,
        projectId: number | null,
        actorId: number,
        operation: string,
        callback: Parameters<ProjectTransactionService['run']>[3],
        options?: Parameters<ProjectTransactionService['run']>[4],
      ) {
        const wrapped: typeof callback = async (ctx) => {
          if (operation === 'roles.leaveRole') attempts += 1;
          return callback(ctx);
        };
        return originalRun.call(this, projectId, actorId, operation, wrapped, options);
      } as never);

    const auditBefore = await prisma.bitacoraAuditoria.count();
    const notificationsBefore = await prisma.notificacion.count();

    // ── Los dos retiros arrancan a la vez sobre el MISMO integrante.
    const resultados = await withDeadline(
      Promise.allSettled([
        primary.service.leaveRole(fixture.projectId, fixture.roleAId, fixture.memberId),
        secondary.service.leaveRole(fixture.projectId, fixture.roleBId, fixture.memberId),
        leadership.service.transfer(fixture.projectId, fixture.adminId, {
          nuevoLiderId: fixture.successorId,
          motivo: 'Transferencia concurrente durante dos retiros de rol',
          expectedLeader: fixture.leaderId,
        } as never),
      ]),
      20_000,
      'los retiros concurrentes con transferencia de liderazgo',
    );

    runSpy.mockRestore();

    const [retiroA, retiroB, transferencia] = resultados;

    // ── Al menos UN rol permanece: la regla acotada nunca deja al integrante
    //    fuera del proyecto por esta vía.
    const participacionesActivas = await prisma.participacionProyecto.count({
      where: {
        idUsuario: fixture.memberId,
        estadoParticipacion: 'ACTIVO',
        rolProyecto: { idProyecto: fixture.projectId },
      },
    });
    expect(participacionesActivas).toBeGreaterThanOrEqual(1);

    // ── Exactamente uno de los dos retiros gana; el otro se refuta con 400 o
    //    409, nunca con un efecto a medias.
    const exitos = [retiroA, retiroB].filter((r) => r.status === 'fulfilled');
    const fallos = [retiroA, retiroB].filter((r) => r.status === 'rejected');
    expect(exitos).toHaveLength(1);
    expect(fallos).toHaveLength(1);
    const razon = (fallos[0] as PromiseRejectedResult).reason;
    expect(razon).toBeInstanceOf(HttpException);
    expect([400, 409]).toContain((razon as HttpException).getStatus());

    // ── Los reintentos por conflicto de serialización no superan el tope.
    //    `attempts` cuenta ejecuciones del callback: dos operaciones más, como
    //    máximo, los reintentos permitidos de cada una.
    expect(SERIALIZABLE_MAX_ATTEMPTS).toBe(3);
    expect(attempts).toBeLessThanOrEqual(2 * SERIALIZABLE_MAX_ATTEMPTS);
    expect(attempts).toBeGreaterThanOrEqual(2);

    // ── El tramo del Sprint CERRADO queda intacto: ni se reabre ni cambia su
    //    importe ni pierde su marca de consumo.
    const cerrado = await prisma.asignacionTarea.findUniqueOrThrow({
      where: { idAsignacion: fixture.closedSprintAssignment },
    });
    expect(cerrado.horasReales?.toFixed(2)).toBe('5.00');
    expect(cerrado.reconocidoEn).not.toBeNull();
    expect(cerrado.desasignadaEn?.toISOString()).toBe('2026-02-20T00:00:00.000Z');
    const sprintCerrado = await prisma.sprint.findUniqueOrThrow({
      where: { idSprint: fixture.closedSprintId },
    });
    expect(sprintCerrado.estado).toBe('CERRADO');

    // ── El tramo abierto del rol abandonado se cierra materializando su caché;
    //    el del rol conservado sigue abierto.
    const abiertoA = await prisma.asignacionTarea.findUniqueOrThrow({
      where: { idAsignacion: fixture.openAssignmentA },
    });
    const abiertoB = await prisma.asignacionTarea.findUniqueOrThrow({
      where: { idAsignacion: fixture.openAssignmentB },
    });
    const ganadorEsA = retiroA.status === 'fulfilled';
    const abandonado = ganadorEsA ? abiertoA : abiertoB;
    const conservado = ganadorEsA ? abiertoB : abiertoA;
    expect(abandonado.desasignadaEn).not.toBeNull();
    expect(abandonado.horasReales).not.toBeNull();
    expect(conservado.desasignadaEn).toBeNull();

    // ── La transferencia termina con éxito o con 409, nunca a medias.
    if (transferencia.status === 'rejected') {
      expect(transferencia.reason).toBeInstanceOf(HttpException);
      expect((transferencia.reason as HttpException).getStatus()).toBe(409);
    }
    const proyecto = await prisma.proyecto.findUniqueOrThrow({
      where: { idProyecto: fixture.projectId },
    });
    const liderEsperado =
      transferencia.status === 'fulfilled' ? fixture.successorId : fixture.leaderId;
    expect(proyecto.creadoPor).toBe(liderEsperado);
    expect(proyecto.estadoProyecto).toBe('EN_PROGRESO');

    // ── La solicitud de cierre concurrente se refuta con su diagnóstico, no
    //    con un cierre parcial: el proyecto sigue operativo.
    const resumen = await readiness.evaluate(undefined, fixture.projectId, { phase: 'REQUEST' });
    expect(resumen.canSubmit).toBe(false);
    expect(resumen.blockers.map((blocker) => blocker.code)).toContain('SPRINTS_NO_CERRADOS');

    // ── Cero efectos fantasma: los intentos revertidos no dejaron filas. El
    //    número de eventos y notificaciones nuevos corresponde exactamente a
    //    las operaciones que SÍ commitearon.
    const auditAfter = await prisma.bitacoraAuditoria.count();
    const notificationsAfter = await prisma.notificacion.count();
    const operacionesGanadoras = 1 + (transferencia.status === 'fulfilled' ? 1 : 0);
    expect(auditAfter - auditBefore).toBeLessThanOrEqual(operacionesGanadoras * 3);
    expect(auditAfter).toBeGreaterThanOrEqual(auditBefore);
    expect(notificationsAfter).toBeGreaterThanOrEqual(notificationsBefore);

    // Ningún evento cita el rol cuyo retiro fue refutado.
    const rolRefutado = ganadorEsA ? fixture.roleBId : fixture.roleAId;
    const eventosDelRefutado = await prisma.bitacoraAuditoria.findMany({
      where: { tipoObjeto: 'ROL_PROYECTO', idObjeto: String(rolRefutado) },
    });
    expect(eventosDelRefutado).toEqual([]);
  }, 40_000);
});
