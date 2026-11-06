import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PARAMTYPES_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import type { PrismaClient } from '@prisma/client';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import { createIntegrationParticipation, createIntegrationProject, createIntegrationProjectRole, createIntegrationSprint, createIntegrationUser } from './setup/fixtures';
import { accessTokenFor, requestJson, startIntegrationHttpHarness, type IntegrationHttpHarness } from './setup/http-harness';
import { cleanupLeadershipFixture, collectInto, createIntegrationAdmin, type LeadershipCleanupScope } from './setup/leadership';
import { cleanupClosureLifecycle, closureLifecycleStack, closureReadyFixture } from './setup/closure-lifecycle';
import type { ClosureCleanupScope } from './setup/closure-storage';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { PrismaService } from '../../src/prisma/prisma.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import type { NotificationsGateway } from '../../src/notifications/notifications.gateway';
import { ProjectReadPolicyService } from '../../src/common/project-policy/project-read-policy.service';
import { AdminController } from '../../src/admin/admin.controller';
import { AdminService } from '../../src/admin/admin.service';
import { AdminEntidadesService } from '../../src/admin/admin-entidades.service';
import { AdminAssociationsController } from '../../src/associations/admin-associations.controller';
import { AssociationsService } from '../../src/associations/associations.service';
import { AdminProjectsController } from '../../src/project-closure/admin-projects.controller';
import type { Cache } from 'cache-manager';
import { ProjectsController } from '../../src/projects/projects.controller';
import { ProjectsService } from '../../src/projects/projects.service';
import { SocialService } from '../../src/social/social.service';
import { ProjectTransactionService } from '../../src/common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../../src/common/project-policy/project-policy.service';
import { ProjectIdResolverService } from '../../src/common/project-policy/project-id-resolver.service';
import { HistoricalProjectReadService } from '../../src/project-closure/historical-project-read.service';
import { ProjectClosureController } from '../../src/project-closure/project-closure.controller';
import { ProjectClosureService } from '../../src/project-closure/project-closure.service';
import { ProjectCloseReadinessService } from '../../src/project-closure/project-close-readiness.service';
import { ProjectClosureReviewService } from '../../src/project-closure/project-closure-review.service';
import { ProjectClosureReportService } from '../../src/project-closure/project-closure-report.service';
import { ApproveClosureDto, CorrectionDto, ReturnExecutionDto } from '../../src/project-closure/dto/closure.dto';
import { historicalStack } from './setup/historical-read';
import { MensajesRevisionController } from '../../src/mensajes-revision/mensajes-revision.controller';
import { MensajesRevisionService } from '../../src/mensajes-revision/mensajes-revision.service';
import { RevisionesController } from '../../src/revisiones/revisiones.controller';
import { RevisionesService } from '../../src/revisiones/revisiones.service';
import { ResolverRevisionDto } from '../../src/revisiones/dto/resolver-revision.dto';
import { AdminHorasSemestreController } from '../../src/horas-semestre/admin-horas-semestre.controller';
import { HorasSemestreService } from '../../src/horas-semestre/horas-semestre.service';
import { HorasCentralListQueryDto, HorasCentralQueryDto } from '../../src/horas-semestre/dto/horas-central-query.dto';
import { AdminCoordinadoresController, CoordinadorController } from '../../src/coordinador/coordinador.controller';
import { CoordinadorService } from '../../src/coordinador/coordinador.service';
import { GuardarAlcanceDto } from '../../src/coordinador/dto/alcance-coordinador.dto';
import { AdminSprintsController } from '../../src/sprints/admin-sprints.controller';
import { AdminSprintsCalendarService } from '../../src/sprints/admin-sprints-calendar.service';
import { AdminSprintCalendarQueryDto } from '../../src/sprints/dto/admin-sprint-calendar-query.dto';
import type { JwtService } from '@nestjs/jwt';

interface Scope extends LeadershipCleanupScope {
  carreraIds?: number[];
  revisionPublicacionIds?: number[];
}

describeIntegration('ROL-1 coordinador académico: alcance por carrera (PostgreSQL real, HTTP)', () => {
  let db: PrismaClient;
  let http: IntegrationHttpHarness;
  const scope: Scope = {};
  const sufijo = randomUUID().slice(0, 8);
  const tokens = { admin: '', coord: '', estudiante: '', vacio: '' };
  const f = {} as {
    carreraA: number;
    carreraB: number;
    coord: number;
    estudiante: number;
    sA: { idUsuario: number; carne: string };
    sB: { idUsuario: number; carne: string };
    pubA: number;
    pubB: number;
    cierreA: { idProyecto: number; idRevision: number };
    cierreB: { idProyecto: number; idRevision: number };
    cierreSinEntregaA: number;
    admin: number;
    pubPropia: number;
    cierrePropio: { idProyecto: number; idRevision: number };
    pubParticipa: number;
    vacio: number;
  };

  const get = (ruta: string, token: string) => requestJson(`${http.url}${ruta}`, { token });
  const post = (ruta: string, token: string, body: unknown) => requestJson(`${http.url}${ruta}`, { method: 'POST', token, body });
  const put = (ruta: string, token: string, body: unknown) => requestJson(`${http.url}${ruta}`, { method: 'PUT', token, body });

  async function estudiante(idCarrera: number, etiqueta: string) {
    const u = await createIntegrationUser(db);
    collectInto(scope, 'userIds', [u.idUsuario]);
    const carne = `rol1-${etiqueta}-${sufijo}`;
    await db.perfilEstudiante.create({ data: { idUsuario: u.idUsuario, carne, idCarrera } });
    return { ...u, carne };
  }

  async function proyectoEnRevision(lider: number, idCarrera?: number) {
    const p = await createIntegrationProject(db, lider, { estadoProyecto: 'EN_REVISION' });
    if (idCarrera) await db.proyecto.update({ where: { idProyecto: p.idProyecto }, data: { idCarrera } });
    collectInto(scope, 'projectIds', [p.idProyecto]);
    const r = await db.revisionProyecto.create({ data: { idProyecto: p.idProyecto, numeroEnvio: 1 } });
    scope.revisionPublicacionIds = [...(scope.revisionPublicacionIds ?? []), r.idRevisionProyecto];
    return p.idProyecto;
  }

  async function proyectoEnCierre(lider: number, idCarrera?: number) {
    const p = await createIntegrationProject(db, lider, { estadoProyecto: 'EN_SOLICITUD_CIERRE' });
    if (idCarrera) await db.proyecto.update({ where: { idProyecto: p.idProyecto }, data: { idCarrera } });
    collectInto(scope, 'projectIds', [p.idProyecto]);
    const r = await db.revisionCierreProyecto.create({
      data: { idProyecto: p.idProyecto, numeroRevision: 1, estadoRevision: 'ENVIADA', enviadaEn: new Date(), fingerprintEntrega: 'a'.repeat(64), idSolicitante: lider },
    });
    return { idProyecto: p.idProyecto, idRevision: r.idRevisionCierre };
  }

  /** EN_SOLICITUD_CIERRE sin ninguna entrega ENVIADA (p. ej. legacy): cuenta y se lista, solo se consulta. */
  async function proyectoEnCierreSinEntrega(lider: number) {
    const p = await createIntegrationProject(db, lider, { estadoProyecto: 'EN_SOLICITUD_CIERRE' });
    collectInto(scope, 'projectIds', [p.idProyecto]);
    return p.idProyecto;
  }

  beforeAll(async () => {
    db = createIntegrationPrismaClient();
    await db.$connect();
    const facultad = `Facultad ROL1 ${sufijo}`;
    const a = await db.carrera.create({ data: { nombreCarrera: `Carrera A ${sufijo}`, facultad } });
    const b = await db.carrera.create({ data: { nombreCarrera: `Carrera B ${sufijo}`, facultad: `Otra ${sufijo}` } });
    scope.carreraIds = [a.idCarrera, b.idCarrera];
    f.carreraA = a.idCarrera;
    f.carreraB = b.idCarrera;

    const admin = await createIntegrationAdmin(db, scope);
    f.admin = admin.idUsuario;
    const coord = await createIntegrationUser(db);
    const plano = await createIntegrationUser(db);
    collectInto(scope, 'userIds', [coord.idUsuario, plano.idUsuario]);
    const rol = await db.rolAcceso.upsert({ where: { nombrePerfil: 'coordinador_academico' }, update: {}, create: { nombrePerfil: 'coordinador_academico' } });
    await db.usuarioRolAcceso.create({ data: { idUsuario: coord.idUsuario, idRolAcceso: rol.idRolAcceso } });
    collectInto(scope, 'accessRoleUserIds', [coord.idUsuario]);
    await db.alcanceCoordinador.create({ data: { idUsuario: coord.idUsuario, idCarrera: a.idCarrera, asignadoPor: admin.idUsuario } });
    f.coord = coord.idUsuario;
    f.estudiante = plano.idUsuario;

    const liderA = await estudiante(a.idCarrera, 'lA');
    const liderB = await estudiante(b.idCarrera, 'lB');
    f.sA = await estudiante(a.idCarrera, 'sA');
    f.sB = await estudiante(b.idCarrera, 'sB');
    f.pubA = await proyectoEnRevision(liderA.idUsuario);
    f.pubB = await proyectoEnRevision(liderB.idUsuario);
    f.cierreA = await proyectoEnCierre(liderA.idUsuario);
    f.cierreB = await proyectoEnCierre(liderB.idUsuario);
    f.cierreSinEntregaA = await proyectoEnCierreSinEntrega(liderA.idUsuario);
    // Proyectos de la carrera A que el propio coordinador lidera o en los que participa.
    f.pubPropia = await proyectoEnRevision(coord.idUsuario, a.idCarrera);
    f.cierrePropio = await proyectoEnCierre(coord.idUsuario, a.idCarrera);
    f.pubParticipa = await proyectoEnRevision(liderA.idUsuario);
    const rolP = await createIntegrationProjectRole(db, f.pubParticipa);
    collectInto(scope, 'roleIds', [rolP.idRolProyecto]);
    const part = await createIntegrationParticipation(db, coord.idUsuario, rolP.idRolProyecto, { estadoParticipacion: 'ACTIVO' });
    collectInto(scope, 'participationIds', [part.idParticipacion]);
    // Coordinador sin ningún alcance asignado.
    const vacio = await createIntegrationUser(db);
    collectInto(scope, 'userIds', [vacio.idUsuario]);
    await db.usuarioRolAcceso.create({ data: { idUsuario: vacio.idUsuario, idRolAcceso: rol.idRolAcceso } });
    collectInto(scope, 'accessRoleUserIds', [vacio.idUsuario]);
    f.vacio = vacio.idUsuario;
    tokens.vacio = accessTokenFor(vacio);

    tokens.admin = accessTokenFor(admin);
    tokens.coord = accessTokenFor(coord);
    tokens.estudiante = accessTokenFor(plano);

    const prisma = db as unknown as PrismaService;
    const stack = closureLifecycleStack(db);
    const gateway = { server: {}, notifyUsers: vi.fn(), emitToUsers: vi.fn() };
    const notifications = new NotificationsService(prisma, gateway as unknown as NotificationsGateway);
    const revisiones = new RevisionesService(prisma, notifications, stack.runner, stack.policy, new ProjectReadPolicyService(prisma));
    const horas = new HorasSemestreService(prisma);
    const coordinador = new CoordinadorService(prisma, notifications);
    const mensajes = new MensajesRevisionService(prisma, notifications, stack.runner, stack.policy, new ProjectReadPolicyService(prisma));
    const historico = historicalStack(db).service;
    const proyectos = new ProjectsService(
      prisma,
      notifications,
      { del: vi.fn() } as unknown as Cache,
      new ProjectTransactionService(prisma),
      new ProjectPolicyService(new ProjectIdResolverService(prisma)),
      new ProjectReadPolicyService(prisma),
      new SocialService(prisma, notifications),
    );

    Reflect.defineMetadata(PARAMTYPES_METADATA, [Reflector, PrismaService], RolesGuard);
    http = await startIntegrationHttpHarness({
      prisma: db,
      controllers: [
        { controller: AdminController, deps: [AdminService, AdminEntidadesService] },
        { controller: AdminAssociationsController, deps: [AssociationsService] },
        { controller: AdminProjectsController, deps: [HistoricalProjectReadService], handlers: { list: [Object, Object], detail: [Number, Object] } },
        { controller: MensajesRevisionController, deps: [MensajesRevisionService] },
        {
          controller: ProjectClosureController,
          deps: [ProjectClosureService, ProjectCloseReadinessService, ProjectClosureReviewService, ProjectClosureReportService],
          handlers: { approve: [Number, Object, ApproveClosureDto], returnToExecution: [Number, Object, ReturnExecutionDto], correction: [Number, Object, CorrectionDto] },
        },
        { controller: RevisionesController, deps: [RevisionesService], handlers: { resolver: [Number, Object, ResolverRevisionDto] } },
        {
          controller: AdminHorasSemestreController,
          deps: [HorasSemestreService],
          handlers: { listar: [Object, HorasCentralListQueryDto], totales: [Object, HorasCentralQueryDto], csv: [Object, HorasCentralQueryDto, Object], pdf: [Object, HorasCentralQueryDto, Object] },
        },
        { controller: AdminCoordinadoresController, deps: [CoordinadorService], handlers: { guardar: [Object, Number, GuardarAlcanceDto] } },
        { controller: CoordinadorController, deps: [CoordinadorService] },
        { controller: ProjectsController, deps: [ProjectsService] },
      ],
      providers: [
        { provide: AdminService, useValue: {} },
        { provide: AdminEntidadesService, useValue: {} },
        { provide: AssociationsService, useValue: {} },
        { provide: HistoricalProjectReadService, useValue: historico },
        { provide: MensajesRevisionService, useValue: mensajes },
        { provide: ProjectClosureService, useValue: stack.closure },
        { provide: ProjectCloseReadinessService, useValue: stack.readiness },
        { provide: ProjectClosureReviewService, useValue: stack.review },
        { provide: ProjectClosureReportService, useValue: stack.report },
        { provide: RevisionesService, useValue: revisiones },
        { provide: HorasSemestreService, useValue: horas },
        { provide: CoordinadorService, useValue: coordinador },
        { provide: ProjectsService, useValue: proyectos },
      ],
    });
  }, 60_000);

  afterAll(async () => {
    await http?.close();
    const proyectos = scope.projectIds ?? [];
    const usuarios = scope.userIds ?? [];
    await db.bitacoraAuditoria.deleteMany({ where: { idUsuario: { in: usuarios } } });
    await db.notificacion.deleteMany({ where: { idUsuario: { in: usuarios } } });
    await db.alcanceCoordinador.deleteMany({ where: { idUsuario: { in: usuarios } } });
    await db.revisionProyecto.deleteMany({ where: { idProyecto: { in: proyectos } } });
    await db.revisionCierreProyecto.deleteMany({ where: { idProyecto: { in: proyectos } } });
    await db.perfilEstudiante.deleteMany({ where: { idUsuario: { in: usuarios } } });
    await cleanupLeadershipFixture(db, scope);
    await db.carrera.deleteMany({ where: { idCarrera: { in: scope.carreraIds ?? [] } } });
    await db.$disconnect();
  });

  describe('lo que NO puede el coordinador', () => {
    it.each([
      '/admin/usuarios',
      '/admin/cuentas-pendientes',
      '/admin/asociaciones',
    ])('GET %s -> 403', async (ruta) => {
      expect((await get(ruta, tokens.coord)).status).toBe(403);
    });

    it('no asigna su propio alcance ni lee el de otro: 403 y no cambia nada', async () => {
      expect((await put(`/admin/coordinadores/${f.coord}/alcance`, tokens.coord, { carreraIds: [f.carreraA, f.carreraB], facultades: [] })).status).toBe(403);
      expect((await get(`/admin/coordinadores/${f.coord}/alcance`, tokens.coord)).status).toBe(403);
      const filas = await db.alcanceCoordinador.findMany({ where: { idUsuario: f.coord } });
      expect(filas.map((x) => x.idCarrera)).toEqual([f.carreraA]);
    });

    it('un estudiante no entra a las rutas del coordinador', async () => {
      expect((await get('/coordinador/mi-alcance', tokens.estudiante)).status).toBe(403);
      expect((await get('/coordinador/pendientes', tokens.estudiante)).status).toBe(403);
      expect((await get('/revisiones/admin/bandeja', tokens.estudiante)).status).toBe(403);
    });

    it('revisar un proyecto de otra carrera -> 403 y el proyecto no cambia', async () => {
      const resolver = await post(`/revisiones/proyectos/${f.pubB}/resolver`, tokens.coord, { resultado: 'APROBADA' });
      expect(resolver.status).toBe(403);
      expect((await post(`/revisiones/proyectos/${f.pubB}/reclamar`, tokens.coord, {})).status).toBe(403);
      expect((await get(`/revisiones/proyectos/${f.pubB}`, tokens.coord)).status).toBe(403);
      const p = await db.proyecto.findUniqueOrThrow({ where: { idProyecto: f.pubB } });
      expect(p.estadoProyecto).toBe('EN_REVISION');
    });

    it('no se revisa a sí mismo: líder o participante de un proyecto de su alcance -> 403, el admin sí puede', async () => {
      expect((await post(`/revisiones/proyectos/${f.pubPropia}/resolver`, tokens.coord, { resultado: 'APROBADA' })).status).toBe(403);
      expect((await post(`/revisiones/proyectos/${f.pubParticipa}/resolver`, tokens.coord, { resultado: 'APROBADA' })).status).toBe(403);
      const { idProyecto, idRevision } = f.cierrePropio;
      expect((await post(`/proyectos/${idProyecto}/aprobar-cierre`, tokens.coord, { revisionId: idRevision, expectedFingerprint: 'a'.repeat(64) })).status).toBe(403);
      expect((await post(`/proyectos/${idProyecto}/rechazar-cierre`, tokens.coord, { revisionId: idRevision, comentario: 'No' })).status).toBe(403);
      expect((await db.proyecto.findUniqueOrThrow({ where: { idProyecto: f.pubPropia } })).estadoProyecto).toBe('EN_REVISION');
      expect((await db.proyecto.findUniqueOrThrow({ where: { idProyecto } })).estadoProyecto).toBe('EN_SOLICITUD_CIERRE');
      const bandeja = await get('/revisiones/admin/bandeja', tokens.coord);
      expect(bandeja.body.revisionesPendientes.map((x: { idProyecto: number }) => x.idProyecto)).not.toContain(f.pubPropia);
      expect((await post(`/revisiones/proyectos/${f.pubPropia}/resolver`, tokens.admin, { resultado: 'APROBADA' })).status).toBe(200);
      expect((await post(`/proyectos/${idProyecto}/rechazar-cierre`, tokens.admin, { revisionId: idRevision, comentario: 'Revisar' })).status).toBe(200);
    });

    it('coordinador sin alcance: listas vacías y 403 en cualquier proyecto', async () => {
      const bandeja = await get('/revisiones/admin/bandeja', tokens.vacio);
      expect(bandeja.status).toBe(200);
      expect(bandeja.body).toEqual({ revisionesPendientes: [], cierresPendientes: [], correccionesEnviadas: [] });
      expect((await get('/coordinador/pendientes', tokens.vacio)).body.total).toBe(0);
      expect((await get('/coordinador/mi-alcance', tokens.vacio)).body.carreras).toEqual([]);
      expect((await get('/admin/horas-semestre', tokens.vacio)).body.filas).toEqual([]);
      expect((await post(`/revisiones/proyectos/${f.pubA}/resolver`, tokens.vacio, { resultado: 'APROBADA' })).status).toBe(403);
      expect((await get(`/revisiones/proyectos/${f.pubA}`, tokens.vacio)).status).toBe(403);
      expect((await post(`/proyectos/${f.cierreA.idProyecto}/rechazar-cierre`, tokens.vacio, { revisionId: f.cierreA.idRevision, comentario: 'No' })).status).toBe(403);
      expect((await get(`/proyectos/${f.cierreA.idProyecto}/cierre/readiness`, tokens.vacio)).status).toBe(403);
      expect((await get(`/mensajes-revision/proyectos/${f.pubA}`, tokens.vacio)).status).toBe(403);
      expect((await get(`/admin/proyectos/${f.pubA}`, tokens.vacio)).status).toBe(403);
    });

    it('lecturas de otra carrera: preparación de cierre, canal de revisión y detalle -> 403', async () => {
      expect((await get(`/proyectos/${f.cierreB.idProyecto}/cierre/readiness?phase=APPROVE`, tokens.coord)).status).toBe(403);
      expect((await get(`/mensajes-revision/proyectos/${f.pubB}`, tokens.coord)).status).toBe(403);
      expect((await get(`/admin/proyectos/${f.pubB}`, tokens.coord)).status).toBe(403);
      expect((await get(`/proyectos/${f.pubB}/admin`, tokens.coord)).status).toBe(403);
    });

    it('GET /proyectos/:id/admin: el coordinador lee el de su carrera, el admin sigue leyendo y el estudiante no', async () => {
      expect((await get(`/proyectos/${f.pubA}/admin`, tokens.coord)).status).toBe(200);
      expect((await get(`/proyectos/${f.pubA}/admin`, tokens.admin)).status).toBe(200);
      expect((await get(`/proyectos/${f.pubA}/admin`, tokens.estudiante)).status).toBe(403);
      expect((await get(`/proyectos/${f.pubPropia}/admin`, tokens.coord)).status).toBe(403);
    });

    it('validar o rechazar un cierre de otra carrera -> 403 y el cierre no cambia', async () => {
      const { idProyecto, idRevision } = f.cierreB;
      expect((await post(`/proyectos/${idProyecto}/aprobar-cierre`, tokens.coord, { revisionId: idRevision, expectedFingerprint: 'a'.repeat(64) })).status).toBe(403);
      expect((await post(`/proyectos/${idProyecto}/rechazar-cierre`, tokens.coord, { revisionId: idRevision, comentario: 'No' })).status).toBe(403);
      expect((await post(`/proyectos/${idProyecto}/cierre/correccion-documental`, tokens.coord, { revisionId: idRevision, comentario: 'No' })).status).toBe(403);
      const p = await db.proyecto.findUniqueOrThrow({ where: { idProyecto } });
      expect(p.estadoProyecto).toBe('EN_SOLICITUD_CIERRE');
      const r = await db.revisionCierreProyecto.findUniqueOrThrow({ where: { idRevisionCierre: idRevision } });
      expect(r.estadoRevision).toBe('ENVIADA');
    });
  });

  describe('lo que SÍ puede dentro de su alcance', () => {
    it('su bandeja y sus pendientes solo traen proyectos de su carrera', async () => {
      const bandeja = await get('/revisiones/admin/bandeja', tokens.coord);
      expect(bandeja.status).toBe(200);
      const ids = (filas: { idProyecto: number }[]) => filas.map((x) => x.idProyecto);
      expect(ids(bandeja.body.revisionesPendientes)).toEqual([f.pubA]);
      expect(ids(bandeja.body.cierresPendientes)).toEqual([f.cierreA.idProyecto]);

      const pendientes = await get('/coordinador/pendientes', tokens.coord);
      expect(pendientes.body).toEqual({
        total: 3,
        items: [
          { clave: 'revisiones', total: 1 },
          { clave: 'cierres', total: 2 },
        ],
      });
    });

    it('la bandeja de cierres trae solo los de su alcance (con y sin entrega) y el contador coincide', async () => {
      const lista = await get('/admin/proyectos?grupo=cierres', tokens.coord);
      expect(lista.status).toBe(200);
      const ids = lista.body.items.map((x: { idProyecto: number }) => x.idProyecto).sort((x: number, y: number) => x - y);
      expect(ids).toEqual([f.cierreA.idProyecto, f.cierreSinEntregaA].sort((x, y) => x - y));
      const sinEntrega = lista.body.items.find((x: { idProyecto: number }) => x.idProyecto === f.cierreSinEntregaA);
      expect(sinEntrega.cierre.situacion).toBe('SIN_ENTREGA_FORMAL');
      expect(ids).not.toContain(f.cierreB.idProyecto);
      expect(ids).not.toContain(f.cierrePropio.idProyecto);

      const pendientes = await get('/coordinador/pendientes', tokens.coord);
      expect(pendientes.body.items.find((i: { clave: string }) => i.clave === 'cierres').total).toBe(lista.body.items.length);
    });

    it('el admin sigue viendo todos los cierres, el coordinador sin alcance ninguno y el estudiante recibe 403', async () => {
      const admin = await get('/admin/proyectos?grupo=cierres', tokens.admin);
      expect(admin.status).toBe(200);
      const idsAdmin = admin.body.items.map((x: { idProyecto: number }) => x.idProyecto);
      expect(idsAdmin).toEqual(expect.arrayContaining([f.cierreA.idProyecto, f.cierreB.idProyecto, f.cierreSinEntregaA]));
      const vacio = await get('/admin/proyectos?grupo=cierres', tokens.vacio);
      expect(vacio.status).toBe(200);
      expect(vacio.body.items).toEqual([]);
      expect((await get('/admin/proyectos?grupo=cierres', tokens.estudiante)).status).toBe(403);
      for (const grupo of ['revision', 'cerrados']) {
        expect((await get(`/admin/proyectos?grupo=${grupo}`, tokens.coord)).status).toBe(200);
        expect((await get(`/admin/proyectos?grupo=${grupo}`, tokens.estudiante)).status).toBe(403);
      }
    });

    it('ve las versiones revisadas de un proyecto de su carrera', async () => {
      const r = await get(`/revisiones/proyectos/${f.pubA}`, tokens.coord);
      expect(r.status).toBe(200);
      expect(r.body).toHaveLength(1);
    });

    it('pide correcciones a un proyecto de su carrera y lo avisa al líder', async () => {
      const r = await post(`/revisiones/proyectos/${f.pubA}/resolver`, tokens.coord, { resultado: 'OBSERVADA', comentario: 'Falta el objetivo' });
      expect(r.status).toBe(200);
      const p = await db.proyecto.findUniqueOrThrow({ where: { idProyecto: f.pubA } });
      expect(p.estadoProyecto).toBe('OBSERVADO');
      const rev = await db.revisionProyecto.findFirstOrThrow({ where: { idProyecto: f.pubA } });
      expect(rev.idRevisor).toBe(f.coord);
    });

    it('devuelve a ejecución un cierre de su carrera', async () => {
      const { idProyecto, idRevision } = f.cierreA;
      const r = await post(`/proyectos/${idProyecto}/rechazar-cierre`, tokens.coord, { revisionId: idRevision, comentario: 'Faltan evidencias' });
      expect(r.status).toBe(200);
      const p = await db.proyecto.findUniqueOrThrow({ where: { idProyecto } });
      expect(p.estadoProyecto).toBe('EN_PROGRESO');
    });

    it('ve las horas solo de los estudiantes de sus carreras, en el listado, los totales y el CSV', async () => {
      const lista = await get(`/admin/horas-semestre?limit=100`, tokens.coord);
      expect(lista.status).toBe(200);
      const carnes = lista.body.filas.map((x: { carne: string }) => x.carne);
      expect(carnes).toContain(f.sA.carne);
      expect(carnes).not.toContain(f.sB.carne);
      expect(lista.body.filas.every((x: { idCarrera: number }) => x.idCarrera === f.carreraA)).toBe(true);

      const ajena = await get(`/admin/horas-semestre?idCarrera=${f.carreraB}`, tokens.coord);
      expect(ajena.body.filas).toEqual([]);

      const totales = await get('/admin/horas-semestre/totales', tokens.coord);
      expect(totales.body.porCarrera.map((x: { idCarrera: number }) => x.idCarrera)).toEqual([f.carreraA]);

      const csv = await requestJson(`${http.url}/admin/horas-semestre/csv`, { token: tokens.coord });
      expect(csv.status).toBe(200);
      expect(String(csv.body)).toContain(f.sA.carne);
      expect(String(csv.body)).not.toContain(f.sB.carne);
    });

    it('lee la preparación del cierre, el canal de revisión y el detalle de un proyecto de su carrera', async () => {
      expect((await get(`/proyectos/${f.cierreA.idProyecto}/cierre/readiness?phase=APPROVE`, tokens.coord)).status).toBe(200);
      expect((await get(`/mensajes-revision/proyectos/${f.pubA}`, tokens.coord)).status).toBe(200);
      expect((await get(`/admin/proyectos/${f.pubA}`, tokens.coord)).status).toBe(200);
      expect((await get(`/admin/proyectos/${f.pubB}`, tokens.admin)).status).toBe(200);
    });

    it('idCarrera ajena no filtra datos de otras carreras en totales, CSV ni PDF', async () => {
      const totales = await get(`/admin/horas-semestre/totales?idCarrera=${f.carreraB}`, tokens.coord);
      expect(totales.body.porCarrera).toEqual([]);
      const csv = await requestJson(`${http.url}/admin/horas-semestre/csv?idCarrera=${f.carreraB}`, { token: tokens.coord });
      expect(csv.status).toBe(200);
      expect(String(csv.body)).not.toContain(f.sB.carne);
      expect(String(csv.body)).not.toContain(f.sA.carne);
      const pdf = await fetch(`${http.url}/admin/horas-semestre/pdf`, { headers: { authorization: `Bearer ${tokens.coord}` } });
      expect(pdf.status).toBe(200);
      expect(pdf.headers.get('content-type')).toContain('application/pdf');
    });

    it('en riesgo respeta el alcance', async () => {
      const r = await get('/admin/horas-semestre?enRiesgo=true', tokens.coord);
      expect(r.status).toBe(200);
      expect(r.body.filas.every((x: { idCarrera: number }) => x.idCarrera === f.carreraA)).toBe(true);
    });

    it('mi-alcance entrega sus carreras y la regla de ayuda', async () => {
      const r = await get('/coordinador/mi-alcance', tokens.coord);
      expect(r.status).toBe(200);
      expect(r.body.todas).toBe(false);
      expect(r.body.carreras.map((c: { idCarrera: number }) => c.idCarrera)).toEqual([f.carreraA]);
      expect(typeof r.body.regla).toBe('string');
    });
  });

  describe('el administrador sigue pudiendo todo', () => {
    it('ve todas las carreras en la bandeja y en horas', async () => {
      const bandeja = await get('/revisiones/admin/bandeja', tokens.admin);
      expect(bandeja.status).toBe(200);
      expect(bandeja.body.revisionesPendientes.map((x: { idProyecto: number }) => x.idProyecto)).toContain(f.pubB);
      expect(bandeja.body.cierresPendientes.map((x: { idProyecto: number }) => x.idProyecto)).toContain(f.cierreB.idProyecto);
      const horasB = await get(`/admin/horas-semestre?idCarrera=${f.carreraB}`, tokens.admin);
      const carnesB = horasB.body.filas.map((x: { carne: string }) => x.carne);
      expect(carnesB).toContain(f.sB.carne);
      expect(carnesB).not.toContain(f.sA.carne);
      expect((await get('/admin/horas-semestre/comparativo', tokens.admin)).status).toBe(200);
      expect((await get('/coordinador/pendientes', tokens.admin)).status).toBe(200);
    });

    it('resuelve la revisión y devuelve el cierre de una carrera cualquiera', async () => {
      expect((await post(`/revisiones/proyectos/${f.pubB}/resolver`, tokens.admin, { resultado: 'APROBADA' })).status).toBe(200);
      expect((await post(`/proyectos/${f.cierreB.idProyecto}/rechazar-cierre`, tokens.admin, { revisionId: f.cierreB.idRevision, comentario: 'Revisar' })).status).toBe(200);
    });
  });

  describe('asignación del alcance (solo administrador)', () => {
    it('guarda carreras y facultad, deja bitácora y avisa al coordinador', async () => {
      const facultad = (await db.carrera.findUniqueOrThrow({ where: { idCarrera: f.carreraA } })).facultad!;
      const r = await put(`/admin/coordinadores/${f.coord}/alcance`, tokens.admin, { carreraIds: [f.carreraB], facultades: [facultad] });
      expect(r.status).toBe(200);
      expect(r.body.carreras.map((c: { idCarrera: number }) => c.idCarrera).sort()).toEqual([f.carreraA, f.carreraB].sort());
      const bitacora = await db.bitacoraAuditoria.findMany({ where: { accion: 'COORDINADOR_ALCANCE_ASIGNADO', idObjeto: String(f.coord) } });
      expect(bitacora).toHaveLength(1);
      expect(bitacora[0].idUsuario).toBe(f.admin);
      const avisos = await db.notificacion.count({ where: { idUsuario: f.coord, tipoNotificacion: 'ALCANCE_COORDINADOR' } });
      expect(avisos).toBe(1);

      const leido = await get(`/admin/coordinadores/${f.coord}/alcance`, tokens.admin);
      expect(leido.body.carreraIds).toEqual([f.carreraB]);
      expect(leido.body.facultades).toEqual([facultad]);
    });

    it('guardar lo mismo no duplica bitácora ni avisos', async () => {
      const facultad = (await db.carrera.findUniqueOrThrow({ where: { idCarrera: f.carreraA } })).facultad!;
      await put(`/admin/coordinadores/${f.coord}/alcance`, tokens.admin, { carreraIds: [f.carreraB], facultades: [facultad] });
      expect(await db.bitacoraAuditoria.count({ where: { accion: 'COORDINADOR_ALCANCE_ASIGNADO', idObjeto: String(f.coord) } })).toBe(1);
    });

    it('solo un usuario con el rol coordinador puede tener alcance', async () => {
      const r = await put(`/admin/coordinadores/${f.estudiante}/alcance`, tokens.admin, { carreraIds: [f.carreraA], facultades: [] });
      expect(r.status).toBe(400);
      expect(await db.alcanceCoordinador.count({ where: { idUsuario: f.estudiante } })).toBe(0);
    });

    it('rechaza carreras o facultades inexistentes', async () => {
      expect((await put(`/admin/coordinadores/${f.coord}/alcance`, tokens.admin, { carreraIds: [2147483000], facultades: [] })).status).toBe(400);
      expect((await put(`/admin/coordinadores/${f.coord}/alcance`, tokens.admin, { carreraIds: [], facultades: ['No existe'] })).status).toBe(400);
    });
  });
});

describeIntegration('ROL-1 el coordinador aprueba el cierre de su alcance y se acreditan las horas (PostgreSQL real, HTTP)', () => {
  let db: PrismaClient;
  let http: IntegrationHttpHarness;
  let scope: ClosureCleanupScope;
  let carreraId: number;

  beforeAll(async () => {
    db = createIntegrationPrismaClient();
    await db.$connect();
    scope = {};
  });

  afterAll(async () => {
    await http?.close();
    await db.alcanceCoordinador.deleteMany({ where: { idUsuario: { in: scope.userIds ?? [] } } });
    await cleanupClosureLifecycle(db, scope);
    if (carreraId) await db.carrera.deleteMany({ where: { idCarrera: carreraId } });
    await db.$disconnect();
  });

  it('aprobar-cierre del coordinador cierra el proyecto y deja las horas APROBADAS', async () => {
    const f = await closureReadyFixture(db, scope);
    const carrera = await db.carrera.create({ data: { nombreCarrera: `Carrera cierre ${randomUUID().slice(0, 8)}` } });
    carreraId = carrera.idCarrera;
    await db.proyecto.update({ where: { idProyecto: f.project.idProyecto }, data: { idCarrera: carrera.idCarrera } });

    const coord = await createIntegrationUser(db);
    scope.userIds = [...(scope.userIds ?? []), coord.idUsuario];
    const rol = await db.rolAcceso.upsert({ where: { nombrePerfil: 'coordinador_academico' }, update: {}, create: { nombrePerfil: 'coordinador_academico' } });
    await db.usuarioRolAcceso.create({ data: { idUsuario: coord.idUsuario, idRolAcceso: rol.idRolAcceso } });
    scope.accessRoleUserIds = [...(scope.accessRoleUserIds ?? []), coord.idUsuario];
    await db.alcanceCoordinador.create({ data: { idUsuario: coord.idUsuario, idCarrera: carrera.idCarrera } });

    const submitted = await f.stack.closure.requestClose(f.project.idProyecto, f.leader.idUsuario, f.dto);
    expect(await db.horasParticipacion.count({ where: { participacion: { rolProyecto: { idProyecto: f.project.idProyecto } }, estadoHoras: 'PENDIENTE' } })).toBeGreaterThan(0);

    Reflect.defineMetadata(PARAMTYPES_METADATA, [Reflector, PrismaService], RolesGuard);
    http = await startIntegrationHttpHarness({
      prisma: db,
      controllers: [
        {
          controller: ProjectClosureController,
          deps: [ProjectClosureService, ProjectCloseReadinessService, ProjectClosureReviewService, ProjectClosureReportService],
          handlers: { approve: [Number, Object, ApproveClosureDto] },
        },
      ],
      providers: [
        { provide: ProjectClosureService, useValue: f.stack.closure },
        { provide: ProjectCloseReadinessService, useValue: f.stack.readiness },
        { provide: ProjectClosureReviewService, useValue: f.stack.review },
        { provide: ProjectClosureReportService, useValue: f.stack.report },
      ],
    });
    const res = await requestJson(`${http.url}/proyectos/${f.project.idProyecto}/aprobar-cierre`, {
      method: 'POST',
      token: accessTokenFor(coord),
      body: { revisionId: f.dto.revisionId, expectedFingerprint: submitted.fingerprintEntrega },
    });
    expect(res.status).toBe(200);
    expect((await db.proyecto.findUniqueOrThrow({ where: { idProyecto: f.project.idProyecto } })).estadoProyecto).toBe('CERRADO');
    expect((await db.revisionCierreProyecto.findUniqueOrThrow({ where: { idRevisionCierre: f.dto.revisionId } })).idRevisor).toBe(coord.idUsuario);
    const horas = await db.horasParticipacion.findMany({ where: { participacion: { rolProyecto: { idProyecto: f.project.idProyecto } } } });
    expect(horas.length).toBeGreaterThan(0);
    expect(horas.every((h) => h.estadoHoras === 'APROBADA' && Number(h.horasAprobadas) > 0)).toBe(true);
  }, 60_000);
});

describeIntegration('Panel del coordinador = vista del admin acotada a su alcance (PostgreSQL real, HTTP)', () => {
  let db: PrismaClient;
  let http: IntegrationHttpHarness;
  const scope: Scope = {};
  const sufijo = randomUUID().slice(0, 8);
  const tokens = { admin: '', coord: '', vacio: '', estudiante: '' };
  const f = {} as {
    pA: number;
    pB: number;
    cerradoA: number;
    cerradoB: number;
    revA: number;
    revB: number;
    cierreA: number;
    cierreB: number;
    asocA: number;
    asocB: number;
  };
  const asociaciones: number[] = [];
  const get = (ruta: string, token: string) => requestJson(`${http.url}${ruta}`, { token });
  const ids = (body: { items: { idProyecto: number }[] }) => body.items.map((i) => i.idProyecto);

  async function alumno(idCarrera: number, etiqueta: string) {
    const u = await createIntegrationUser(db);
    collectInto(scope, 'userIds', [u.idUsuario]);
    await db.perfilEstudiante.create({ data: { idUsuario: u.idUsuario, carne: `vis-${etiqueta}-${sufijo}`, idCarrera } });
    return u;
  }

  async function proyecto(lider: number, estadoProyecto: 'PUBLICADO' | 'EN_REVISION' | 'EN_SOLICITUD_CIERRE' | 'CERRADO', conSprint = false) {
    const p = await createIntegrationProject(db, lider, { estadoProyecto });
    collectInto(scope, 'projectIds', [p.idProyecto]);
    if (conSprint) {
      const sp = await createIntegrationSprint(db, p.idProyecto, { estado: 'ACTIVO' });
      collectInto(scope, 'sprintIds', [sp.idSprint]);
    }
    return p.idProyecto;
  }

  beforeAll(async () => {
    db = createIntegrationPrismaClient();
    await db.$connect();
    const a = await db.carrera.create({ data: { nombreCarrera: `Vista A ${sufijo}`, facultad: `Facultad vista ${sufijo}` } });
    const b = await db.carrera.create({ data: { nombreCarrera: `Vista B ${sufijo}`, facultad: `Otra vista ${sufijo}` } });
    scope.carreraIds = [a.idCarrera, b.idCarrera];

    const admin = await createIntegrationAdmin(db, scope);
    const coord = await createIntegrationUser(db);
    const vacio = await createIntegrationUser(db);
    const plano = await createIntegrationUser(db);
    collectInto(scope, 'userIds', [coord.idUsuario, vacio.idUsuario, plano.idUsuario]);
    const rol = await db.rolAcceso.upsert({ where: { nombrePerfil: 'coordinador_academico' }, update: {}, create: { nombrePerfil: 'coordinador_academico' } });
    await db.usuarioRolAcceso.createMany({
      data: [coord.idUsuario, vacio.idUsuario].map((idUsuario) => ({ idUsuario, idRolAcceso: rol.idRolAcceso })),
    });
    collectInto(scope, 'accessRoleUserIds', [coord.idUsuario, vacio.idUsuario]);
    await db.alcanceCoordinador.create({ data: { idUsuario: coord.idUsuario, idCarrera: a.idCarrera, asignadoPor: admin.idUsuario } });

    const liderA = await alumno(a.idCarrera, 'A');
    const liderB = await alumno(b.idCarrera, 'B');
    f.pA = await proyecto(liderA.idUsuario, 'PUBLICADO', true);
    f.pB = await proyecto(liderB.idUsuario, 'PUBLICADO', true);
    f.cerradoA = await proyecto(liderA.idUsuario, 'CERRADO');
    f.cerradoB = await proyecto(liderB.idUsuario, 'CERRADO');
    f.revA = await proyecto(liderA.idUsuario, 'EN_REVISION');
    f.revB = await proyecto(liderB.idUsuario, 'EN_REVISION');
    f.cierreA = await proyecto(liderA.idUsuario, 'EN_SOLICITUD_CIERRE');
    f.cierreB = await proyecto(liderB.idUsuario, 'EN_SOLICITUD_CIERRE');
    const asocA = await db.asociacion.create({ data: { nombre: `Asoc vista A ${sufijo}` } });
    const asocB = await db.asociacion.create({ data: { nombre: `Asoc vista B ${sufijo}` } });
    asociaciones.push(asocA.idAsociacion, asocB.idAsociacion);
    await db.asociacionCarrera.create({ data: { idAsociacion: asocA.idAsociacion, idCarrera: a.idCarrera } });
    await db.asociacionCarrera.create({ data: { idAsociacion: asocB.idAsociacion, idCarrera: b.idCarrera } });
    f.asocA = asocA.idAsociacion;
    f.asocB = asocB.idAsociacion;

    tokens.admin = accessTokenFor(admin);
    tokens.coord = accessTokenFor(coord);
    tokens.vacio = accessTokenFor(vacio);
    tokens.estudiante = accessTokenFor(plano);

    const prisma = db as unknown as PrismaService;
    Reflect.defineMetadata(PARAMTYPES_METADATA, [Reflector, PrismaService], RolesGuard);
    http = await startIntegrationHttpHarness({
      prisma: db,
      controllers: [
        { controller: AdminController, deps: [AdminService, AdminEntidadesService] },
        { controller: AdminProjectsController, deps: [HistoricalProjectReadService], handlers: { list: [Object, Object], detail: [Number, Object] } },
        { controller: AdminSprintsController, deps: [AdminSprintsCalendarService], handlers: { getCalendario: [Object, AdminSprintCalendarQueryDto] } },
        { controller: AdminHorasSemestreController, deps: [HorasSemestreService], handlers: { comparativo: [Object], resumenAsociaciones: [Object, HorasCentralQueryDto] } },
      ],
      providers: [
        { provide: AdminService, useValue: new AdminService(prisma, {} as JwtService) },
        { provide: AdminEntidadesService, useValue: new AdminEntidadesService(prisma) },
        { provide: HistoricalProjectReadService, useValue: historicalStack(db).service },
        { provide: AdminSprintsCalendarService, useValue: new AdminSprintsCalendarService(prisma) },
        { provide: HorasSemestreService, useValue: new HorasSemestreService(prisma) },
      ],
    });
  }, 60_000);

  afterAll(async () => {
    await http?.close();
    const usuarios = scope.userIds ?? [];
    await db.asociacionCarrera.deleteMany({ where: { idAsociacion: { in: asociaciones } } });
    await db.asociacion.deleteMany({ where: { idAsociacion: { in: asociaciones } } });
    await db.bitacoraAuditoria.deleteMany({ where: { idUsuario: { in: usuarios } } });
    await db.alcanceCoordinador.deleteMany({ where: { idUsuario: { in: usuarios } } });
    await db.perfilEstudiante.deleteMany({ where: { idUsuario: { in: usuarios } } });
    await cleanupLeadershipFixture(db, scope);
    await db.carrera.deleteMany({ where: { idCarrera: { in: scope.carreraIds ?? [] } } });
    await db.$disconnect();
  });

  it('proyectos: activos, cerrados y detalle solo de su carrera; el admin ve ambas', async () => {
    const activos = await get('/admin/proyectos?grupo=activos', tokens.coord);
    expect(activos.status).toBe(200);
    expect(ids(activos.body)).toContain(f.pA);
    expect(ids(activos.body)).not.toContain(f.pB);
    const cerrados = await get('/admin/proyectos?grupo=cerrados', tokens.coord);
    expect(ids(cerrados.body)).toContain(f.cerradoA);
    expect(ids(cerrados.body)).not.toContain(f.cerradoB);
    expect((await get(`/admin/proyectos/${f.pA}`, tokens.coord)).status).toBe(200);
    expect((await get(`/admin/proyectos/${f.pB}`, tokens.coord)).status).toBe(403);
    expect(ids((await get('/admin/proyectos?grupo=activos', tokens.admin)).body)).toEqual(expect.arrayContaining([f.pA, f.pB]));
  });

  it('calendario de sprints: solo los sprints de proyectos de su carrera', async () => {
    const res = await get('/admin/sprints/calendario', tokens.coord);
    expect(res.status).toBe(200);
    expect(ids(res.body)).toContain(f.pA);
    expect(ids(res.body)).not.toContain(f.pB);
    expect(ids((await get('/admin/sprints/calendario', tokens.admin)).body)).toEqual(expect.arrayContaining([f.pA, f.pB]));
  });

  it('bandeja única: solo revisiones y cierres de su carrera, con su conteo', async () => {
    const res = await get('/admin/pendientes', tokens.coord);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([
      { clave: 'revisiones', total: 1 },
      { clave: 'cierres', total: 1 },
    ]);
    expect(res.body.total).toBe(2);
    expect((await get('/admin/pendientes', tokens.admin)).body.items.length).toBe(7);
  });

  it('panel: conteos y actividad solo de su carrera', async () => {
    const res = await get('/admin/estadisticas', tokens.coord);
    expect(res.status).toBe(200);
    expect(res.body.proyectosActivos).toBe(1);
    expect(res.body.enRevision).toBe(1);
    expect(res.body.cierrePendiente).toBe(1);
    expect(res.body.usuariosActivos).toBe(1);
    expect(res.body.usuariosBloqueados).toBe(0);
    const actividad = ids({ items: res.body.actividadReciente });
    expect(actividad.length).toBeGreaterThan(0);
    expect(actividad.every((id) => [f.pA, f.cerradoA, f.revA, f.cierreA].includes(id))).toBe(true);
    expect((await get('/admin/estadisticas', tokens.admin)).body.proyectosActivos).toBeGreaterThanOrEqual(2);
  });

  it('tendencias: cuenta solo lo creado en su carrera', async () => {
    const suma = (r: { body: { serie: { proyectosCreados: number }[] } }) => r.body.serie.reduce((t, p) => t + p.proyectosCreados, 0);
    const coord = await get('/admin/metricas?periodo=mes', tokens.coord);
    expect(coord.status).toBe(200);
    expect(suma(coord)).toBe(4);
    expect(suma(await get('/admin/metricas?periodo=mes', tokens.admin))).toBeGreaterThanOrEqual(8);
  });

  it('entidades: solo las asociaciones de sus carreras', async () => {
    const res = await get('/admin/metricas/entidades', tokens.coord);
    expect(res.status).toBe(200);
    const propias = res.body.asociaciones.map((x: { idAsociacion: number }) => x.idAsociacion);
    expect(propias).toContain(f.asocA);
    expect(propias).not.toContain(f.asocB);
    const todas = (await get('/admin/metricas/entidades', tokens.admin)).body.asociaciones.map((x: { idAsociacion: number }) => x.idAsociacion);
    expect(todas).toEqual(expect.arrayContaining([f.asocA, f.asocB]));
  });

  it('horas: el resumen por asociación y el comparativo solo cuentan su carrera', async () => {
    const res = await get('/admin/horas-semestre/resumen-asociaciones', tokens.coord);
    expect(res.status).toBe(200);
    const propias = res.body.asociaciones.map((x: { idAsociacion: number }) => x.idAsociacion);
    expect(propias).toContain(f.asocA);
    expect(propias).not.toContain(f.asocB);
    expect((await get('/admin/horas-semestre/comparativo', tokens.coord)).body.semestres).toHaveLength(4);
    const todas = (await get('/admin/horas-semestre/resumen-asociaciones', tokens.admin)).body.asociaciones.map((x: { idAsociacion: number }) => x.idAsociacion);
    expect(todas).toEqual(expect.arrayContaining([f.asocA, f.asocB]));
    const vacio = await get('/admin/horas-semestre/resumen-asociaciones', tokens.vacio);
    expect(vacio.body.asociaciones).toEqual([]);
    const comp = (await get('/admin/horas-semestre/comparativo', tokens.vacio)).body.semestres as { estudiantesConRegistro: number }[];
    expect(comp.every((x) => x.estudiantesConRegistro === 0)).toBe(true);
  });

  it('coordinador sin carreras asignadas: todo vacío', async () => {
    expect(ids((await get('/admin/proyectos?grupo=activos', tokens.vacio)).body)).toEqual([]);
    expect(ids((await get('/admin/proyectos?grupo=cerrados', tokens.vacio)).body)).toEqual([]);
    expect((await get('/admin/sprints/calendario', tokens.vacio)).body.items).toEqual([]);
    expect((await get('/admin/pendientes', tokens.vacio)).body.total).toBe(0);
    expect((await get('/admin/metricas/entidades', tokens.vacio)).body).toEqual({ asociaciones: [], organizaciones: [] });
    const panel = (await get('/admin/estadisticas', tokens.vacio)).body;
    expect([panel.proyectosActivos, panel.usuariosActivos, panel.enRevision, panel.cierrePendiente]).toEqual([0, 0, 0, 0]);
    expect(panel.actividadReciente).toEqual([]);
    expect(panel.estudiantesEnRiesgo).toEqual([]);
    const serie = (await get('/admin/metricas?periodo=mes', tokens.vacio)).body.serie as Record<string, number>[];
    expect(serie.every((p) => p.proyectosCreados === 0 && p.usuariosNuevos === 0 && p.horasConfirmadas === 0)).toBe(true);
  });

  it.each([
    '/admin/estadisticas',
    '/admin/metricas',
    '/admin/metricas/entidades',
    '/admin/pendientes',
    '/admin/proyectos?grupo=activos',
    '/admin/sprints/calendario',
    '/admin/horas-semestre/comparativo',
    '/admin/horas-semestre/resumen-asociaciones',
  ])('un estudiante recibe 403 en GET %s', async (ruta) => {
    expect((await get(ruta, tokens.estudiante)).status).toBe(403);
  });

  it.each(['/admin/usuarios', '/admin/cuentas-pendientes'])('lo exclusivo del admin sigue en 403 para el coordinador: GET %s', async (ruta) => {
    expect((await get(ruta, tokens.coord)).status).toBe(403);
  });
});
