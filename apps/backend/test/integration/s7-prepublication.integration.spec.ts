import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { BadRequestException, ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { EstadoProyecto, type PrismaClient } from '@prisma/client';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import {
  createIntegrationUser,
  createIntegrationProject,
  createIntegrationProjectRole,
  createIntegrationParticipation,
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
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ params, body: {} }) }),
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
  let guard: ProjectWriteGuard;
  let scope: IntegrationCleanupScope;
  let labelIds: number[];

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
    guard = new ProjectWriteGuard(new Reflector(), resolver, policy, prismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    scope = {};
    labelIds = [];
  });

  afterEach(async () => {
    if (labelIds.length > 0) {
      await prisma.etiqueta.deleteMany({ where: { idEtiqueta: { in: labelIds } } });
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
  ): Promise<T> {
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];
    expect(guards).toContain(ProjectWriteGuard);

    await guard.canActivate(
      fakeExecutionContext({ projectId: String(projectId) }, handler, controllerClass),
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
});
