import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { ConflictException, type ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Prioridad, type PrismaClient } from '@prisma/client';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import {
  createIntegrationParticipation,
  createIntegrationProject,
  createIntegrationProjectRole,
  createIntegrationSprint,
  createIntegrationUser,
} from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';
import { FINALIZING_SPRINT_MESSAGE, ProjectWriteGuard } from '../../src/common/guards/project-write.guard';
import { PrismaService } from '../../src/prisma/prisma.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { SprintsContextService } from '../../src/sprints/sprints-context.service';
import { SprintsAuthorizationService } from '../../src/sprints/sprints-authorization.service';
import { SprintsService } from '../../src/sprints/sprints.service';
import { ExitRequestsAuthorizationService } from '../../src/exit-requests/exit-requests.authorization.service';
import { ExitRequestsContextService } from '../../src/exit-requests/exit-requests.context.service';
import { ExitRequestsController } from '../../src/exit-requests/exit-requests.controller';
import { ExitRequestsService } from '../../src/exit-requests/exit-requests.service';
import { ProgressRecordsController } from '../../src/progress-records/progress-records.controller';
import { ProgressRecordsService } from '../../src/progress-records/progress-records.service';
import { TasksAuthorizationService } from '../../src/tasks/tasks-authorization.service';
import { TasksContextService } from '../../src/tasks/tasks-context.service';
import { TasksController } from '../../src/tasks/tasks.controller';
import { TasksRelationsService } from '../../src/tasks/tasks-relations.service';
import { TasksService } from '../../src/tasks/tasks.service';

/**
 * X3 (Escenario A) — regresión cross-flow: ciclo de vida COMPLETO de un
 * Sprint contra PostgreSQL real.
 *
 *   ACTIVO (trabajo normal permitido: crear tarea, asignar, cerrar tramo,
 *   A12 sincroniza Hito.estadoHito)
 *   -> finalizeSprint real -> EN_FINALIZACION (A4)
 *   -> bloqueo cruzado real del ProjectWriteGuard (B15/A3) en las TRES
 *      categorías: tareas, asignaciones/progreso, exit-requests — cada
 *      checkpoint atraviesa la metadata GUARDS_METADATA real del handler y
 *      ejecuta el guard real, nunca una llamada directa al service que se
 *      saltaría el guard
 *   -> revisión real de horas (A7 adjustRecognizedHours) + SprintClosingSummary
 *      real (A8)
 *   -> closeSprint real -> CERRADO (A9), inmutable ante una segunda
 *      transición
 *   -> histórico real accesible (A10: listSprints + getSprintDetail),
 *      incluyendo el progreso de Hito persistido (A12)
 *
 * Mismo patrón de guard ya validado por project-write-guard.integration.spec.ts
 * y project-write-guard-exit-requests.integration.spec.ts: GUARDS_METADATA +
 * guard.canActivate real + invocación del controller real — nunca una
 * llamada de service que se salte el guard.
 */

function makeFakeNotifications(): NotificationsService {
  return {
    notifyFromTemplate: async () => undefined,
    notifyUsers: async () => undefined,
    notifyRoleMembers: async () => undefined,
    notifyProjectActiveParticipants: async () => undefined,
    notifySprintFinalizationStarted: async () => undefined,
    notifySprintClosed: async () => undefined,
  } as unknown as NotificationsService;
}

function fakeExecutionContext(params: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ params }) }),
  } as unknown as ExecutionContext;
}

function guardsOf(controller: object, handlerName: string): unknown[] {
  // Los métodos de un prototipo de clase son funciones (subtipo de
  // `object`), nunca `unknown`: tipar `prototype` como
  // `Record<string, object>` refleja exactamente lo que hay ahí y
  // satisface la firma real de `Reflect.getMetadata(key, target: Object)`
  // sin recurrir a `any`/`as any` ni a un cast puntual sobre `handler`.
  const prototype = Object.getPrototypeOf(controller) as Record<string, object>;
  const handler = prototype[handlerName];
  return Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];
}

function longProgressContent(label: string): string {
  return `${label} ${'avance verificado contra PostgreSQL real '.repeat(7)}`;
}

type X3CleanupScope = IntegrationCleanupScope & {
  hitoIds?: number[];
  progressRecordIds?: number[];
  exitRequestIds?: number[];
  horasParticipacionIds?: number[];
};

describeIntegration(
  'X3 (Escenario A) — ciclo de vida completo del Sprint: ACTIVO -> EN_FINALIZACION (bloqueo cruzado real) -> CERRADO -> histórico',
  () => {
    let prisma: PrismaClient;
    let guard: ProjectWriteGuard;
    let tasksController: TasksController;
    let progressController: ProgressRecordsController;
    let exitController: ExitRequestsController;
    let sprintsService: SprintsService;
    let scope: X3CleanupScope;

    beforeAll(async () => {
      prisma = createIntegrationPrismaClient();
      await prisma.$connect();
      const prismaService = prisma as unknown as PrismaService;
      const notifications = makeFakeNotifications();

      const sprintsContext = new SprintsContextService(prismaService);
      guard = new ProjectWriteGuard(sprintsContext);

      const tasksContext = new TasksContextService(prismaService);
      const tasksAuthorization = new TasksAuthorizationService(tasksContext);
      const tasksRelations = new TasksRelationsService(prismaService, tasksContext);
      const tasksService = new TasksService(
        prismaService,
        tasksAuthorization,
        tasksRelations,
        notifications,
        tasksContext,
      );
      tasksController = new TasksController(tasksService);

      const progressService = new ProgressRecordsService(prismaService, tasksContext);
      progressController = new ProgressRecordsController(progressService);

      const exitContext = new ExitRequestsContextService(prismaService);
      const exitAuthorization = new ExitRequestsAuthorizationService(exitContext);
      const exitService = new ExitRequestsService(prismaService, notifications, exitAuthorization, exitContext);
      exitController = new ExitRequestsController(exitService);

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
      if (scope.progressRecordIds?.length) {
        await prisma.registroAvanceAsignacion.deleteMany({
          where: { idRegistroAvance: { in: scope.progressRecordIds } },
        });
      }
      const assignmentIds = scope.assignmentIds ?? [];
      if (assignmentIds.length > 0) {
        await prisma.registroAvanceAsignacion.deleteMany({ where: { idAsignacion: { in: assignmentIds } } });
      }
      if (scope.horasParticipacionIds?.length) {
        await prisma.horasParticipacion.deleteMany({
          where: { idRegistroHoras: { in: scope.horasParticipacionIds } },
        });
      }
      if (scope.exitRequestIds?.length) {
        await prisma.solicitudSalidaProyecto.deleteMany({ where: { idSolicitud: { in: scope.exitRequestIds } } });
      }
      // Hito no forma parte de IntegrationCleanupScope (T15): Tarea ->
      // Hito y Hito -> Proyecto son ambas FK RESTRICT, así que el orden
      // FK-safe exige borrar primero AsignacionTarea, luego Tarea, luego
      // Hito, ANTES de que cleanupIntegrationFixtures llegue a projectIds.
      // Se replica aquí el mismo orden que cleanupIntegrationFixtures ya
      // usa para esos dos primeros pasos (nunca se modifica cleanup.ts);
      // los `deleteMany` redundantes que ese helper repite después sobre
      // los mismos IDs ya borrados son no-ops seguros (count: 0).
      if (assignmentIds.length > 0) {
        await prisma.asignacionTarea.deleteMany({ where: { idAsignacion: { in: assignmentIds } } });
      }
      const taskIds = scope.taskIds ?? [];
      if (taskIds.length > 0) {
        await prisma.tarea.deleteMany({ where: { idTarea: { in: taskIds } } });
      }
      if (scope.hitoIds?.length) {
        await prisma.hito.deleteMany({ where: { idHito: { in: scope.hitoIds } } });
      }
      await cleanupIntegrationFixtures(prisma, scope);
    });

    async function runThroughRealGuard<T>(
      controller: object,
      handlerName: string,
      projectId: number,
      action: () => Promise<T>,
    ): Promise<T> {
      expect(guardsOf(controller, handlerName)).toContain(ProjectWriteGuard);
      await guard.canActivate(fakeExecutionContext({ projectId: String(projectId) }));
      return action();
    }

    it('ACTIVO permite trabajo normal (A12 sincroniza Hito) -> EN_FINALIZACION bloquea tareas + progreso + exit-requests -> revisión de horas real -> CERRADO -> histórico accesible', async () => {
      const HORAS_REALES = 3;

      // --- A. Arrange: proyecto, líder, colaborador, Sprint ACTIVO, Hito ---
      const leader = await createIntegrationUser(prisma);
      const collaborator = await createIntegrationUser(prisma);
      scope.userIds = [leader.idUsuario, collaborator.idUsuario];

      const project = await createIntegrationProject(prisma, leader.idUsuario);
      scope.projectIds = [project.idProyecto];

      const role = await createIntegrationProjectRole(prisma, project.idProyecto, { nombreRol: 'X3 Rol' });
      scope.roleIds = [role.idRolProyecto];

      const participation = await createIntegrationParticipation(prisma, collaborator.idUsuario, role.idRolProyecto, {
        estadoParticipacion: 'ACTIVO',
      });
      scope.participationIds = [participation.idParticipacion];

      const sprint = await createIntegrationSprint(prisma, project.idProyecto, { estado: 'ACTIVO' });
      scope.sprintIds = [sprint.idSprint];

      const hito = await prisma.hito.create({
        data: { idProyecto: project.idProyecto, tituloHito: 'X3 Hito único', orden: 1 },
      });
      scope.hitoIds = [hito.idHito];
      expect(hito.estadoHito).toBe('PENDIENTE');

      // --- B. ACTIVO: trabajo normal real, a través del guard real ---
      const taskDto = {
        tituloTarea: 'X3 tarea del Hito',
        fechaLimite: '2099-01-01',
        prioridad: Prioridad.MEDIA,
        idHito: hito.idHito,
        idRolProyecto: role.idRolProyecto,
      };

      const tareaCreada = await runThroughRealGuard(tasksController, 'create', project.idProyecto, () =>
        tasksController.create(project.idProyecto, { userId: leader.idUsuario }, taskDto),
      );
      const taskId = tareaCreada.idTarea;
      scope.taskIds = [taskId];

      await runThroughRealGuard(tasksController, 'assign', project.idProyecto, () =>
        tasksController.assign(
          project.idProyecto,
          taskId,
          { userId: leader.idUsuario },
          { idUsuario: collaborator.idUsuario },
        ),
      );

      const asignacion = await prisma.asignacionTarea.findFirstOrThrow({
        where: { idTarea: taskId, idUsuario: collaborator.idUsuario, desasignadaEn: null },
      });
      scope.assignmentIds = [asignacion.idAsignacion];
      // X1.1: idParticipacion correctamente resuelto por el flujo real de assign().
      expect(asignacion.idParticipacion).toBe(participation.idParticipacion);

      // --- C. Cierre real del tramo (A12: marcarComoHecha sincroniza el Hito) ---
      await runThroughRealGuard(tasksController, 'closeAssignment', project.idProyecto, () =>
        tasksController.closeAssignment(
          project.idProyecto,
          taskId,
          { assignmentId: String(asignacion.idAsignacion) },
          { userId: collaborator.idUsuario },
          {
            horasReales: HORAS_REALES,
            contenidoAvance: longProgressContent('X3 cierre de tramo en ACTIVO'),
            marcarComoHecha: true,
          },
        ),
      );

      const tareaCerrada = await prisma.tarea.findUniqueOrThrow({
        where: { idTarea: taskId },
        select: { estadoTarea: true },
      });
      expect(tareaCerrada.estadoTarea).toBe('HECHO');

      const hitoTrasCierre = await prisma.hito.findUniqueOrThrow({ where: { idHito: hito.idHito } });
      expect(hitoTrasCierre.estadoHito).toBe('COMPLETADO');

      const tareasPendientes = await prisma.tarea.count({
        where: { idProyecto: project.idProyecto, idSprint: sprint.idSprint, estadoTarea: { not: 'HECHO' } },
      });
      expect(tareasPendientes).toBe(0);

      // Positivo reutilizable (Sección 15/16): registrar avance adicional
      // sobre el mismo tramo, todavía en ACTIVO, funciona a través del
      // guard real — checkpoint que luego se repite bloqueado en EN_FINALIZACION.
      const avanceEnActivo = await runThroughRealGuard(progressController, 'create', project.idProyecto, () =>
        progressController.create(
          project.idProyecto,
          taskId,
          asignacion.idAsignacion,
          { userId: collaborator.idUsuario },
          { contenido: longProgressContent('X3 avance adicional en ACTIVO') },
        ),
      );
      scope.progressRecordIds = [avanceEnActivo.idRegistroAvance];

      // Solicitud de salida creada MIENTRAS el Sprint está ACTIVO — el
      // colaborador ya no tiene tramos activos, así que quedará en
      // PREPARACION lista para intentar continuarla más adelante, cuando el
      // rechazo solo pueda deberse al guard (Sección 17).
      const solicitud = await runThroughRealGuard(exitController, 'createExitRequest', project.idProyecto, () =>
        exitController.createExitRequest(
          project.idProyecto,
          { motivo: 'X3: checkpoint de bloqueo de exit-requests durante EN_FINALIZACION' },
          { userId: collaborator.idUsuario },
        ),
      );
      scope.exitRequestIds = [solicitud.idSolicitud];
      expect(solicitud.estadoSolicitud).toBe('PREPARACION');

      // --- D. A4: ACTIVO -> EN_FINALIZACION (todas las tareas del Sprint HECHO) ---
      const enFinalizacion = await sprintsService.finalizeSprint(project.idProyecto, sprint.idSprint, leader.idUsuario);
      expect(enFinalizacion.estado).toBe('EN_FINALIZACION');
      expect(enFinalizacion.fechaFinalizacionIniciada).not.toBeNull();

      // --- E. Bloqueo cruzado real (B15/A3) — TRES categorías ---

      // E.1 — tareas: editar la tarea ya HECHO.
      let taskRejection: unknown;
      try {
        await runThroughRealGuard(tasksController, 'update', project.idProyecto, () =>
          tasksController.update(
            project.idProyecto,
            taskId,
            { userId: leader.idUsuario },
            { tituloTarea: 'Editado durante EN_FINALIZACION' },
          ),
        );
      } catch (error) {
        taskRejection = error;
      }
      expect(taskRejection).toBeInstanceOf(ConflictException);
      expect((taskRejection as ConflictException).message).toBe(FINALIZING_SPRINT_MESSAGE);
      const tareaSinCambios = await prisma.tarea.findUniqueOrThrow({
        where: { idTarea: taskId },
        select: { tituloTarea: true },
      });
      expect(tareaSinCambios.tituloTarea).toBe('X3 tarea del Hito');

      // E.2 — asignaciones/progress: nuevo registro de avance sobre el mismo tramo.
      let progressRejection: unknown;
      try {
        await runThroughRealGuard(progressController, 'create', project.idProyecto, () =>
          progressController.create(
            project.idProyecto,
            taskId,
            asignacion.idAsignacion,
            { userId: collaborator.idUsuario },
            { contenido: longProgressContent('X3 avance rechazado en EN_FINALIZACION') },
          ),
        );
      } catch (error) {
        progressRejection = error;
      }
      expect(progressRejection).toBeInstanceOf(ConflictException);
      expect((progressRejection as ConflictException).message).toBe(FINALIZING_SPRINT_MESSAGE);
      const conteoAvanceTrasRechazo = await prisma.registroAvanceAsignacion.count({
        where: { idAsignacion: asignacion.idAsignacion },
      });
      // Exactamente 2: el cierre del tramo (C) + el avance adicional en ACTIVO — ninguno nuevo.
      expect(conteoAvanceTrasRechazo).toBe(2);

      // E.3 — exit-requests: continuar una solicitud que YA no tiene
      // blockers propios (el tramo del colaborador está cerrado) — el
      // único motivo posible de rechazo es el guard, no una precondición
      // de B7.
      const blockersPropios = await prisma.asignacionTarea.findFirst({
        where: { idUsuario: collaborator.idUsuario, desasignadaEn: null, tarea: { idProyecto: project.idProyecto } },
      });
      expect(blockersPropios).toBeNull();

      let exitRejection: unknown;
      try {
        await runThroughRealGuard(exitController, 'continueExitPreparation', project.idProyecto, () =>
          exitController.continueExitPreparation(project.idProyecto, { userId: collaborator.idUsuario }),
        );
      } catch (error) {
        exitRejection = error;
      }
      expect(exitRejection).toBeInstanceOf(ConflictException);
      expect((exitRejection as ConflictException).message).toBe(FINALIZING_SPRINT_MESSAGE);
      const solicitudSinCambios = await prisma.solicitudSalidaProyecto.findUniqueOrThrow({
        where: { idSolicitud: solicitud.idSolicitud },
        select: { estadoSolicitud: true },
      });
      expect(solicitudSinCambios.estadoSolicitud).toBe('PREPARACION');

      // --- F. Revisión real de horas (A7) + SprintClosingSummary (A8) ---
      // Ninguna operación productiva actual crea HorasParticipacion fuera
      // de B10 (reconocimiento anticipado en aprobación de salida): para
      // ejercitar A7/A8 en el flujo NORMAL de cierre de Sprint (sin exit
      // de por medio) se siembra directamente el registro "ya calculado"
      // pendiente de aprobación — mismo patrón ya usado por
      // sprint-closing-summary.integration.spec.ts (createHorasParticipacion).
      const horasCalculadas = await prisma.horasParticipacion.create({
        data: {
          idParticipacion: participation.idParticipacion,
          idSprint: sprint.idSprint,
          periodoInicio: new Date('2026-01-01'),
          periodoFin: new Date('2026-01-31'),
          horasReportadas: HORAS_REALES,
          horasCalculadas: HORAS_REALES,
        },
      });
      scope.horasParticipacionIds = [horasCalculadas.idRegistroHoras];

      const ajustada = await sprintsService.adjustRecognizedHours(
        project.idProyecto,
        sprint.idSprint,
        participation.idParticipacion,
        leader.idUsuario,
        { horasAprobadas: HORAS_REALES },
      );
      expect(Number(ajustada.horasAprobadas)).toBe(HORAS_REALES);

      const resumen = await sprintsService.getSprintClosingSummary(
        project.idProyecto,
        sprint.idSprint,
        leader.idUsuario,
      );
      const entradaColaborador = resumen.participantes.find((p) => p.idUsuario === collaborator.idUsuario);
      expect(entradaColaborador).toBeDefined();
      expect(entradaColaborador!.horasReportadas).toBe(HORAS_REALES);
      expect(entradaColaborador!.horasCalculadas).toBe(HORAS_REALES);
      expect(entradaColaborador!.horasAprobadas).toBe(HORAS_REALES);

      // --- G. A9: EN_FINALIZACION -> CERRADO ---
      const cerrado = await sprintsService.closeSprint(project.idProyecto, sprint.idSprint, leader.idUsuario);
      expect(cerrado.estado).toBe('CERRADO');
      expect(cerrado.fechaCierre).not.toBeNull();
      expect(cerrado.cerradoPor).toBe(leader.idUsuario);

      // Inmutabilidad post-cierre: un segundo cierre no reabre ni reescribe.
      await expect(
        sprintsService.closeSprint(project.idProyecto, sprint.idSprint, leader.idUsuario),
      ).rejects.toBeInstanceOf(ConflictException);
      const sprintTrasSegundoIntento = await prisma.sprint.findUniqueOrThrow({
        where: { idSprint: sprint.idSprint },
        select: { estado: true, fechaCierre: true },
      });
      expect(sprintTrasSegundoIntento.estado).toBe('CERRADO');
      expect(sprintTrasSegundoIntento.fechaCierre).toEqual(cerrado.fechaCierre);

      // --- H. A10: histórico accesible tras CERRADO, incluyendo A12 ---
      const listado = await sprintsService.listSprints(project.idProyecto, leader.idUsuario);
      const entradaListado = listado.find((s) => s.idSprint === sprint.idSprint);
      expect(entradaListado).toBeDefined();
      expect(entradaListado!.estado).toBe('CERRADO');

      const detalle = await sprintsService.getSprintDetail(project.idProyecto, sprint.idSprint, leader.idUsuario);
      expect(detalle.estado).toBe('CERRADO');
      expect(detalle.cerradoPor).toBe(leader.idUsuario);

      const tareaHistorica = detalle.tareas.find((t) => t.idTarea === taskId);
      expect(tareaHistorica).toBeDefined();
      expect(tareaHistorica!.estadoTarea).toBe('HECHO');
      expect(tareaHistorica!.asignaciones).toHaveLength(1);
      expect(tareaHistorica!.asignaciones[0].idAsignacion).toBe(asignacion.idAsignacion);
      expect(tareaHistorica!.asignaciones[0].horasReales).toBe(HORAS_REALES);

      const hitoHistorico = detalle.hitos.find((h) => h.idHito === hito.idHito);
      expect(hitoHistorico).toBeDefined();
      expect(hitoHistorico!.estadoHito).toBe('COMPLETADO');
      expect(hitoHistorico!.porcentaje).toBe(100);
    });
  },
);
