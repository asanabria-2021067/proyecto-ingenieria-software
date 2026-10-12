import { afterAll, beforeAll, expect, it } from 'vitest';
import { PARAMTYPES_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { PrismaClient, type EstadoProyecto, type EstadoSprint } from '@prisma/client';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import { createIntegrationProject, createIntegrationUser } from './setup/fixtures';
import { cleanupIntegrationFixtures } from './setup/cleanup';
import {
  accessTokenFor,
  requestJson,
  startIntegrationHttpHarness,
  type IntegrationHttpHarness,
} from './setup/http-harness';
import { plannedEndDate } from './setup/sprint-plan';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { AdminSprintsController } from '../../src/sprints/admin-sprints.controller';
import { AdminSprintsCalendarService } from '../../src/sprints/admin-sprints-calendar.service';
import { AdminSprintCalendarQueryDto } from '../../src/sprints/dto/admin-sprint-calendar-query.dto';
import type { AdminSprintCalendarItemDto } from '../../src/sprints/dto/admin-sprint-calendar.dto';
import { SprintsController } from '../../src/sprints/sprints.controller';
import { SprintsService } from '../../src/sprints/sprints.service';
import { SprintsContextService } from '../../src/sprints/sprints-context.service';
import { SprintsAuthorizationService } from '../../src/sprints/sprints-authorization.service';
import { ProjectTransactionService } from '../../src/common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../../src/common/project-policy/project-policy.service';
import { ProjectIdResolverService } from '../../src/common/project-policy/project-id-resolver.service';
import { ProjectReadPolicyService } from '../../src/common/project-policy/project-read-policy.service';
import { todayInGuatemala } from '../../src/common/utils/guatemala-date';
import { PrismaService } from '../../src/prisma/prisma.service';
import type { NotificationsService } from '../../src/notifications/notifications.service';

/**
 * `GET /api/admin/sprints/calendario` de punta a punta contra PostgreSQL:
 * `JwtAuthGuard`, `ValidationPipe`, controlador y servicio reales.
 *
 * Cubre quién puede leerlo (solo un administrador validado en BD), qué
 * población devuelve (Sprints operables de proyectos PUBLICADO/EN_PROGRESO no
 * eliminados), cómo clasifica cada Sprint y que la respuesta no arrastra nada
 * operativo. La base de integración puede contener filas de otras suites, así
 * que las afirmaciones de población se hacen sobre los proyectos creados aquí.
 */
describeIntegration('GET /admin/sprints/calendario — autorización, población y contrato', () => {
  let prisma: PrismaClient;
  /** Cliente propio del servicio bajo prueba, para contar sus sentencias SQL. */
  let observado: PrismaClient;
  const consultas: string[] = [];
  let harness: IntegrationHttpHarness;
  let ruta: string;

  let adminToken: string;
  let estudianteToken: string;
  let liderToken: string;
  let liderCorreo: string;
  let liderId: number;

  const userIds: number[] = [];
  const projectIds: number[] = [];
  const sprintIds: number[] = [];
  /** Etiqueta del escenario → ids creados. */
  const escenario: Record<string, { idProyecto: number; idSprint: number }> = {};

  function plan(daysFromToday: number): Date {
    return new Date(`${plannedEndDate(daysFromToday)}T00:00:00.000Z`);
  }

  async function crear(
    etiqueta: string,
    estadoProyecto: EstadoProyecto,
    sprint: {
      estado: EstadoSprint;
      fechaFinPlaneada: Date | null;
      fechaFinalizacionIniciada?: Date;
      fechaCierre?: Date;
      numero?: number;
    },
    proyecto: { eliminado?: boolean } = {},
  ) {
    const project = await createIntegrationProject(prisma, liderId, {
      estadoProyecto,
      tituloProyecto: `Calendario ${etiqueta}`,
    });
    projectIds.push(project.idProyecto);
    if (proyecto.eliminado) {
      await prisma.proyecto.update({ where: { idProyecto: project.idProyecto }, data: { eliminadoEn: new Date() } });
    }
    const creado = await prisma.sprint.create({
      data: { idProyecto: project.idProyecto, numero: sprint.numero ?? 1, ...sprint },
    });
    sprintIds.push(creado.idSprint);
    escenario[etiqueta] = { idProyecto: project.idProyecto, idSprint: creado.idSprint };
    return escenario[etiqueta];
  }

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    await prisma.$connect();
    observado = new PrismaClient({
      datasources: { db: { url: process.env.INTEGRATION_DATABASE_URL } },
      log: [{ emit: 'event', level: 'query' }],
    });
    (observado as unknown as { $on: (event: 'query', cb: (e: { query: string }) => void) => void }).$on(
      'query',
      (event) => consultas.push(event.query),
    );
    await observado.$connect();

    const admin = await createIntegrationUser(prisma);
    const estudiante = await createIntegrationUser(prisma);
    const lider = await createIntegrationUser(prisma, { nombre: 'Lidia', apellido: 'Líder' });
    userIds.push(admin.idUsuario, estudiante.idUsuario, lider.idUsuario);
    liderId = lider.idUsuario;
    liderCorreo = lider.correo;
    const rol = await prisma.rolAcceso.upsert({
      where: { nombrePerfil: 'administrador' },
      update: {},
      create: { nombrePerfil: 'administrador' },
    });
    await prisma.usuarioRolAcceso.create({ data: { idUsuario: admin.idUsuario, idRolAcceso: rol.idRolAcceso } });
    adminToken = accessTokenFor(admin);
    estudianteToken = accessTokenFor(estudiante);
    liderToken = accessTokenFor(lider);

    // ── Incluidos: Sprint operable en proyecto activo, uno por situación.
    await crear('enCurso', 'PUBLICADO', { estado: 'ACTIVO', fechaFinPlaneada: plan(3) });
    const venceHoy = await crear('venceHoy', 'EN_PROGRESO', { estado: 'ACTIVO', fechaFinPlaneada: plan(0), numero: 2 });
    await crear('vencido', 'EN_PROGRESO', { estado: 'ACTIVO', fechaFinPlaneada: plan(-5) });
    await crear('finalizando', 'EN_PROGRESO', {
      estado: 'EN_FINALIZACION',
      fechaFinPlaneada: plan(-2),
      // Mediodía de Guatemala de ayer: un día después del plan.
      fechaFinalizacionIniciada: new Date(`${plannedEndDate(-1)}T18:00:00.000Z`),
    });
    await crear('sinFecha', 'PUBLICADO', { estado: 'ACTIVO', fechaFinPlaneada: null });

    // ── Excluidos por el Sprint: cerrado, aunque el proyecto esté activo.
    const cerradoPrevio = await prisma.sprint.create({
      data: {
        idProyecto: venceHoy.idProyecto,
        numero: 1,
        estado: 'CERRADO',
        fechaFinPlaneada: plan(-20),
        fechaFinalizacionIniciada: new Date(`${plannedEndDate(-20)}T18:00:00.000Z`),
        fechaCierre: new Date(`${plannedEndDate(-19)}T18:00:00.000Z`),
      },
    });
    sprintIds.push(cerradoPrevio.idSprint);
    escenario.sprintCerradoPrevio = { idProyecto: venceHoy.idProyecto, idSprint: cerradoPrevio.idSprint };
    await crear('soloCerrado', 'EN_PROGRESO', {
      estado: 'CERRADO',
      fechaFinPlaneada: plan(-10),
      fechaFinalizacionIniciada: new Date(`${plannedEndDate(-10)}T18:00:00.000Z`),
      fechaCierre: new Date(`${plannedEndDate(-9)}T18:00:00.000Z`),
    });

    // ── Excluidos por el proyecto, aunque su Sprint sea operable.
    await crear('observado', 'OBSERVADO', { estado: 'ACTIVO', fechaFinPlaneada: plan(4) });
    await crear('solicitudCierre', 'EN_SOLICITUD_CIERRE', { estado: 'ACTIVO', fechaFinPlaneada: plan(4) });
    await crear('proyectoCerrado', 'CERRADO', { estado: 'ACTIVO', fechaFinPlaneada: plan(4) });
    await crear('eliminado', 'EN_PROGRESO', { estado: 'ACTIVO', fechaFinPlaneada: plan(4) }, { eliminado: true });

    const db = prisma as unknown as PrismaService;
    const context = new SprintsContextService(db);
    const sprintsService = new SprintsService(
      db,
      context,
      new SprintsAuthorizationService(context),
      {} as unknown as NotificationsService,
      new ProjectTransactionService(db),
      new ProjectPolicyService(new ProjectIdResolverService(db)),
      new ProjectReadPolicyService(db),
    );
    const observadoDb = observado as unknown as PrismaService;
    const calendar = new AdminSprintsCalendarService(
      observadoDb,
      new ProjectPolicyService(new ProjectIdResolverService(observadoDb)),
    );
    // Lo que `emitDecoratorMetadata` genera en el build real.
    Reflect.defineMetadata(PARAMTYPES_METADATA, [Reflector, PrismaService], RolesGuard);
    harness = await startIntegrationHttpHarness({
      prisma,
      controllers: [
        {
          controller: AdminSprintsController,
          deps: [AdminSprintsCalendarService],
          handlers: { getCalendario: [Object, AdminSprintCalendarQueryDto] },
        },
        { controller: SprintsController, deps: [SprintsService] },
      ],
      providers: [
        { provide: AdminSprintsCalendarService, useValue: calendar },
        { provide: SprintsService, useValue: sprintsService },
      ],
    });
    ruta = `${harness.url}/admin/sprints/calendario`;
  });

  afterAll(async () => {
    await harness?.close();
    await prisma.usuarioRolAcceso.deleteMany({ where: { idUsuario: { in: userIds } } });
    await cleanupIntegrationFixtures(prisma, { sprintIds, projectIds, userIds });
    await observado.$disconnect();
    await prisma.$disconnect();
  });

  /** Items de la respuesta que pertenecen a los proyectos de esta suite. */
  function propios(items: AdminSprintCalendarItemDto[]): AdminSprintCalendarItemDto[] {
    return items.filter((item) => projectIds.includes(item.idProyecto));
  }

  function itemDe(items: AdminSprintCalendarItemDto[], etiqueta: string): AdminSprintCalendarItemDto | undefined {
    return items.find((item) => item.idSprint === escenario[etiqueta].idSprint);
  }

  it('ADMIN → 200 con hoy, items, conteos y resumen', async () => {
    const respuesta = await requestJson(ruta, { token: adminToken });

    expect(respuesta.status).toBe(200);
    expect(Object.keys(respuesta.body).sort()).toEqual(['conteos', 'hoy', 'items', 'resumen']);
    expect(respuesta.body.hoy).toBe(todayInGuatemala());
    expect(Object.keys(respuesta.body.conteos).sort()).toEqual(
      ['EN_CURSO', 'EN_FINALIZACION', 'PLAN_VENCIDO', 'SIN_FECHA', 'VENCE_HOY'].sort(),
    );
    expect(Object.keys(respuesta.body.resumen).sort()).toEqual(['planVencido', 'proximos7Dias']);
  });

  it('ESTUDIANTE → 403', async () => {
    const respuesta = await requestJson(ruta, { token: estudianteToken });
    expect(respuesta.status).toBe(403);
    expect(respuesta.body.items).toBeUndefined();
  });

  it('LÍDER sin perfil administrador → 403, aunque todos los proyectos sean suyos', async () => {
    const respuesta = await requestJson(ruta, { token: liderToken });
    expect(respuesta.status).toBe(403);
    expect(respuesta.body.items).toBeUndefined();
  });

  it('sin autenticación → 401', async () => {
    expect((await requestJson(ruta)).status).toBe(401);
  });

  it('un token mal firmado → 401', async () => {
    expect((await requestJson(ruta, { token: `${adminToken}x` })).status).toBe(401);
  });

  it.each([['foo=bar'], ['desde=2026-10-01&hasta=2026-10-31'], ['q=tutorias'], ['incluirCerrados=true'], ['actorId=1']])(
    'el endpoint no acepta parámetros: ?%s → 400',
    async (query) => {
      const respuesta = await requestJson(`${ruta}?${query}`, { token: adminToken });
      expect(respuesta.status).toBe(400);
    },
  );

  it.each([['foo=bar'], ['desde=2026-10-01&hasta=2026-10-31'], ['actorId=1']])(
    'quien no es administrador recibe 403 aunque la consulta sea inválida: ?%s (nunca un 400)',
    async (query) => {
      for (const token of [estudianteToken, liderToken]) {
        const respuesta = await requestJson(`${ruta}?${query}`, { token });
        expect(respuesta.status).toBe(403);
        expect(respuesta.body.items).toBeUndefined();
      }
      expect((await requestJson(`${ruta}?${query}`)).status).toBe(401);
    },
  );

  it('incluye solo Sprints operables de proyectos PUBLICADO/EN_PROGRESO no eliminados', async () => {
    const { body } = await requestJson(ruta, { token: adminToken });
    const items = propios(body.items);

    expect(items.map((item) => item.idSprint).sort()).toEqual(
      ['enCurso', 'venceHoy', 'vencido', 'finalizando', 'sinFecha'].map((etiqueta) => escenario[etiqueta].idSprint).sort(),
    );
    for (const excluido of [
      'sprintCerradoPrevio',
      'soloCerrado',
      'observado',
      'solicitudCierre',
      'proyectoCerrado',
      'eliminado',
    ]) {
      expect(itemDe(body.items, excluido), excluido).toBeUndefined();
    }
    // Población global, no solo la de esta suite: ningún Sprint cerrado viaja.
    expect((body.items as AdminSprintCalendarItemDto[]).every((item) => item.estado !== 'CERRADO')).toBe(true);
  });

  it('clasifica cada Sprint con su situación, días restantes y desviación', async () => {
    const { body } = await requestJson(ruta, { token: adminToken });

    expect(itemDe(body.items, 'enCurso')).toMatchObject({
      estado: 'ACTIVO',
      situacion: 'EN_CURSO',
      fechaFinPlaneada: plannedEndDate(3),
      diasRestantes: 3,
      desviacionDias: null,
    });
    expect(itemDe(body.items, 'venceHoy')).toMatchObject({
      numero: 2,
      situacion: 'VENCE_HOY',
      fechaFinPlaneada: plannedEndDate(0),
      diasRestantes: 0,
    });
    expect(itemDe(body.items, 'vencido')).toMatchObject({
      situacion: 'PLAN_VENCIDO',
      fechaFinPlaneada: plannedEndDate(-5),
      diasRestantes: -5,
    });
    expect(itemDe(body.items, 'finalizando')).toMatchObject({
      estado: 'EN_FINALIZACION',
      situacion: 'EN_FINALIZACION',
      fechaFinPlaneada: plannedEndDate(-2),
      fechaFinalizacionIniciada: `${plannedEndDate(-1)}T18:00:00.000Z`,
      diasRestantes: -2,
      desviacionDias: 1,
    });
    expect(itemDe(body.items, 'sinFecha')).toMatchObject({
      situacion: 'SIN_FECHA',
      fechaFinPlaneada: null,
      diasRestantes: null,
      desviacionDias: null,
    });
  });

  it('ordena por atención: vencidos, vence hoy, en curso, en finalización y sin fecha al final', async () => {
    const { body } = await requestJson(ruta, { token: adminToken });
    const orden = ['PLAN_VENCIDO', 'VENCE_HOY', 'EN_CURSO', 'EN_FINALIZACION', 'SIN_FECHA'];
    const rangos = (body.items as AdminSprintCalendarItemDto[]).map((item) => orden.indexOf(item.situacion));

    expect(rangos).toEqual([...rangos].sort((a, b) => a - b));
    expect(propios(body.items).map((item) => item.situacion)).toEqual(orden);
  });

  it('conteos y resumen cuadran con los items devueltos', async () => {
    const { body } = await requestJson(ruta, { token: adminToken });
    const items = body.items as AdminSprintCalendarItemDto[];
    const contar = (situacion: string) => items.filter((item) => item.situacion === situacion).length;

    expect(body.conteos).toEqual({
      EN_CURSO: contar('EN_CURSO'),
      VENCE_HOY: contar('VENCE_HOY'),
      PLAN_VENCIDO: contar('PLAN_VENCIDO'),
      EN_FINALIZACION: contar('EN_FINALIZACION'),
      SIN_FECHA: contar('SIN_FECHA'),
    });
    expect(body.resumen.planVencido).toBe(contar('PLAN_VENCIDO'));
    expect(body.resumen.proximos7Dias).toBe(
      items.filter(
        (item) => item.estado === 'ACTIVO' && item.diasRestantes !== null && item.diasRestantes >= 0 && item.diasRestantes <= 7,
      ).length,
    );
    // De esta suite: enCurso (+3) y venceHoy (0) son próximos; `finalizando` no cuenta en ninguno.
    expect(body.resumen.proximos7Dias).toBeGreaterThanOrEqual(2);
    expect(body.resumen.planVencido).toBeGreaterThanOrEqual(1);
  });

  it('expone únicamente metadata temporal: sin tareas, horas, miembros, cierre ni correo', async () => {
    const { body } = await requestJson(ruta, { token: adminToken });
    const item = itemDe(body.items, 'enCurso')!;

    expect(Object.keys(item).sort()).toEqual(
      [
        'desviacionDias',
        'diasRestantes',
        'estado',
        'fechaCierre',
        'fechaFinPlaneada',
        'fechaFinalizacionIniciada',
        'fechaInicio',
        'idProyecto',
        'idSprint',
        'lider',
        'numero',
        'situacion',
        'tituloProyecto',
      ].sort(),
    );
    expect(item.lider).toEqual({ idUsuario: liderId, nombre: 'Lidia', apellido: 'Líder' });
    expect(item.fechaFinPlaneada).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(item.fechaInicio).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    // Sobre los items de esta suite: títulos de otras suites no deben influir.
    const crudo = JSON.stringify(propios(body.items));
    expect(crudo).not.toContain(liderCorreo);
    expect(crudo).not.toMatch(
      /correo|contrasena|fotoUrl|tareas|hitos|horas|miembros|participacion|instantaneas|cerradoPor|PlanificadasCierre|CompletadasCierre|porcentajeCumplimiento/i,
    );
  });

  it('usa dos operaciones Prisma y un número fijo de sentencias SQL, sin N+1 por proyecto', async () => {
    consultas.length = 0;
    await requestJson(ruta, { token: adminToken });
    const conPoblacionActual = consultas.filter((sql) => /^\s*SELECT/i.test(sql));

    // Operación 1: verificación de administrador. Operación 2: el findMany de
    // Sprints, que Prisma resuelve con una sentencia por nivel de relación
    // (sprint, proyecto, usuario), no una por fila.
    expect(conPoblacionActual.filter((sql) => /"usuario_rol_acceso"/.test(sql))).toHaveLength(1);
    expect(conPoblacionActual.filter((sql) => /FROM "public"\."sprint"/.test(sql))).toHaveLength(1);
    expect(conPoblacionActual.length).toBeLessThanOrEqual(4);
    expect(conPoblacionActual.some((sql) => /"tarea"|"horas_participacion"|"instantanea_sprint"/.test(sql))).toBe(false);

    // Con cinco proyectos activos más, el número de sentencias no cambia.
    const extraProjects: number[] = [];
    const extraSprints: number[] = [];
    try {
      for (let i = 0; i < 5; i += 1) {
        const project = await createIntegrationProject(prisma, liderId, { estadoProyecto: 'EN_PROGRESO' });
        extraProjects.push(project.idProyecto);
        const sprint = await prisma.sprint.create({
          data: { idProyecto: project.idProyecto, numero: 1, estado: 'ACTIVO', fechaFinPlaneada: plan(10 + i) },
        });
        extraSprints.push(sprint.idSprint);
      }
      consultas.length = 0;
      const { body } = await requestJson(ruta, { token: adminToken });
      expect(body.items.filter((item: AdminSprintCalendarItemDto) => extraProjects.includes(item.idProyecto))).toHaveLength(5);
      expect(consultas.filter((sql) => /^\s*SELECT/i.test(sql))).toHaveLength(conPoblacionActual.length);
    } finally {
      await cleanupIntegrationFixtures(prisma, { sprintIds: extraSprints, projectIds: extraProjects });
    }
  });

  it('ver el calendario no abre el detalle del Sprint: el administrador sigue recibiendo 403 en el detalle operativo', async () => {
    const { idProyecto, idSprint } = escenario.enCurso;
    const base = `${harness.url}/proyectos/${idProyecto}/sprints`;

    expect((await requestJson(`${base}/${idSprint}`, { token: adminToken })).status).toBe(403);
    expect((await requestJson(`${base}/${idSprint}/burndown`, { token: adminToken })).status).toBe(403);
    expect((await requestJson(`${base}/${idSprint}/resumen-cierre`, { token: adminToken })).status).toBe(403);
    expect((await requestJson(base, { token: adminToken })).status).toBe(403);
  });
});
