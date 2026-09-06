import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { ConflictException, type ExecutionContext } from '@nestjs/common';
import { Prioridad, type PrismaClient } from '@prisma/client';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
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
import { ProjectWriteGuard } from '../../src/common/guards/project-write.guard';
import { ProjectIdResolverService } from '../../src/common/project-policy/project-id-resolver.service';
import { ProjectPolicyService } from '../../src/common/project-policy/project-policy.service';
import { ProjectReadPolicyService } from '../../src/common/project-policy/project-read-policy.service';
import { ProjectTransactionService } from '../../src/common/project-policy/project-transaction.service';
import { TasksController } from '../../src/tasks/tasks.controller';
import { TasksService } from '../../src/tasks/tasks.service';
import { TasksContextService } from '../../src/tasks/tasks-context.service';
import { TasksAuthorizationService } from '../../src/tasks/tasks-authorization.service';
import { TasksRelationsService } from '../../src/tasks/tasks-relations.service';
import { ProgressRecordsController } from '../../src/progress-records/progress-records.controller';
import { ProgressRecordsService } from '../../src/progress-records/progress-records.service';
import { TimeRecordsController } from '../../src/time-records/time-records.controller';
import { TimeRecordsService } from '../../src/time-records/time-records.service';
import { TaskLabelsController } from '../../src/labels/task-labels.controller';
import { LabelsService } from '../../src/labels/labels.service';
import { TareaComentariosController } from '../../src/tasks/tarea-comentarios.controller';
import { ComentariosService } from '../../src/comentarios/comentarios.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import type { NotificationsService } from '../../src/notifications/notifications.service';

/**
 * T34 (06 v2 §32/§47): el Sprint ambiente no es una llave universal. Con un
 * Sprint operable vigente, el guard de ruta aprueba el ambiente; lo que
 * protege las filas de un Sprint anterior ya cerrado es el assert de ENTIDAD
 * que el service ejecuta después del lock. Cada caso corre el guard real
 * sobre la metadata real del handler y, si autoriza, el método real del
 * controller contra PostgreSQL real.
 */
function makeFakeNotifications() {
  return {
    notifyFromTemplate: async () => undefined,
    notifyUsers: async () => undefined,
    notifyRoleMembers: async () => undefined,
    notifyProjectActiveParticipants: async () => undefined,
    notifyTaskHoursLogged: async () => undefined,
  } as unknown as NotificationsService;
}

function fakeExecutionContext(
  params: Record<string, unknown>,
  handler: object,
  controllerClass: object,
  body: Record<string, unknown> = {},
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ params, body }) }),
    getHandler: () => handler,
    getClass: () => controllerClass,
  } as unknown as ExecutionContext;
}

const CONTENIDO_AVANCE = 'Avance con contenido suficientemente largo para el mínimo. '.repeat(5);

describeIntegration('T34 — política de escritura por entidad contra PostgreSQL real (06 v2 §32)', () => {
  let prisma: PrismaClient;
  let tasksController: TasksController;
  let progressController: ProgressRecordsController;
  let timeRecordsController: TimeRecordsController;
  let taskLabelsController: TaskLabelsController;
  let tareaComentariosController: TareaComentariosController;
  let guard: ProjectWriteGuard;
  let scope: IntegrationCleanupScope;

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    await prisma.$connect();

    const prismaService = prisma as unknown as PrismaService;
    const projectTx = new ProjectTransactionService(prismaService);
    const resolver = new ProjectIdResolverService(prismaService);
    const policy = new ProjectPolicyService(resolver);
    const readPolicy = new ProjectReadPolicyService(prismaService);
    const tasksContext = new TasksContextService(prismaService);

    tasksController = new TasksController(
      new TasksService(
        prismaService,
        new TasksAuthorizationService(tasksContext),
        new TasksRelationsService(prismaService, tasksContext),
        makeFakeNotifications(),
        tasksContext,
        projectTx,
        policy,
        readPolicy,
      ),
    );
    progressController = new ProgressRecordsController(
      new ProgressRecordsService(prismaService, tasksContext, projectTx, policy),
    );
    timeRecordsController = new TimeRecordsController(
      new TimeRecordsService(
        prismaService,
        tasksContext,
        makeFakeNotifications(),
        projectTx,
        policy,
        readPolicy,
      ),
    );
    taskLabelsController = new TaskLabelsController(
      new LabelsService(prismaService, projectTx, policy),
    );
    tareaComentariosController = new TareaComentariosController(
      new ComentariosService(
        prismaService,
        makeFakeNotifications(),
        projectTx,
        policy,
        readPolicy,
      ),
    );
    guard = new ProjectWriteGuard(new Reflector(), resolver, policy, prismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    scope = {};
  });

  afterEach(async () => {
    if (scope.taskIds && scope.taskIds.length > 0) {
      await prisma.registroTiempoTarea.deleteMany({
        where: { asignacion: { idTarea: { in: scope.taskIds } } },
      });
      await prisma.registroAvanceAsignacion.deleteMany({
        where: { asignacion: { idTarea: { in: scope.taskIds } } },
      });
      await prisma.tareaEtiqueta.deleteMany({ where: { idTarea: { in: scope.taskIds } } });
      await prisma.comentario.deleteMany({ where: { idTarea: { in: scope.taskIds } } });
      // El cleanup por IDs no conoce los tramos creados por el propio flujo
      // (assign crea filas nuevas), así que se limpian por tarea.
      await prisma.asignacionTarea.deleteMany({ where: { idTarea: { in: scope.taskIds } } });
      scope.assignmentIds = [];
    }
    if (scope.projectIds && scope.projectIds.length > 0) {
      await prisma.etiqueta.deleteMany({ where: { idProyecto: { in: scope.projectIds } } });
    }
    await cleanupIntegrationFixtures(prisma, scope);
  });

  async function runThroughRealGuard<T>(
    controllerClass: object,
    handler: object,
    projectId: number,
    action: () => Promise<T>,
    extra: { params?: Record<string, unknown>; body?: Record<string, unknown> } = {},
  ): Promise<T> {
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];
    expect(guards).toContain(ProjectWriteGuard);

    await guard.canActivate(
      fakeExecutionContext(
        { projectId: String(projectId), ...(extra.params ?? {}) },
        handler,
        controllerClass,
        extra.body ?? {},
      ),
    );
    return action();
  }

  async function esperarRechazo(accion: () => Promise<unknown>): Promise<unknown> {
    let rejection: unknown;
    try {
      await accion();
    } catch (error) {
      rejection = error;
    }
    return rejection;
  }

  /**
   * Escenario compartido por los casos de T34: un proyecto EN_PROGRESO con un
   * Sprint N ya CERRADO (con su tarea, su tramo abierto y su avance
   * históricos) y un Sprint N+1 ACTIVO con su propia tarea.
   */
  async function montarEscenario() {
    const leader = await createIntegrationUser(prisma);
    const miembro = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario, miembro.idUsuario];

    const project = await createIntegrationProject(prisma, leader.idUsuario, {
      estadoProyecto: 'EN_PROGRESO',
    });
    scope.projectIds = [project.idProyecto];

    const rol = await createIntegrationProjectRole(prisma, project.idProyecto, { cupos: 3 });
    scope.roleIds = [rol.idRolProyecto];
    const participacion = await createIntegrationParticipation(
      prisma,
      miembro.idUsuario,
      rol.idRolProyecto,
      { estadoParticipacion: 'ACTIVO' },
    );
    scope.participationIds = [participacion.idParticipacion];

    const sprintCerrado = await createIntegrationSprint(prisma, project.idProyecto, {
      numero: 1,
      estado: 'CERRADO',
    });
    const sprintActivo = await createIntegrationSprint(prisma, project.idProyecto, {
      numero: 2,
      estado: 'ACTIVO',
    });
    scope.sprintIds = [sprintCerrado.idSprint, sprintActivo.idSprint];

    const tareaHistorica = await createIntegrationTask(
      prisma,
      project.idProyecto,
      leader.idUsuario,
      sprintCerrado.idSprint,
      { idRolProyecto: rol.idRolProyecto, tituloTarea: 'Tarea del Sprint cerrado' },
    );
    const tareaVigente = await createIntegrationTask(
      prisma,
      project.idProyecto,
      leader.idUsuario,
      sprintActivo.idSprint,
      { idRolProyecto: rol.idRolProyecto, tituloTarea: 'Tarea del Sprint activo' },
    );
    scope.taskIds = [tareaHistorica.idTarea, tareaVigente.idTarea];

    // El tramo histórico quedó abierto al cerrarse el Sprint: así el rechazo
    // proviene del assert de entidad y no de la ausencia de tramo.
    const tramoHistorico = await createIntegrationTaskAssignment(
      prisma,
      tareaHistorica.idTarea,
      miembro.idUsuario,
      leader.idUsuario,
    );
    scope.assignmentIds = [tramoHistorico.idAsignacion];

    const avanceHistorico = await prisma.registroAvanceAsignacion.create({
      data: {
        idAsignacion: tramoHistorico.idAsignacion,
        idAutor: miembro.idUsuario,
        contenido: CONTENIDO_AVANCE,
      },
    });

    return {
      leader,
      miembro,
      project,
      rol,
      participacion,
      sprintCerrado,
      sprintActivo,
      tareaHistorica,
      tareaVigente,
      tramoHistorico,
      avanceHistorico,
    };
  }

  it('T34-A: con Sprint N cerrado y Sprint N+1 activo, editar tarea, cambiar estado, borrar tarea y crear avance del Sprint N devuelven 409 sin escribir', async () => {
    const env = await montarEscenario();
    const projectId = env.project.idProyecto;

    // El guard aprueba el ambiente: existe un Sprint operable ACTIVO. Lo que
    // decide es el assert de entidad del service.
    const sprintOperable = await prisma.sprint.findFirst({
      where: { idProyecto: projectId, estado: { in: ['ACTIVO', 'EN_FINALIZACION'] } },
      select: { idSprint: true },
    });
    expect(sprintOperable?.idSprint).toBe(env.sprintActivo.idSprint);

    const proyectoAntes = await prisma.proyecto.findUnique({
      where: { idProyecto: projectId },
      select: { fechaActualizacion: true },
    });
    const historicoAntes = {
      tarea: await prisma.tarea.findUnique({ where: { idTarea: env.tareaHistorica.idTarea } }),
      tramo: await prisma.asignacionTarea.findUnique({
        where: { idAsignacion: env.tramoHistorico.idAsignacion },
      }),
      avances: await prisma.registroAvanceAsignacion.count({
        where: { idAsignacion: env.tramoHistorico.idAsignacion },
      }),
      tramos: await prisma.asignacionTarea.count({ where: { idTarea: env.tareaHistorica.idTarea } }),
      horas: await prisma.registroTiempoTarea.count({
        where: { idAsignacion: env.tramoHistorico.idAsignacion },
      }),
    };

    const rechazos = [
      await esperarRechazo(() =>
        runThroughRealGuard(
          TasksController,
          TasksController.prototype.update,
          projectId,
          () =>
            tasksController.update(
              projectId,
              env.tareaHistorica.idTarea,
              { userId: env.leader.idUsuario },
              { tituloTarea: 'Reescritura de historia' },
            ),
          { params: { taskId: String(env.tareaHistorica.idTarea) } },
        ),
      ),
      await esperarRechazo(() =>
        runThroughRealGuard(
          TasksController,
          TasksController.prototype.updateEstado,
          projectId,
          () =>
            tasksController.updateEstado(
              projectId,
              env.tareaHistorica.idTarea,
              { userId: env.leader.idUsuario },
              { estadoTarea: 'EN_PROGRESO' },
            ),
          { params: { taskId: String(env.tareaHistorica.idTarea) } },
        ),
      ),
      await esperarRechazo(() =>
        runThroughRealGuard(
          TasksController,
          TasksController.prototype.remove,
          projectId,
          () =>
            tasksController.remove(projectId, env.tareaHistorica.idTarea, {
              userId: env.leader.idUsuario,
            }),
          { params: { taskId: String(env.tareaHistorica.idTarea) } },
        ),
      ),
      await esperarRechazo(() =>
        runThroughRealGuard(
          ProgressRecordsController,
          ProgressRecordsController.prototype.create,
          projectId,
          () =>
            progressController.create(
              projectId,
              env.tareaHistorica.idTarea,
              env.tramoHistorico.idAsignacion,
              { userId: env.miembro.idUsuario },
              { contenido: CONTENIDO_AVANCE },
            ),
          {
            params: {
              taskId: String(env.tareaHistorica.idTarea),
              assignmentId: String(env.tramoHistorico.idAsignacion),
            },
          },
        ),
      ),
      await esperarRechazo(() =>
        runThroughRealGuard(
          TasksController,
          TasksController.prototype.assign,
          projectId,
          () =>
            tasksController.assign(
              projectId,
              env.tareaHistorica.idTarea,
              { userId: env.leader.idUsuario },
              { idUsuario: env.miembro.idUsuario },
            ),
          { params: { taskId: String(env.tareaHistorica.idTarea) } },
        ),
      ),
      await esperarRechazo(() =>
        runThroughRealGuard(
          TimeRecordsController,
          TimeRecordsController.prototype.create,
          projectId,
          () =>
            timeRecordsController.create(
              projectId,
              env.tareaHistorica.idTarea,
              { userId: env.miembro.idUsuario },
              { horas: 2, fecha: '2026-08-20' },
            ),
          { params: { taskId: String(env.tareaHistorica.idTarea) } },
        ),
      ),
    ];

    for (const rechazo of rechazos) {
      expect(rechazo).toBeInstanceOf(ConflictException);
    }

    // Ninguna fila histórica cambió.
    expect(await prisma.tarea.findUnique({ where: { idTarea: env.tareaHistorica.idTarea } })).toEqual(
      historicoAntes.tarea,
    );
    expect(
      await prisma.asignacionTarea.findUnique({
        where: { idAsignacion: env.tramoHistorico.idAsignacion },
      }),
    ).toEqual(historicoAntes.tramo);
    expect(
      await prisma.registroAvanceAsignacion.count({
        where: { idAsignacion: env.tramoHistorico.idAsignacion },
      }),
    ).toBe(historicoAntes.avances);
    expect(
      await prisma.asignacionTarea.count({ where: { idTarea: env.tareaHistorica.idTarea } }),
    ).toBe(historicoAntes.tramos);
    expect(
      await prisma.registroTiempoTarea.count({
        where: { idAsignacion: env.tramoHistorico.idAsignacion },
      }),
    ).toBe(historicoAntes.horas);
    expect(proyectoAntes).toBeTruthy();

    // --- Las mismas seis operaciones sobre el Sprint activo sí funcionan ---
    const editada = await runThroughRealGuard(
      TasksController,
      TasksController.prototype.update,
      projectId,
      () =>
        tasksController.update(
          projectId,
          env.tareaVigente.idTarea,
          { userId: env.leader.idUsuario },
          { tituloTarea: 'Tarea del Sprint activo (editada)' },
        ),
      { params: { taskId: String(env.tareaVigente.idTarea) } },
    );
    expect(editada.tituloTarea).toBe('Tarea del Sprint activo (editada)');

    const conEstado = await runThroughRealGuard(
      TasksController,
      TasksController.prototype.updateEstado,
      projectId,
      () =>
        tasksController.updateEstado(
          projectId,
          env.tareaVigente.idTarea,
          { userId: env.leader.idUsuario },
          { estadoTarea: 'EN_PROGRESO' },
        ),
      { params: { taskId: String(env.tareaVigente.idTarea) } },
    );
    expect(conEstado.estadoTarea).toBe('EN_PROGRESO');

    const asignada = await runThroughRealGuard(
      TasksController,
      TasksController.prototype.assign,
      projectId,
      () =>
        tasksController.assign(
          projectId,
          env.tareaVigente.idTarea,
          { userId: env.leader.idUsuario },
          { idUsuario: env.miembro.idUsuario },
        ),
      { params: { taskId: String(env.tareaVigente.idTarea) } },
    );
    expect(asignada.asignacionActiva?.idUsuario).toBe(env.miembro.idUsuario);
    const tramoVigente = asignada.asignacionActiva!.idAsignacion;

    const avanceVigente = await runThroughRealGuard(
      ProgressRecordsController,
      ProgressRecordsController.prototype.create,
      projectId,
      () =>
        progressController.create(
          projectId,
          env.tareaVigente.idTarea,
          tramoVigente,
          { userId: env.miembro.idUsuario },
          { contenido: CONTENIDO_AVANCE },
        ),
      {
        params: {
          taskId: String(env.tareaVigente.idTarea),
          assignmentId: String(tramoVigente),
        },
      },
    );
    expect(avanceVigente.idRegistroAvance).toBeTypeOf('number');

    const horasVigentes = await runThroughRealGuard(
      TimeRecordsController,
      TimeRecordsController.prototype.create,
      projectId,
      () =>
        timeRecordsController.create(
          projectId,
          env.tareaVigente.idTarea,
          { userId: env.miembro.idUsuario },
          { horas: 3, fecha: '2026-08-21' },
        ),
      { params: { taskId: String(env.tareaVigente.idTarea) } },
    );
    expect(horasVigentes.horas).toBe(3);

    await runThroughRealGuard(
      TasksController,
      TasksController.prototype.remove,
      projectId,
      () =>
        tasksController.remove(projectId, env.tareaVigente.idTarea, {
          userId: env.leader.idUsuario,
        }),
      { params: { taskId: String(env.tareaVigente.idTarea) } },
    );
    const vigenteTrasBorrado = await prisma.tarea.findUnique({
      where: { idTarea: env.tareaVigente.idTarea },
      select: { eliminadoEn: true },
    });
    expect(vigenteTrasBorrado?.eliminadoEn).not.toBeNull();

    // La tarea del Sprint cerrado sigue intacta tras todo el recorrido.
    expect(await prisma.tarea.findUnique({ where: { idTarea: env.tareaHistorica.idTarea } })).toEqual(
      historicoAntes.tarea,
    );
    expect(Prioridad.MEDIA).toBeDefined();
  });

  it('T34-B: etiquetas y comentarios de una tarea del Sprint cerrado se rechazan con 409 mientras el Sprint N+1 está activo', async () => {
    const env = await montarEscenario();
    const projectId = env.project.idProyecto;

    const etiqueta = await prisma.etiqueta.create({
      data: {
        idProyecto: projectId,
        nombreEtiqueta: 'Histórica',
        nombreNormalizado: 'histórica',
        color: '#10B981',
      },
    });
    await prisma.tareaEtiqueta.create({
      data: { idTarea: env.tareaHistorica.idTarea, idEtiqueta: etiqueta.idEtiqueta },
    });
    const comentarioHistorico = await prisma.comentario.create({
      data: {
        idAutor: env.miembro.idUsuario,
        idTarea: env.tareaHistorica.idTarea,
        contenido: 'Comentario del Sprint ya cerrado',
      },
    });

    const vinculosAntes = await prisma.tareaEtiqueta.findMany({
      where: { idTarea: env.tareaHistorica.idTarea },
      orderBy: { idEtiqueta: 'asc' },
    });
    const comentarioAntes = await prisma.comentario.findUnique({
      where: { idComentario: comentarioHistorico.idComentario },
    });
    const comentariosAntes = await prisma.comentario.count({
      where: { idTarea: env.tareaHistorica.idTarea },
    });

    const rechazos = [
      await esperarRechazo(() =>
        runThroughRealGuard(
          TaskLabelsController,
          TaskLabelsController.prototype.attach,
          projectId,
          () =>
            taskLabelsController.attach(projectId, env.tareaHistorica.idTarea, etiqueta.idEtiqueta, {
              userId: env.leader.idUsuario,
            }),
          {
            params: {
              taskId: String(env.tareaHistorica.idTarea),
              labelId: String(etiqueta.idEtiqueta),
            },
          },
        ),
      ),
      await esperarRechazo(() =>
        runThroughRealGuard(
          TaskLabelsController,
          TaskLabelsController.prototype.detach,
          projectId,
          () =>
            taskLabelsController.detach(projectId, env.tareaHistorica.idTarea, etiqueta.idEtiqueta, {
              userId: env.leader.idUsuario,
            }),
          {
            params: {
              taskId: String(env.tareaHistorica.idTarea),
              labelId: String(etiqueta.idEtiqueta),
            },
          },
        ),
      ),
      await esperarRechazo(() =>
        runThroughRealGuard(
          TareaComentariosController,
          TareaComentariosController.prototype.createComentario,
          projectId,
          () =>
            tareaComentariosController.createComentario(
              projectId,
              env.tareaHistorica.idTarea,
              { userId: env.miembro.idUsuario },
              { contenido: 'Anotación tardía' },
            ),
          { params: { taskId: String(env.tareaHistorica.idTarea) } },
        ),
      ),
      await esperarRechazo(() =>
        runThroughRealGuard(
          TareaComentariosController,
          TareaComentariosController.prototype.updateComentario,
          projectId,
          () =>
            tareaComentariosController.updateComentario(
              projectId,
              env.tareaHistorica.idTarea,
              comentarioHistorico.idComentario,
              { userId: env.miembro.idUsuario },
              { contenido: 'Reescritura del comentario histórico' },
            ),
          {
            params: {
              taskId: String(env.tareaHistorica.idTarea),
              commentId: String(comentarioHistorico.idComentario),
            },
          },
        ),
      ),
      await esperarRechazo(() =>
        runThroughRealGuard(
          TareaComentariosController,
          TareaComentariosController.prototype.removeComentario,
          projectId,
          () =>
            tareaComentariosController.removeComentario(
              projectId,
              env.tareaHistorica.idTarea,
              comentarioHistorico.idComentario,
              { userId: env.miembro.idUsuario },
            ),
          {
            params: {
              taskId: String(env.tareaHistorica.idTarea),
              commentId: String(comentarioHistorico.idComentario),
            },
          },
        ),
      ),
    ];

    for (const rechazo of rechazos) {
      expect(rechazo).toBeInstanceOf(ConflictException);
    }

    // El vínculo y el comentario históricos permanecen idénticos.
    expect(
      await prisma.tareaEtiqueta.findMany({
        where: { idTarea: env.tareaHistorica.idTarea },
        orderBy: { idEtiqueta: 'asc' },
      }),
    ).toEqual(vinculosAntes);
    expect(
      await prisma.comentario.findUnique({ where: { idComentario: comentarioHistorico.idComentario } }),
    ).toEqual(comentarioAntes);
    expect(
      await prisma.comentario.count({ where: { idTarea: env.tareaHistorica.idTarea } }),
    ).toBe(comentariosAntes);

    // --- Las mismas operaciones sobre la tarea del Sprint activo funcionan ---
    await runThroughRealGuard(
      TaskLabelsController,
      TaskLabelsController.prototype.attach,
      projectId,
      () =>
        taskLabelsController.attach(projectId, env.tareaVigente.idTarea, etiqueta.idEtiqueta, {
          userId: env.leader.idUsuario,
        }),
      {
        params: {
          taskId: String(env.tareaVigente.idTarea),
          labelId: String(etiqueta.idEtiqueta),
        },
      },
    );
    expect(
      await prisma.tareaEtiqueta.count({
        where: { idTarea: env.tareaVigente.idTarea, idEtiqueta: etiqueta.idEtiqueta },
      }),
    ).toBe(1);

    const comentarioVigente = await runThroughRealGuard(
      TareaComentariosController,
      TareaComentariosController.prototype.createComentario,
      projectId,
      () =>
        tareaComentariosController.createComentario(
          projectId,
          env.tareaVigente.idTarea,
          { userId: env.miembro.idUsuario },
          { contenido: 'Anotación del Sprint activo' },
        ),
      { params: { taskId: String(env.tareaVigente.idTarea) } },
    );
    expect(comentarioVigente.idComentario).toBeTypeOf('number');

    await runThroughRealGuard(
      TareaComentariosController,
      TareaComentariosController.prototype.updateComentario,
      projectId,
      () =>
        tareaComentariosController.updateComentario(
          projectId,
          env.tareaVigente.idTarea,
          comentarioVigente.idComentario,
          { userId: env.miembro.idUsuario },
          { contenido: 'Anotación del Sprint activo (editada)' },
        ),
      {
        params: {
          taskId: String(env.tareaVigente.idTarea),
          commentId: String(comentarioVigente.idComentario),
        },
      },
    );

    await runThroughRealGuard(
      TareaComentariosController,
      TareaComentariosController.prototype.removeComentario,
      projectId,
      () =>
        tareaComentariosController.removeComentario(
          projectId,
          env.tareaVigente.idTarea,
          comentarioVigente.idComentario,
          { userId: env.miembro.idUsuario },
        ),
      {
        params: {
          taskId: String(env.tareaVigente.idTarea),
          commentId: String(comentarioVigente.idComentario),
        },
      },
    );

    await runThroughRealGuard(
      TaskLabelsController,
      TaskLabelsController.prototype.detach,
      projectId,
      () =>
        taskLabelsController.detach(projectId, env.tareaVigente.idTarea, etiqueta.idEtiqueta, {
          userId: env.leader.idUsuario,
        }),
      {
        params: {
          taskId: String(env.tareaVigente.idTarea),
          labelId: String(etiqueta.idEtiqueta),
        },
      },
    );
    expect(
      await prisma.tareaEtiqueta.count({ where: { idTarea: env.tareaVigente.idTarea } }),
    ).toBe(0);

    // La historia cerrada sigue exactamente igual tras todo el recorrido.
    expect(
      await prisma.tareaEtiqueta.findMany({
        where: { idTarea: env.tareaHistorica.idTarea },
        orderBy: { idEtiqueta: 'asc' },
      }),
    ).toEqual(vinculosAntes);
  });
});
