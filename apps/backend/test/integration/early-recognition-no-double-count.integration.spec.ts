import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';
import {
  createIntegrationParticipation,
  createIntegrationProject,
  createIntegrationProjectRole,
  createIntegrationSprint,
  createIntegrationTask,
  createIntegrationUser,
} from './setup/fixtures';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ExitRequestsAuthorizationService } from '../../src/exit-requests/exit-requests.authorization.service';
import { ExitRequestsContextService } from '../../src/exit-requests/exit-requests.context.service';
import { ExitRequestsService } from '../../src/exit-requests/exit-requests.service';
import { HoursRecognitionService } from '../../src/sprints/hours-recognition.service';
import { SprintsContextService } from '../../src/sprints/sprints-context.service';
import { SprintsAuthorizationService } from '../../src/sprints/sprints-authorization.service';
import { SprintsService } from '../../src/sprints/sprints.service';
import { TasksAuthorizationService } from '../../src/tasks/tasks-authorization.service';
import { TasksContextService } from '../../src/tasks/tasks-context.service';
import { TasksRelationsService } from '../../src/tasks/tasks-relations.service';
import { TasksService } from '../../src/tasks/tasks.service';

/**
 * X1 — regresión cross-flow: reconocimiento anticipado de horas (B10) al
 * aprobar una solicitud de salida, seguido del cierre real del Sprint (A9),
 * NO debe duplicar las horas ya reconocidas anticipadamente. Recorre el
 * flujo real de principio a fin (B1/B2 cierre de tramo, B5-B9 PREPARACION ->
 * PENDIENTE_LIDER -> APROBADA, A4 ACTIVO -> EN_FINALIZACION, A9
 * EN_FINALIZACION -> CERRADO, A8 SprintClosingSummary) contra PostgreSQL
 * real — ningún mock de Prisma, ninguna fila insertada saltándose el
 * comportamiento real de las transiciones.
 */

function makeTasksService(prisma: PrismaClient): TasksService {
  const prismaService = prisma as unknown as PrismaService;
  const tasksContext = new TasksContextService(prismaService);
  // X1.1: TasksAuthorizationService y TasksRelationsService REALES (no
  // mockeados) — el punto de X1 es exercitar el camino real de
  // TasksService.assign(), incluida la resolución real de
  // AsignacionTarea.idParticipacion vía assertUserAssignableToProject
  // (X1.1), no un fixture de Prisma directo que se salte esa lógica.
  return new TasksService(
    prismaService,
    new TasksAuthorizationService(tasksContext),
    new TasksRelationsService(prismaService, tasksContext),
    { notifyFromTemplate: vi.fn() } as unknown as NotificationsService,
    tasksContext,
  );
}

function makeExitRequestsService(prisma: PrismaClient): ExitRequestsService {
  const prismaService = prisma as unknown as PrismaService;
  const context = new ExitRequestsContextService(prismaService);
  return new ExitRequestsService(
    prismaService,
    { notifyFromTemplate: vi.fn() } as unknown as NotificationsService,
    new ExitRequestsAuthorizationService(context),
    context,
    new HoursRecognitionService(prismaService),
    new SprintsContextService(prismaService),
  );
}

function makeSprintsService(prisma: PrismaClient): SprintsService {
  const prismaService = prisma as unknown as PrismaService;
  const context = new SprintsContextService(prismaService);
  const authorization = new SprintsAuthorizationService(context);
  const notifications = {
    notifyProjectActiveParticipants: async () => undefined,
    notifySprintFinalizationStarted: async () => undefined,
    notifySprintClosed: async () => undefined,
  } as unknown as NotificationsService;
  return new SprintsService(prismaService, context, authorization, notifications);
}

function longProgressContent(label: string): string {
  return `${label} ${'avance verificado contra PostgreSQL real '.repeat(7)}`;
}

describeIntegration(
  'X1 regresión cross-flow: reconocimiento anticipado (B10) + cierre de Sprint (A9) sin doble conteo',
  () => {
    let prisma: PrismaClient;
    let tasksService: TasksService;
    let exitRequestsService: ExitRequestsService;
    let sprintsService: SprintsService;
    let scope: IntegrationCleanupScope;
    let solicitudIds: number[];
    let horasParticipacionIds: number[];

    beforeAll(async () => {
      prisma = createIntegrationPrismaClient();
      tasksService = makeTasksService(prisma);
      exitRequestsService = makeExitRequestsService(prisma);
      sprintsService = makeSprintsService(prisma);
      await prisma.$connect();
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    beforeEach(() => {
      scope = {};
      solicitudIds = [];
      horasParticipacionIds = [];
    });

    afterEach(async () => {
      const assignmentIds = scope.assignmentIds ?? [];
      if (assignmentIds.length > 0) {
        await prisma.registroAvanceAsignacion.deleteMany({
          where: { idAsignacion: { in: assignmentIds } },
        });
      }
      if (horasParticipacionIds.length > 0) {
        await prisma.horasParticipacion.deleteMany({
          where: { idRegistroHoras: { in: horasParticipacionIds } },
        });
      }
      if (solicitudIds.length > 0) {
        await prisma.solicitudSalidaProyecto.deleteMany({
          where: { idSolicitud: { in: solicitudIds } },
        });
      }
      await cleanupIntegrationFixtures(prisma, scope);
    });

    it('un tramo cerrado durante PREPARACION, reconocido anticipadamente al aprobar la salida, se cuenta exactamente una vez en el SprintClosingSummary tras cerrar el Sprint', async () => {
      const HORAS_REALES = 3;

      // Fase A — proyecto, líder, colaborador, participación activa, Sprint
      // ACTIVO, tarea del Sprint, tramo activo asignado al colaborador.
      const leader = await createIntegrationUser(prisma);
      const member = await createIntegrationUser(prisma);
      scope.userIds = [leader.idUsuario, member.idUsuario];

      const project = await createIntegrationProject(prisma, leader.idUsuario);
      scope.projectIds = [project.idProyecto];

      const role = await createIntegrationProjectRole(prisma, project.idProyecto, {
        nombreRol: 'X1 Colaborador',
      });
      scope.roleIds = [role.idRolProyecto];

      const participation = await createIntegrationParticipation(prisma, member.idUsuario, role.idRolProyecto, {
        estadoParticipacion: 'ACTIVO',
      });
      scope.participationIds = [participation.idParticipacion];

      const sprint = await createIntegrationSprint(prisma, project.idProyecto, { estado: 'ACTIVO' });
      scope.sprintIds = [sprint.idSprint];

      const task = await createIntegrationTask(prisma, project.idProyecto, leader.idUsuario, sprint.idSprint, {
        tituloTarea: 'X1 tarea única del Sprint',
      });
      scope.taskIds = [task.idTarea];

      // X1.1: la asignación se crea mediante el flujo real de dominio
      // (TasksService.assign, B... — la misma transición que usaría un
      // líder real desde la UI), no un fixture de Prisma directo: es
      // precisamente esta vía la que debe persistir
      // AsignacionTarea.idParticipacion (X1.1) para que B10 pueda
      // reconocer el tramo más adelante.
      await tasksService.assign(project.idProyecto, task.idTarea, leader.idUsuario, {
        idUsuario: member.idUsuario,
      });
      const assignment = await prisma.asignacionTarea.findFirstOrThrow({
        where: { idTarea: task.idTarea, idUsuario: member.idUsuario, desasignadaEn: null },
      });
      scope.assignmentIds = [assignment.idAsignacion];

      expect(assignment.idParticipacion).toBe(participation.idParticipacion);

      // Fase B — el colaborador inicia la solicitud de salida real (B5):
      // debe quedar en PREPARACION.
      const solicitud = await exitRequestsService.createSolicitudSalida(
        project.idProyecto,
        member.idUsuario,
        'X1: salida real para regresión cross-flow de reconocimiento anticipado',
      );
      solicitudIds = [solicitud.idSolicitud];
      expect(solicitud.estadoSolicitud).toBe('PREPARACION');

      // Fase C — durante PREPARACION, el colaborador cierra su único tramo
      // (B2/B1) con horas inequívocas y marca la tarea como HECHO, para que
      // el Sprint pueda finalizar más adelante sin más blockers.
      await tasksService.closeAssignment(project.idProyecto, task.idTarea, assignment.idAsignacion, member.idUsuario, {
        horasReales: HORAS_REALES,
        contenidoAvance: longProgressContent('X1 cierre de tramo en PREPARACION'),
        marcarComoHecha: true,
      });

      const asignacionTrasCierre = await prisma.asignacionTarea.findUniqueOrThrow({
        where: { idAsignacion: assignment.idAsignacion },
        select: { desasignadaEn: true, horasReales: true, reconocidoEn: true },
      });
      expect(asignacionTrasCierre.desasignadaEn).not.toBeNull();
      expect(Number(asignacionTrasCierre.horasReales)).toBe(HORAS_REALES);
      expect(asignacionTrasCierre.reconocidoEn).toBeNull();

      // Fase D — PREPARACION -> PENDIENTE_LIDER (B6/B7), vía el flujo real.
      const enPendienteLider = await exitRequestsService.continueExitPreparation(
        project.idProyecto,
        member.idUsuario,
      );
      expect(enPendienteLider.estadoSolicitud).toBe('PENDIENTE_LIDER');

      const solicitudTrasContinuar = await prisma.solicitudSalidaProyecto.findUniqueOrThrow({
        where: { idSolicitud: solicitud.idSolicitud },
        select: { estadoSolicitud: true },
      });
      expect(solicitudTrasContinuar.estadoSolicitud).toBe('PENDIENTE_LIDER');

      // Fase E (B10) — el líder aprueba la salida: PENDIENTE_LIDER ->
      // APROBADA, con reconocimiento anticipado real de horas.
      const aprobada = await exitRequestsService.approveSolicitudSalida(
        project.idProyecto,
        solicitud.idSolicitud,
        leader.idUsuario,
      );
      expect(aprobada.estadoSolicitud).toBe('APROBADA');

      const participacionTrasAprobar = await prisma.participacionProyecto.findUniqueOrThrow({
        where: { idParticipacion: participation.idParticipacion },
        select: { estadoParticipacion: true },
      });
      expect(participacionTrasAprobar.estadoParticipacion).toBe('RETIRADO');

      const asignacionTrasAprobar = await prisma.asignacionTarea.findUniqueOrThrow({
        where: { idAsignacion: assignment.idAsignacion },
        select: { reconocidoEn: true, horasReales: true },
      });
      // Evidencia persistida de idempotencia (A5/A6): el tramo queda marcado
      // como ya reconocido — este es el mecanismo que debe impedir que el
      // cierre del Sprint lo vuelva a sumar.
      expect(asignacionTrasAprobar.reconocidoEn).not.toBeNull();
      expect(Number(asignacionTrasAprobar.horasReales)).toBe(HORAS_REALES);

      const horasParticipacionTrasAprobar = await prisma.horasParticipacion.findFirstOrThrow({
        where: { idParticipacion: participation.idParticipacion, idSprint: sprint.idSprint },
      });
      horasParticipacionIds = [horasParticipacionTrasAprobar.idRegistroHoras];
      const totalTrasAprobar = Number(horasParticipacionTrasAprobar.horasCalculadas);
      expect(totalTrasAprobar).toBe(HORAS_REALES);

      // Fase F — el Sprint sigue su flujo normal: ACTIVO -> EN_FINALIZACION
      // (A4, único vía real de transición). La única tarea del Sprint ya
      // quedó HECHO en la Fase C, así que no hay más blockers.
      const enFinalizacion = await sprintsService.finalizeSprint(project.idProyecto, sprint.idSprint, leader.idUsuario);
      expect(enFinalizacion.estado).toBe('EN_FINALIZACION');

      // Fase G — SprintClosingSummary ANTES del cierre final: el total debe
      // seguir siendo exactamente HORAS_REALES, nunca el doble.
      const resumenAntesDeCerrar = await sprintsService.getSprintClosingSummary(
        project.idProyecto,
        sprint.idSprint,
        leader.idUsuario,
      );
      const entradaAntesDeCerrar = resumenAntesDeCerrar.participantes.find(
        (p) => p.idUsuario === member.idUsuario,
      );
      expect(entradaAntesDeCerrar).toBeDefined();
      expect(entradaAntesDeCerrar!.horasCalculadas).toBe(HORAS_REALES);
      expect(entradaAntesDeCerrar!.horasCalculadas).not.toBe(HORAS_REALES * 2);

      // Fase H (A9) — EN_FINALIZACION -> CERRADO, único flujo real de cierre.
      const cerrado = await sprintsService.closeSprint(project.idProyecto, sprint.idSprint, leader.idUsuario);
      expect(cerrado.estado).toBe('CERRADO');
      expect(cerrado.fechaCierre).not.toBeNull();
      expect(cerrado.cerradoPor).toBe(leader.idUsuario);

      const sprintFinal = await prisma.sprint.findUniqueOrThrow({
        where: { idSprint: sprint.idSprint },
        select: { estado: true, fechaCierre: true, cerradoPor: true },
      });
      expect(sprintFinal.estado).toBe('CERRADO');
      expect(sprintFinal.fechaCierre).not.toBeNull();
      expect(sprintFinal.cerradoPor).toBe(leader.idUsuario);

      // Fase I — SprintClosingSummary DESPUÉS del cierre: la aserción crítica
      // de X1. El total exacto debe mantenerse; NUNCA duplicarse a 2N.
      const resumenTrasCerrar = await sprintsService.getSprintClosingSummary(
        project.idProyecto,
        sprint.idSprint,
        leader.idUsuario,
      );
      const entradaTrasCerrar = resumenTrasCerrar.participantes.find((p) => p.idUsuario === member.idUsuario);
      expect(entradaTrasCerrar).toBeDefined();
      expect(entradaTrasCerrar!.horasCalculadas).toBe(HORAS_REALES);
      expect(entradaTrasCerrar!.horasCalculadas).not.toBe(HORAS_REALES * 2);
      expect(entradaTrasCerrar!.horasCalculadas).toBe(entradaAntesDeCerrar!.horasCalculadas);

      // Fase J — evidencia persistida final de no-doble-conteo: sigue
      // existiendo exactamente UNA fila de HorasParticipacion para
      // (participación, Sprint) — A9 nunca toca HorasParticipacion ni
      // AsignacionTarea — y el tramo original sigue marcado como reconocido,
      // con sus horas reales intactas.
      const filasHorasParticipacionFinal = await prisma.horasParticipacion.findMany({
        where: { idParticipacion: participation.idParticipacion, idSprint: sprint.idSprint },
      });
      expect(filasHorasParticipacionFinal).toHaveLength(1);
      expect(Number(filasHorasParticipacionFinal[0].horasCalculadas)).toBe(HORAS_REALES);

      const asignacionFinal = await prisma.asignacionTarea.findUniqueOrThrow({
        where: { idAsignacion: assignment.idAsignacion },
        select: { reconocidoEn: true, horasReales: true, desasignadaEn: true },
      });
      expect(asignacionFinal.reconocidoEn).not.toBeNull();
      expect(asignacionFinal.reconocidoEn).toEqual(asignacionTrasAprobar.reconocidoEn);
      expect(Number(asignacionFinal.horasReales)).toBe(HORAS_REALES);
      expect(asignacionFinal.desasignadaEn).not.toBeNull();
    });
  },
);
