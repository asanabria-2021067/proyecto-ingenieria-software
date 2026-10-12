import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import { createIntegrationProject, createIntegrationUser } from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';
import {
  accessTokenFor,
  requestJson,
  startIntegrationHttpHarness,
  type IntegrationHttpHarness,
} from './setup/http-harness';
import { plannedEndDate } from './setup/sprint-plan';
import { SprintsController } from '../../src/sprints/sprints.controller';
import { SprintsService } from '../../src/sprints/sprints.service';
import { StartSprintDto } from '../../src/sprints/dto/start-sprint.dto';
import { SprintsContextService } from '../../src/sprints/sprints-context.service';
import { SprintsAuthorizationService } from '../../src/sprints/sprints-authorization.service';
import { SPRINT_PLAN_MAX_DIAS } from '../../src/sprints/dto/validators/is-within-sprint-planning-window.validator';
import { ProjectTransactionService } from '../../src/common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../../src/common/project-policy/project-policy.service';
import { ProjectIdResolverService } from '../../src/common/project-policy/project-id-resolver.service';
import { ProjectReadPolicyService } from '../../src/common/project-policy/project-read-policy.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import type { NotificationsService } from '../../src/notifications/notifications.service';

/**
 * Contrato HTTP real de `POST /api/proyectos/:projectId/sprints`: el
 * `ValidationPipe` global, el `JwtAuthGuard`, el `ProjectWriteGuard` y
 * `SprintsService.startSprint` reales contra PostgreSQL. Verifica en el borde
 * lo que las suites unitarias cubren por piezas: la fecha planeada es
 * obligatoria, estrictamente posterior a hoy y a lo sumo 90 días después (en
 * America/Guatemala), y `fechaInicio` nunca la decide el cliente.
 */
describeIntegration('POST /proyectos/:projectId/sprints — contrato de fecha planeada', () => {
  let prisma: PrismaClient;
  let harness: IntegrationHttpHarness;
  let scope: IntegrationCleanupScope;
  let token: string;
  let ruta: string;
  let idProyecto: number;

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    await prisma.$connect();
    const db = prisma as unknown as PrismaService;
    const context = new SprintsContextService(db);
    const service = new SprintsService(
      db,
      context,
      new SprintsAuthorizationService(context),
      // startSprint nunca notifica: solo finalizar y cerrar lo hacen.
      {} as unknown as NotificationsService,
      new ProjectTransactionService(db),
      new ProjectPolicyService(new ProjectIdResolverService(db)),
      new ProjectReadPolicyService(db),
    );
    harness = await startIntegrationHttpHarness({
      prisma,
      controllers: [
        {
          controller: SprintsController,
          deps: [SprintsService],
          handlers: { start: [Number, Object, StartSprintDto] },
        },
      ],
      providers: [{ provide: SprintsService, useValue: service }],
    });
  });

  afterAll(async () => {
    await harness.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const leader = await createIntegrationUser(prisma);
    const project = await createIntegrationProject(prisma, leader.idUsuario, { estadoProyecto: 'EN_PROGRESO' });
    scope = { userIds: [leader.idUsuario], projectIds: [project.idProyecto] };
    idProyecto = project.idProyecto;
    token = accessTokenFor(leader);
    ruta = `${harness.url}/proyectos/${project.idProyecto}/sprints`;
  });

  afterEach(async () => {
    const sprints = await prisma.sprint.findMany({ where: { idProyecto }, select: { idSprint: true } });
    await cleanupIntegrationFixtures(prisma, { ...scope, sprintIds: sprints.map((sprint) => sprint.idSprint) });
  });

  async function expectRechazo(body: unknown): Promise<string[]> {
    const respuesta = await requestJson(ruta, { method: 'POST', token, body });
    expect(respuesta.status).toBe(400);
    expect(await prisma.sprint.count({ where: { idProyecto } })).toBe(0);
    return respuesta.body.message as string[];
  }

  it('sin fechaFinPlaneada → 400 y no crea ningún Sprint', async () => {
    await expectRechazo({});
  });

  it('fechaFinPlaneada null → 400', async () => {
    await expectRechazo({ fechaFinPlaneada: null });
  });

  it('hoy → 400: el plan debe ser estrictamente posterior al día actual', async () => {
    await expectRechazo({ fechaFinPlaneada: plannedEndDate(0) });
  });

  it('una fecha pasada → 400', async () => {
    await expectRechazo({ fechaFinPlaneada: plannedEndDate(-1) });
  });

  it(`más de ${SPRINT_PLAN_MAX_DIAS} días → 400 con el mensaje del tope`, async () => {
    expect(await expectRechazo({ fechaFinPlaneada: plannedEndDate(SPRINT_PLAN_MAX_DIAS + 1) })).toEqual([
      `fechaFinPlaneada no puede superar los ${SPRINT_PLAN_MAX_DIAS} días a partir de hoy`,
    ]);
  });

  it.each([['2026-13-40'], ['10/10/2026'], [`${plannedEndDate()}T00:00:00.000Z`]])(
    'formato inválido %s → 400',
    async (valor) => {
      await expectRechazo({ fechaFinPlaneada: valor });
    },
  );

  it('fechaInicio enviada por el cliente → 400 por propiedad no permitida', async () => {
    expect(await expectRechazo({ fechaFinPlaneada: plannedEndDate(), fechaInicio: plannedEndDate(-3) })).toEqual([
      'property fechaInicio should not exist',
    ]);
  });

  it('sin token → 401, antes de cualquier validación', async () => {
    const respuesta = await requestJson(ruta, { method: 'POST', body: { fechaFinPlaneada: plannedEndDate() } });
    expect(respuesta.status).toBe(401);
    expect(await prisma.sprint.count({ where: { idProyecto } })).toBe(0);
  });

  it('fecha válida → 201: Sprint ACTIVO con la fecha planeada exacta y fechaInicio del servidor', async () => {
    const plan = plannedEndDate(10);
    const antes = Date.now();
    const respuesta = await requestJson(ruta, { method: 'POST', token, body: { fechaFinPlaneada: plan } });
    const despues = Date.now();

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({ idProyecto, numero: 1, estado: 'ACTIVO' });
    expect(respuesta.body.fechaFinPlaneada).toBe(`${plan}T00:00:00.000Z`);

    const fila = await prisma.sprint.findUniqueOrThrow({ where: { idSprint: respuesta.body.idSprint } });
    expect(fila.fechaFinPlaneada?.toISOString()).toBe(`${plan}T00:00:00.000Z`);
    expect(fila.fechaInicio.getTime()).toBeGreaterThanOrEqual(antes - 1000);
    expect(fila.fechaInicio.getTime()).toBeLessThanOrEqual(despues + 1000);
    expect(fila.fechaFinalizacionIniciada).toBeNull();
    expect(fila.fechaCierre).toBeNull();
  });

  it(`exactamente hoy + ${SPRINT_PLAN_MAX_DIAS} días y mañana son los bordes aceptados`, async () => {
    const maximo = await requestJson(ruta, {
      method: 'POST',
      token,
      body: { fechaFinPlaneada: plannedEndDate(SPRINT_PLAN_MAX_DIAS) },
    });
    expect(maximo.status).toBe(201);

    await prisma.sprint.update({ where: { idSprint: maximo.body.idSprint }, data: { estado: 'CERRADO' } });
    const minimo = await requestJson(ruta, { method: 'POST', token, body: { fechaFinPlaneada: plannedEndDate(1) } });
    expect(minimo.status).toBe(201);
    expect(minimo.body.numero).toBe(2);
  });
});
