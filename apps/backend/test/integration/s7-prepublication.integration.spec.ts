import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  type ExecutionContext,
} from '@nestjs/common';
import { EstadoProyecto, type PrismaClient } from '@prisma/client';
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
} from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';
import { ProjectWriteGuard } from '../../src/common/guards/project-write.guard';
import { ProjectIdResolverService } from '../../src/common/project-policy/project-id-resolver.service';
import { ProjectPolicyService } from '../../src/common/project-policy/project-policy.service';
import { ProjectTransactionService } from '../../src/common/project-policy/project-transaction.service';
import { RolesController } from '../../src/roles/roles.controller';
import { RolesService } from '../../src/roles/roles.service';
import { LabelsController } from '../../src/labels/labels.controller';
import { LabelsService } from '../../src/labels/labels.service';
import { ProjectsController } from '../../src/projects/projects.controller';
import { ProjectsService } from '../../src/projects/projects.service';
import { calcularProgresoHito } from '../../src/common/hito-progreso';
import { ComentariosController } from '../../src/comentarios/comentarios.controller';
import { ComentariosService } from '../../src/comentarios/comentarios.service';
import { TareaComentariosController } from '../../src/tasks/tarea-comentarios.controller';
import { ProjectReadPolicyService } from '../../src/common/project-policy/project-read-policy.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import type { NotificationsService } from '../../src/notifications/notifications.service';

/**
 * T33 (06 v2 §33/§47): la prepublicación conserva la preparación estructural
 * del proyecto. Cada caso ejecuta el guard REAL sobre la metadata REAL del
 * handler y, si autoriza, el método real del controller respaldado por su
 * servicio real contra PostgreSQL real — nunca una llamada aislada al guard.
 *
 * NotificationsService se sustituye por un doble sin operaciones: exige un
 * gateway socket.io que no forma parte de lo que T33 verifica (mismo criterio
 * que project-write-guard.integration.spec.ts).
 */
function makeFakeNotifications() {
  return {
    notifyFromTemplate: async () => undefined,
    notifyUsers: async () => undefined,
    notifyRoleMembers: async () => undefined,
    notifyProjectActiveParticipants: async () => undefined,
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

const ESTADOS_PREPUBLICACION: EstadoProyecto[] = [
  EstadoProyecto.BORRADOR,
  EstadoProyecto.EN_REVISION,
  EstadoProyecto.OBSERVADO,
];

describeIntegration('T33 — prepublicación contra PostgreSQL real (06 v2 §33)', () => {
  let prisma: PrismaClient;
  let rolesController: RolesController;
  let labelsController: LabelsController;
  let projectsController: ProjectsController;
  let comentariosController: ComentariosController;
  let tareaComentariosController: TareaComentariosController;
  let guard: ProjectWriteGuard;
  let scope: IntegrationCleanupScope;
  let labelIds: number[];
  let commentIds: number[];

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    await prisma.$connect();

    const prismaService = prisma as unknown as PrismaService;
    const projectTx = new ProjectTransactionService(prismaService);
    const resolver = new ProjectIdResolverService(prismaService);
    const policy = new ProjectPolicyService(resolver);

    rolesController = new RolesController(
      new RolesService(prismaService, makeFakeNotifications(), projectTx, policy),
    );
    labelsController = new LabelsController(new LabelsService(prismaService, projectTx, policy));

    projectsController = new ProjectsController(
      new ProjectsService(
        prismaService,
        makeFakeNotifications(),
        { get: async () => undefined, set: async () => undefined, del: async () => undefined } as never,
        projectTx,
        policy,
        new ProjectReadPolicyService(prismaService),
      ),
    );

    const comentariosService = new ComentariosService(
      prismaService,
      makeFakeNotifications(),
      projectTx,
      policy,
      new ProjectReadPolicyService(prismaService),
    );
    comentariosController = new ComentariosController(comentariosService);
    tareaComentariosController = new TareaComentariosController(comentariosService);
    guard = new ProjectWriteGuard(new Reflector(), resolver, policy, prismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    scope = {};
    labelIds = [];
    commentIds = [];
  });

  afterEach(async () => {
    if (commentIds.length > 0) {
      await prisma.comentario.deleteMany({ where: { idComentario: { in: commentIds } } });
    }
    if (labelIds.length > 0) {
      await prisma.etiqueta.deleteMany({ where: { idEtiqueta: { in: labelIds } } });
    }
    if (scope.projectIds && scope.projectIds.length > 0) {
      await prisma.hito.deleteMany({ where: { idProyecto: { in: scope.projectIds } } });
    }
    await cleanupIntegrationFixtures(prisma, scope);
  });

  /**
   * Reproduce lo que Nest hace antes de invocar un handler: lee
   * GUARDS_METADATA del handler real, confirma que ProjectWriteGuard está
   * decorado ahí y lo ejecuta. Si autoriza, invoca `action`; si no, la
   * excepción se propaga sin que `action` llegue a ejecutarse.
   */
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

  it('T33-A: el líder crea, edita y borra roles y etiquetas en BORRADOR, EN_REVISION y OBSERVADO sin Sprint operable', async () => {
    const leader = await createIntegrationUser(prisma);
    const externo = await createIntegrationUser(prisma);
    const participanteOtroProyecto = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario, externo.idUsuario, participanteOtroProyecto.idUsuario];
    scope.projectIds = [];
    scope.roleIds = [];
    scope.participationIds = [];

    // Un participante activo, pero de OTRO proyecto: no debe poder preparar
    // la estructura de estos tres.
    const proyectoAjeno = await createIntegrationProject(prisma, leader.idUsuario, {
      estadoProyecto: 'EN_PROGRESO',
    });
    scope.projectIds.push(proyectoAjeno.idProyecto);
    const rolAjeno = await createIntegrationProjectRole(prisma, proyectoAjeno.idProyecto);
    scope.roleIds.push(rolAjeno.idRolProyecto);
    const participacionAjena = await createIntegrationParticipation(
      prisma,
      participanteOtroProyecto.idUsuario,
      rolAjeno.idRolProyecto,
      { estadoParticipacion: 'ACTIVO' },
    );
    scope.participationIds.push(participacionAjena.idParticipacion);

    const participacionesAntes = await prisma.participacionProyecto.count();

    for (const estadoProyecto of ESTADOS_PREPUBLICACION) {
      const project = await createIntegrationProject(prisma, leader.idUsuario, { estadoProyecto });
      scope.projectIds.push(project.idProyecto);
      const projectId = project.idProyecto;

      // Ningún Sprint: la preparación estructural no depende de que exista uno.
      const sprintsDelProyecto = await prisma.sprint.count({ where: { idProyecto: projectId } });
      expect(sprintsDelProyecto).toBe(0);

      // --- ROL: crear, editar, borrar ---
      const rolCreado = await runThroughRealGuard(
        RolesController,
        RolesController.prototype.create,
        projectId,
        () =>
          rolesController.create(
            projectId,
            { nombreRol: `Preparación ${estadoProyecto}`, cupos: 2 },
            { userId: leader.idUsuario },
          ),
      );
      expect(rolCreado.idRolProyecto).toBeTypeOf('number');

      const rolEditado = await runThroughRealGuard(
        RolesController,
        RolesController.prototype.update,
        projectId,
        () =>
          rolesController.update(
            projectId,
            rolCreado.idRolProyecto,
            { nombreRol: `Preparación ${estadoProyecto} v2`, cupos: 3 },
            { userId: leader.idUsuario },
          ),
      );
      expect(rolEditado.nombreRol).toBe(`Preparación ${estadoProyecto} v2`);
      expect(rolEditado.cupos).toBe(3);

      const rolEliminado = await runThroughRealGuard(
        RolesController,
        RolesController.prototype.remove,
        projectId,
        () => rolesController.remove(projectId, rolCreado.idRolProyecto, { userId: leader.idUsuario }),
      );
      expect(rolEliminado).toEqual({ idRolProyecto: rolCreado.idRolProyecto, eliminado: true });

      // --- ETIQUETA: crear, editar, borrar ---
      const etiquetaCreada = await runThroughRealGuard(
        LabelsController,
        LabelsController.prototype.create,
        projectId,
        () =>
          labelsController.create(
            projectId,
            { userId: leader.idUsuario },
            { nombreEtiqueta: `Etiqueta ${estadoProyecto}`, color: '#10B981' },
          ),
      );
      expect(etiquetaCreada.idEtiqueta).toBeTypeOf('number');
      labelIds.push(etiquetaCreada.idEtiqueta);

      const etiquetaEditada = await runThroughRealGuard(
        LabelsController,
        LabelsController.prototype.update,
        projectId,
        () =>
          labelsController.update(
            projectId,
            etiquetaCreada.idEtiqueta,
            { userId: leader.idUsuario },
            { nombreEtiqueta: `Etiqueta ${estadoProyecto} v2`, color: '#EF4444' },
          ),
      );
      expect(etiquetaEditada.nombreEtiqueta).toBe(`Etiqueta ${estadoProyecto} v2`);

      await runThroughRealGuard(
        LabelsController,
        LabelsController.prototype.remove,
        projectId,
        () => labelsController.remove(projectId, etiquetaCreada.idEtiqueta, { userId: leader.idUsuario }),
      );
      const etiquetasRestantes = await prisma.etiqueta.count({ where: { idProyecto: projectId } });
      expect(etiquetasRestantes).toBe(0);

      // --- El CRUD no es autoinscripción libre: un usuario ajeno no prepara ---
      let rechazoExterno: unknown;
      try {
        await runThroughRealGuard(
          RolesController,
          RolesController.prototype.create,
          projectId,
          () =>
            rolesController.create(
              projectId,
              { nombreRol: 'Rol de un ajeno', cupos: 1 },
              { userId: externo.idUsuario },
            ),
        );
      } catch (error) {
        rechazoExterno = error;
      }
      expect(rechazoExterno).toBeInstanceOf(ForbiddenException);

      let rechazoParticipanteAjeno: unknown;
      try {
        await runThroughRealGuard(
          RolesController,
          RolesController.prototype.create,
          projectId,
          () =>
            rolesController.create(
              projectId,
              { nombreRol: 'Rol de otro proyecto', cupos: 1 },
              { userId: participanteOtroProyecto.idUsuario },
            ),
        );
      } catch (error) {
        rechazoParticipanteAjeno = error;
      }
      expect(rechazoParticipanteAjeno).toBeInstanceOf(ForbiddenException);

      const rolesDelProyecto = await prisma.rolProyecto.count({ where: { idProyecto: projectId } });
      expect(rolesDelProyecto).toBe(0);
    }

    // --- La prohibición vigente de borrado con historial se conserva ---
    const proyectoConHistorial = await createIntegrationProject(prisma, leader.idUsuario, {
      estadoProyecto: 'BORRADOR',
    });
    scope.projectIds.push(proyectoConHistorial.idProyecto);
    const rolConParticipacion = await createIntegrationProjectRole(
      prisma,
      proyectoConHistorial.idProyecto,
    );
    scope.roleIds.push(rolConParticipacion.idRolProyecto);
    const participacion = await createIntegrationParticipation(
      prisma,
      externo.idUsuario,
      rolConParticipacion.idRolProyecto,
      { estadoParticipacion: 'ACTIVO' },
    );
    scope.participationIds.push(participacion.idParticipacion);

    let rechazoBorrado: unknown;
    try {
      await runThroughRealGuard(
        RolesController,
        RolesController.prototype.remove,
        proyectoConHistorial.idProyecto,
        () =>
          rolesController.remove(
            proyectoConHistorial.idProyecto,
            rolConParticipacion.idRolProyecto,
            { userId: leader.idUsuario },
          ),
      );
    } catch (error) {
      rechazoBorrado = error;
    }
    expect(rechazoBorrado).toBeInstanceOf(BadRequestException);
    const rolSigueExistiendo = await prisma.rolProyecto.count({
      where: { idRolProyecto: rolConParticipacion.idRolProyecto },
    });
    expect(rolSigueExistiendo).toBe(1);

    // Ninguna de las operaciones anteriores creó participaciones: la única
    // que existe es la sembrada explícitamente por este test.
    const participacionesDespues = await prisma.participacionProyecto.count();
    expect(participacionesDespues).toBe(participacionesAntes + 1);
  });

  it('T33-B: los tres canales de comentario respetan su intención en BORRADOR, EN_REVISION y OBSERVADO', async () => {
    const leader = await createIntegrationUser(prisma);
    const participante = await createIntegrationUser(prisma);
    const externo = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario, participante.idUsuario, externo.idUsuario];

    // Proyecto en BORRADOR con historia previa: un hito, un Sprint ACTIVO y
    // una tarea legacy que ya existía cuando el proyecto volvió a prepublicación.
    const project = await createIntegrationProject(prisma, leader.idUsuario, {
      estadoProyecto: 'BORRADOR',
    });
    scope.projectIds = [project.idProyecto];
    const projectId = project.idProyecto;

    const rol = await createIntegrationProjectRole(prisma, projectId);
    scope.roleIds = [rol.idRolProyecto];
    const participacion = await createIntegrationParticipation(
      prisma,
      participante.idUsuario,
      rol.idRolProyecto,
      { estadoParticipacion: 'ACTIVO' },
    );
    scope.participationIds = [participacion.idParticipacion];

    const hito = await prisma.hito.create({
      data: { idProyecto: projectId, tituloHito: 'Hito de prepublicación', orden: 1 },
    });

    const sprintActivo = await createIntegrationSprint(prisma, projectId, { estado: 'ACTIVO' });
    const sprintCerrado = await createIntegrationSprint(prisma, projectId, {
      numero: 2,
      estado: 'CERRADO',
    });
    scope.sprintIds = [sprintActivo.idSprint, sprintCerrado.idSprint];

    const tareaVigente = await createIntegrationTask(
      prisma,
      projectId,
      leader.idUsuario,
      sprintActivo.idSprint,
    );
    const tareaHistorica = await createIntegrationTask(
      prisma,
      projectId,
      leader.idUsuario,
      sprintCerrado.idSprint,
    );
    scope.taskIds = [tareaVigente.idTarea, tareaHistorica.idTarea];

    const tareasAntes = await prisma.tarea.count({ where: { idProyecto: projectId } });
    const avancesAntes = await prisma.registroAvanceAsignacion.count();

    for (const estadoProyecto of ESTADOS_PREPUBLICACION) {
      await prisma.proyecto.update({
        where: { idProyecto: projectId },
        data: { estadoProyecto },
      });

      // --- Canal de proyecto (líder) ---
      const comentarioProyecto = await runThroughRealGuard(
        ComentariosController,
        ComentariosController.prototype.create,
        projectId,
        () =>
          comentariosController.create(
            { userId: leader.idUsuario },
            { idProyecto: projectId, contenido: `Proyecto en ${estadoProyecto}` },
          ),
        { body: { idProyecto: projectId } },
      );
      expect(comentarioProyecto.idComentario).toBeTypeOf('number');
      commentIds.push(comentarioProyecto.idComentario);

      // --- Canal de hito (líder: en prepublicación el canal es suyo) ---
      const comentarioHito = await runThroughRealGuard(
        ComentariosController,
        ComentariosController.prototype.create,
        projectId,
        () =>
          comentariosController.create(
            { userId: leader.idUsuario },
            { idHito: hito.idHito, contenido: `Hito en ${estadoProyecto}` },
          ),
        { body: { idHito: hito.idHito } },
      );
      expect(comentarioHito.idComentario).toBeTypeOf('number');
      commentIds.push(comentarioHito.idComentario);

      // --- Canal de tarea existente, cuyo Sprint sigue ACTIVO ---
      const comentarioTarea = await runThroughRealGuard(
        TareaComentariosController,
        TareaComentariosController.prototype.createComentario,
        projectId,
        () =>
          tareaComentariosController.createComentario(
            projectId,
            tareaVigente.idTarea,
            { userId: leader.idUsuario },
            { contenido: `Anotación de tarea en ${estadoProyecto}` },
          ),
        { params: { taskId: String(tareaVigente.idTarea) } },
      );
      expect(comentarioTarea.idComentario).toBeTypeOf('number');
      commentIds.push(comentarioTarea.idComentario);

      // --- El autor edita y borra el propio ---
      const editado = await runThroughRealGuard(
        ComentariosController,
        ComentariosController.prototype.update,
        projectId,
        () =>
          comentariosController.update(
            comentarioProyecto.idComentario,
            { userId: leader.idUsuario },
            { contenido: `Proyecto en ${estadoProyecto} (editado)` },
          ),
        { params: { idComentario: String(comentarioProyecto.idComentario) } },
      );
      expect(editado.contenido).toBe(`Proyecto en ${estadoProyecto} (editado)`);

      await runThroughRealGuard(
        ComentariosController,
        ComentariosController.prototype.remove,
        projectId,
        () =>
          comentariosController.remove(comentarioProyecto.idComentario, {
            userId: leader.idUsuario,
          }),
        { params: { idComentario: String(comentarioProyecto.idComentario) } },
      );
      const borrado = await prisma.comentario.findUnique({
        where: { idComentario: comentarioProyecto.idComentario },
        select: { eliminadoEn: true },
      });
      expect(borrado?.eliminadoEn).not.toBeNull();

      // --- Un externo no comenta en ningún canal ---
      let rechazoExterno: unknown;
      try {
        await runThroughRealGuard(
          ComentariosController,
          ComentariosController.prototype.create,
          projectId,
          () =>
            comentariosController.create(
              { userId: externo.idUsuario },
              { idProyecto: projectId, contenido: 'Comentario de un ajeno' },
            ),
          { body: { idProyecto: projectId } },
        );
      } catch (error) {
        rechazoExterno = error;
      }
      expect(rechazoExterno).toBeInstanceOf(ForbiddenException);

      // --- En prepublicación el canal es del líder: el participante espera ---
      let rechazoParticipantePrepub: unknown;
      try {
        await runThroughRealGuard(
          ComentariosController,
          ComentariosController.prototype.create,
          projectId,
          () =>
            comentariosController.create(
              { userId: participante.idUsuario },
              { idProyecto: projectId, contenido: 'Comentario prematuro' },
            ),
          { body: { idProyecto: projectId } },
        );
      } catch (error) {
        rechazoParticipantePrepub = error;
      }
      expect(rechazoParticipantePrepub).toBeInstanceOf(ForbiddenException);

      // --- Anotar una tarea de Sprint CERRADO se rechaza, sin escribir ---
      const comentariosAntesDelIntento = await prisma.comentario.count({
        where: { idTarea: tareaHistorica.idTarea },
      });
      let rechazoSprintCerrado: unknown;
      try {
        await runThroughRealGuard(
          TareaComentariosController,
          TareaComentariosController.prototype.createComentario,
          projectId,
          () =>
            tareaComentariosController.createComentario(
              projectId,
              tareaHistorica.idTarea,
              { userId: leader.idUsuario },
              { contenido: 'Anotación sobre historia cerrada' },
            ),
          { params: { taskId: String(tareaHistorica.idTarea) } },
        );
      } catch (error) {
        rechazoSprintCerrado = error;
      }
      expect(rechazoSprintCerrado).toBeInstanceOf(ConflictException);
      const comentariosDespuesDelIntento = await prisma.comentario.count({
        where: { idTarea: tareaHistorica.idTarea },
      });
      expect(comentariosDespuesDelIntento).toBe(comentariosAntesDelIntento);
    }

    // Publicado el proyecto, el participante activo escribe en los tres canales
    // (la otra mitad de la intención de cada canal).
    await prisma.proyecto.update({
      where: { idProyecto: projectId },
      data: { estadoProyecto: EstadoProyecto.EN_PROGRESO },
    });

    const comentarioProyectoOperativo = await runThroughRealGuard(
      ComentariosController,
      ComentariosController.prototype.create,
      projectId,
      () =>
        comentariosController.create(
          { userId: participante.idUsuario },
          { idProyecto: projectId, contenido: 'Proyecto operativo' },
        ),
      { body: { idProyecto: projectId } },
    );
    commentIds.push(comentarioProyectoOperativo.idComentario);

    const comentarioHitoOperativo = await runThroughRealGuard(
      ComentariosController,
      ComentariosController.prototype.create,
      projectId,
      () =>
        comentariosController.create(
          { userId: participante.idUsuario },
          { idHito: hito.idHito, contenido: 'Hito operativo' },
        ),
      { body: { idHito: hito.idHito } },
    );
    commentIds.push(comentarioHitoOperativo.idComentario);

    const comentarioTareaOperativo = await runThroughRealGuard(
      TareaComentariosController,
      TareaComentariosController.prototype.createComentario,
      projectId,
      () =>
        tareaComentariosController.createComentario(
          projectId,
          tareaVigente.idTarea,
          { userId: participante.idUsuario },
          { contenido: 'Anotación operativa de tarea' },
        ),
      { params: { taskId: String(tareaVigente.idTarea) } },
    );
    commentIds.push(comentarioTareaOperativo.idComentario);

    // La anotación permitida nunca abre operación de tarea en prepublicación.
    const tareasDespues = await prisma.tarea.count({ where: { idProyecto: projectId } });
    expect(tareasDespues).toBe(tareasAntes);
    const avancesDespues = await prisma.registroAvanceAsignacion.count();
    expect(avancesDespues).toBe(avancesAntes);
  });

  it('T33-C: el líder se incorpora a un rol con cupo y crea hitos en prepublicación conservando el actor real y las fórmulas', async () => {
    const leader = await createIntegrationUser(prisma);
    const participante = await createIntegrationUser(prisma);
    const ocupante = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario, participante.idUsuario, ocupante.idUsuario];

    const project = await createIntegrationProject(prisma, leader.idUsuario, {
      estadoProyecto: 'BORRADOR',
    });
    scope.projectIds = [project.idProyecto];
    const projectId = project.idProyecto;

    const rolConCupo = await createIntegrationProjectRole(prisma, projectId, { cupos: 1 });
    const rolAgotado = await createIntegrationProjectRole(prisma, projectId, { cupos: 1 });
    const rolDelParticipante = await createIntegrationProjectRole(prisma, projectId, { cupos: 1 });
    scope.roleIds = [
      rolConCupo.idRolProyecto,
      rolAgotado.idRolProyecto,
      rolDelParticipante.idRolProyecto,
    ];

    const participacionOcupante = await createIntegrationParticipation(
      prisma,
      ocupante.idUsuario,
      rolAgotado.idRolProyecto,
      { estadoParticipacion: 'ACTIVO' },
    );
    const participacionParticipante = await createIntegrationParticipation(
      prisma,
      participante.idUsuario,
      rolDelParticipante.idRolProyecto,
      { estadoParticipacion: 'ACTIVO' },
    );
    scope.participationIds = [
      participacionOcupante.idParticipacion,
      participacionParticipante.idParticipacion,
    ];

    // --- Incorporación normal del líder al rol con cupo ---
    const incorporacion = await runThroughRealGuard(
      RolesController,
      RolesController.prototype.selfAssign,
      projectId,
      () =>
        rolesController.selfAssign(projectId, rolConCupo.idRolProyecto, {
          userId: leader.idUsuario,
        }),
      { params: { roleId: String(rolConCupo.idRolProyecto) } },
    );
    expect(incorporacion.estadoParticipacion).toBe('ACTIVO');
    expect(incorporacion.yaParticipaba).toBe(false);
    scope.participationIds.push(incorporacion.idParticipacion);

    const participacionPersistida = await prisma.participacionProyecto.findUnique({
      where: { idParticipacion: incorporacion.idParticipacion },
      select: { idUsuario: true, idRolProyecto: true, estadoParticipacion: true },
    });
    expect(participacionPersistida).toEqual({
      idUsuario: leader.idUsuario,
      idRolProyecto: rolConCupo.idRolProyecto,
      estadoParticipacion: 'ACTIVO',
    });

    // --- El rol sin cupo disponible rechaza la incorporación, sin escribir ---
    const participacionesEnAgotado = await prisma.participacionProyecto.count({
      where: { idRolProyecto: rolAgotado.idRolProyecto },
    });
    let rechazoCupo: unknown;
    try {
      await runThroughRealGuard(
        RolesController,
        RolesController.prototype.selfAssign,
        projectId,
        () =>
          rolesController.selfAssign(projectId, rolAgotado.idRolProyecto, {
            userId: leader.idUsuario,
          }),
        { params: { roleId: String(rolAgotado.idRolProyecto) } },
      );
    } catch (error) {
      rechazoCupo = error;
    }
    // El rechazo vigente por cupo agotado es el 400 de RolesService; C052 no
    // toca ese servicio (su alcance productivo es la metadata de las rutas),
    // así que se fija el comportamiento real, no uno nuevo.
    expect(rechazoCupo).toBeInstanceOf(BadRequestException);
    expect(
      await prisma.participacionProyecto.count({
        where: { idRolProyecto: rolAgotado.idRolProyecto },
      }),
    ).toBe(participacionesEnAgotado);

    // --- Hitos: los crea el líder y también un participante activo ---
    const hitoDelLider = await runThroughRealGuard(
      ProjectsController,
      ProjectsController.prototype.createHito,
      projectId,
      () =>
        projectsController.createHito(
          projectId,
          { tituloHito: 'Hito del líder' },
          { userId: leader.idUsuario },
        ),
      { params: { id: String(projectId) } },
    );
    expect(hitoDelLider.idHito).toBeTypeOf('number');

    const hitoDelParticipante = await runThroughRealGuard(
      ProjectsController,
      ProjectsController.prototype.createHito,
      projectId,
      () =>
        projectsController.createHito(
          projectId,
          { tituloHito: 'Hito del participante' },
          { userId: participante.idUsuario },
        ),
      { params: { id: String(projectId) } },
    );
    expect(hitoDelParticipante.idHito).toBeTypeOf('number');

    // El actor real de cada operación se conserva: crear un hito no otorga
    // liderazgo ni reescribe `creadoPor`.
    const proyectoTrasHitos = await prisma.proyecto.findUnique({
      where: { idProyecto: projectId },
      select: { creadoPor: true },
    });
    expect(proyectoTrasHitos?.creadoPor).toBe(leader.idUsuario);
    const participacionesDelParticipante = await prisma.participacionProyecto.findMany({
      where: { idUsuario: participante.idUsuario, rolProyecto: { idProyecto: projectId } },
      select: { idParticipacion: true, estadoParticipacion: true },
    });
    expect(participacionesDelParticipante).toEqual([
      {
        idParticipacion: participacionParticipante.idParticipacion,
        estadoParticipacion: 'ACTIVO',
      },
    ]);

    // --- El avance usa exactamente la fórmula canónica, sin cambios ---
    const sprint = await createIntegrationSprint(prisma, projectId, { estado: 'ACTIVO' });
    scope.sprintIds = [sprint.idSprint];
    const tareaHecha = await createIntegrationTask(
      prisma,
      projectId,
      leader.idUsuario,
      sprint.idSprint,
      { estadoTarea: 'HECHO' },
    );
    const tareaPendiente = await createIntegrationTask(
      prisma,
      projectId,
      leader.idUsuario,
      sprint.idSprint,
    );
    scope.taskIds = [tareaHecha.idTarea, tareaPendiente.idTarea];
    await prisma.tarea.updateMany({
      where: { idTarea: { in: [tareaHecha.idTarea, tareaPendiente.idTarea] } },
      data: { idHito: hitoDelLider.idHito },
    });

    const avance = await projectsController.getAvance(projectId, { userId: leader.idUsuario });

    // El agregado del proyecto se deriva exactamente de la fórmula canónica
    // aplicada hito a hito: uno con 1 de 2 tareas HECHO (EN_PROGRESO) y otro
    // sin tareas (PENDIENTE).
    const progresoHitoDelLider = calcularProgresoHito([
      { estadoTarea: 'HECHO' },
      { estadoTarea: 'POR_HACER' },
    ]);
    const progresoHitoDelParticipante = calcularProgresoHito([]);
    expect(progresoHitoDelLider.estadoHito).toBe('EN_PROGRESO');
    expect(progresoHitoDelParticipante.estadoHito).toBe('PENDIENTE');
    expect(avance.hitos).toEqual({
      porcentaje: 0,
      total: 2,
      pendiente: 1,
      enProgreso: 1,
      completado: 0,
    });
    expect(avance.tareas.porcentaje).toBe(50);
  });
});
