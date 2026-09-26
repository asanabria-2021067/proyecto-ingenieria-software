import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import {
  createIntegrationUser,
  createIntegrationProject,
  createIntegrationSprint,
  createIntegrationTask,
} from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';
import { ProjectsService } from '../../src/projects/projects.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import type { NotificationsService } from '../../src/notifications/notifications.service';
import { ProjectTransactionService } from '../../src/common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../../src/common/project-policy/project-policy.service';
import { ProjectIdResolverService } from '../../src/common/project-policy/project-id-resolver.service';
import { ProjectReadPolicyService } from '../../src/common/project-policy/project-read-policy.service';

/**
 * Integración real T-186 (HU-147): `ProjectsService.createHito` con
 * `idsTareas` contra PostgreSQL real — el mecanismo que rescata tareas
 * antiguas sin hito (dejadas así por T-185, que exige hito para toda tarea
 * nueva) sin migraciones automáticas. Verifica sobre datos reales lo que un
 * mock no puede demostrar de forma creíble: que la validación de
 * pertenencia al proyecto es real (una tarea de OTRO proyecto se rechaza),
 * que la operación es atómica (un id inválido revierte TODO, incluido el
 * hito recién creado) y que A12 (estadoHito) se sincroniza con las tareas
 * recién asignadas. Se activa solo con `INTEGRATION_DATABASE_URL`; sin esa
 * variable, SKIP limpio (describeIntegration), mismo patrón que el resto de
 * test/integration/.
 */
describeIntegration('ProjectsService.createHito — asignación masiva (idsTareas) — PostgreSQL real', () => {
  let prisma: PrismaClient;
  let service: ProjectsService;
  let scope: IntegrationCleanupScope;

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    const notifications = {} as unknown as NotificationsService;
    const cacheManager = {} as unknown as Cache;
    service = new ProjectsService(
      prisma as unknown as PrismaService,
      notifications,
      cacheManager,
      new ProjectTransactionService(prisma as unknown as PrismaService),
      new ProjectPolicyService(new ProjectIdResolverService(prisma as unknown as PrismaService)),
      new ProjectReadPolicyService(prisma as unknown as PrismaService),
    );
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    scope = {};
  });

  afterEach(async () => {
    await cleanupIntegrationFixtures(prisma, scope);
  });

  it('crea el hito y asigna varias tareas legacy sin hito en una sola operación; A12 sincroniza estadoHito', async () => {
    const leader = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario];
    const project = await createIntegrationProject(prisma, leader.idUsuario, { estadoProyecto: 'EN_PROGRESO' });
    scope.projectIds = [project.idProyecto];
    const sprint = await createIntegrationSprint(prisma, project.idProyecto, { estado: 'ACTIVO' });
    scope.sprintIds = [sprint.idSprint];

    // Tres tareas "de backlog" reales: creadas directo por Prisma (como
    // createIntegrationTask no exige idHito), simulando exactamente las
    // tareas legacy sin hito que T-185 dejó atrapadas.
    const tareaA = await createIntegrationTask(prisma, project.idProyecto, leader.idUsuario, sprint.idSprint, {
      tituloTarea: 'T-186 tarea A',
    });
    const tareaB = await createIntegrationTask(prisma, project.idProyecto, leader.idUsuario, sprint.idSprint, {
      tituloTarea: 'T-186 tarea B',
      estadoTarea: 'HECHO',
    });
    const tareaC = await createIntegrationTask(prisma, project.idProyecto, leader.idUsuario, sprint.idSprint, {
      tituloTarea: 'T-186 tarea C',
    });
    scope.taskIds = [tareaA.idTarea, tareaB.idTarea, tareaC.idTarea];
    expect(tareaA.idHito).toBeNull();
    expect(tareaB.idHito).toBeNull();
    expect(tareaC.idHito).toBeNull();

    const resultado = await service.createHito(project.idProyecto, leader.idUsuario, {
      tituloHito: 'Entrega del MVP',
      idsTareas: [tareaA.idTarea, tareaB.idTarea, tareaC.idTarea],
    });
    scope.hitoIds = [resultado.idHito];

    expect(resultado).toMatchObject({
      tituloHito: 'Entrega del MVP',
      idsTareasAsignadas: [tareaA.idTarea, tareaB.idTarea, tareaC.idTarea],
    });

    const tareasActualizadas = await prisma.tarea.findMany({
      where: { idTarea: { in: [tareaA.idTarea, tareaB.idTarea, tareaC.idTarea] } },
      select: { idTarea: true, idHito: true },
    });
    expect(tareasActualizadas.every((t) => t.idHito === resultado.idHito)).toBe(true);

    // A12: 1 de 3 tareas HECHO (33%) -> EN_PROGRESO, persistido de verdad.
    const hitoPersistido = await prisma.hito.findUniqueOrThrow({ where: { idHito: resultado.idHito } });
    expect(hitoPersistido.estadoHito).toBe('EN_PROGRESO');
  });

  it('id de tarea de OTRO proyecto: NotFoundException, ni el hito ni ninguna tarea quedan modificados (atomicidad)', async () => {
    const leader = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario];
    const projectA = await createIntegrationProject(prisma, leader.idUsuario, { estadoProyecto: 'EN_PROGRESO' });
    const projectB = await createIntegrationProject(prisma, leader.idUsuario, { estadoProyecto: 'EN_PROGRESO' });
    scope.projectIds = [projectA.idProyecto, projectB.idProyecto];

    const sprintA = await createIntegrationSprint(prisma, projectA.idProyecto, { estado: 'ACTIVO' });
    const sprintB = await createIntegrationSprint(prisma, projectB.idProyecto, { estado: 'ACTIVO' });
    scope.sprintIds = [sprintA.idSprint, sprintB.idSprint];

    const tareaA = await createIntegrationTask(prisma, projectA.idProyecto, leader.idUsuario, sprintA.idSprint, {
      tituloTarea: 'T-186 aislamiento A',
    });
    const tareaB = await createIntegrationTask(prisma, projectB.idProyecto, leader.idUsuario, sprintB.idSprint, {
      tituloTarea: 'T-186 aislamiento B (otro proyecto)',
    });
    scope.taskIds = [tareaA.idTarea, tareaB.idTarea];

    const hitosAntes = await prisma.hito.count({ where: { idProyecto: projectA.idProyecto } });

    await expect(
      service.createHito(projectA.idProyecto, leader.idUsuario, {
        tituloHito: 'Hito que no debe persistir',
        // tareaB pertenece a projectB: el intento de usar esta operación
        // para tocar una tarea de otro proyecto debe rechazarse completo.
        idsTareas: [tareaA.idTarea, tareaB.idTarea],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const hitosDespues = await prisma.hito.count({ where: { idProyecto: projectA.idProyecto } });
    expect(hitosDespues).toBe(hitosAntes); // ningún hito huérfano quedó persistido

    const tareaAIntacta = await prisma.tarea.findUniqueOrThrow({ where: { idTarea: tareaA.idTarea } });
    const tareaBIntacta = await prisma.tarea.findUniqueOrThrow({ where: { idTarea: tareaB.idTarea } });
    expect(tareaAIntacta.idHito).toBeNull();
    expect(tareaBIntacta.idHito).toBeNull();
  });

  it('actor sin participación activa en el proyecto: ForbiddenException, no crea el hito ni toca tareas', async () => {
    const leader = await createIntegrationUser(prisma);
    const externo = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario, externo.idUsuario];
    const project = await createIntegrationProject(prisma, leader.idUsuario, { estadoProyecto: 'EN_PROGRESO' });
    scope.projectIds = [project.idProyecto];
    const sprint = await createIntegrationSprint(prisma, project.idProyecto, { estado: 'ACTIVO' });
    scope.sprintIds = [sprint.idSprint];

    const tarea = await createIntegrationTask(prisma, project.idProyecto, leader.idUsuario, sprint.idSprint, {
      tituloTarea: 'T-186 tarea de un proyecto ajeno al actor',
    });
    scope.taskIds = [tarea.idTarea];

    await expect(
      service.createHito(project.idProyecto, externo.idUsuario, {
        tituloHito: 'Hito no autorizado',
        idsTareas: [tarea.idTarea],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const tareaIntacta = await prisma.tarea.findUniqueOrThrow({ where: { idTarea: tarea.idTarea } });
    expect(tareaIntacta.idHito).toBeNull();
    const hitosDelProyecto = await prisma.hito.count({ where: { idProyecto: project.idProyecto } });
    expect(hitosDelProyecto).toBe(0);
  });

  it('permite rescatar una tarea cuyo Sprint ya está CERRADO (no exige Sprint ACTIVO como TAREA_WRITE)', async () => {
    const leader = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario];
    const project = await createIntegrationProject(prisma, leader.idUsuario, { estadoProyecto: 'EN_PROGRESO' });
    scope.projectIds = [project.idProyecto];
    const sprintViejo = await createIntegrationSprint(prisma, project.idProyecto, { estado: 'CERRADO' });
    const sprintActivo = await createIntegrationSprint(prisma, project.idProyecto, { numero: 2, estado: 'ACTIVO' });
    scope.sprintIds = [sprintViejo.idSprint, sprintActivo.idSprint];

    // Tarea "de backlog" real cuyo Sprint original ya cerró — el escenario
    // exacto que TAREA_WRITE (sprint: 'ACTIVO') bloquearía si esta
    // operación reutilizara esa política en vez de HITO_CREATE.
    const tareaVieja = await createIntegrationTask(prisma, project.idProyecto, leader.idUsuario, sprintViejo.idSprint, {
      tituloTarea: 'T-186 tarea de Sprint ya cerrado',
    });
    scope.taskIds = [tareaVieja.idTarea];

    const resultado = await service.createHito(project.idProyecto, leader.idUsuario, {
      tituloHito: 'Hito que rescata tareas viejas',
      idsTareas: [tareaVieja.idTarea],
    });
    scope.hitoIds = [resultado.idHito];

    const tareaActualizada = await prisma.tarea.findUniqueOrThrow({ where: { idTarea: tareaVieja.idTarea } });
    expect(tareaActualizada.idHito).toBe(resultado.idHito);
  });
});
