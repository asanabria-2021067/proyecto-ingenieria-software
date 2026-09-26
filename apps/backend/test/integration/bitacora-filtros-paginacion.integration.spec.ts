import { afterEach, afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import { createIntegrationUser, createIntegrationProject } from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';
import { BitacoraEventosService } from '../../src/bitacora/bitacora-eventos.service';
import { BitacoraContextService } from '../../src/bitacora/bitacora-context.service';
import { BitacoraConsultaService } from '../../src/bitacora/bitacora-consulta.service';
import { TipoEventoBitacora } from '../../src/bitacora/tipos-evento-bitacora';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { ProjectReadPolicyService } from '../../src/common/project-policy/project-read-policy.service';
import { UserNameSearchService } from '../../src/common/search/user-name-search.service';

describeIntegration('Bitácora — filtros combinados y paginación exhaustiva (T-247)', () => {
  let prisma: PrismaClient;
  let bitacoraEventos: BitacoraEventosService;
  let bitacoraConsulta: BitacoraConsultaService;
  let scope: IntegrationCleanupScope;
  let auditoriaIds: number[];

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    bitacoraEventos = new BitacoraEventosService();
    const context = new BitacoraContextService(prisma as unknown as PrismaService);
    bitacoraConsulta = new BitacoraConsultaService(
      prisma as unknown as PrismaService,
      context,
      new ProjectReadPolicyService(prisma as unknown as PrismaService),
      new UserNameSearchService(prisma as unknown as PrismaService),
    );
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    scope = {};
    auditoriaIds = [];
  });

  afterEach(async () => {
    if (auditoriaIds.length > 0) {
      await prisma.bitacoraAuditoria.deleteMany({ where: { idAuditoria: { in: auditoriaIds } } });
    }
    await cleanupIntegrationFixtures(prisma, scope);
  });

  it('recorrer todas las páginas sin filtros devuelve cada registro exactamente una vez', async () => {
    const leader = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario];
    const project = await createIntegrationProject(prisma, leader.idUsuario);
    scope.projectIds = [project.idProyecto];

    const TOTAL_EVENTOS = 23;
    await prisma.$transaction(async (tx) => {
      for (let i = 1; i <= TOTAL_EVENTOS; i += 1) {
        await bitacoraEventos.registrarEvento({
          tx,
          tipoEvento: TipoEventoBitacora.TASK_CREATED,
          idActor: leader.idUsuario,
          idProyecto: project.idProyecto,
          tipoEntidad: 'TAREA',
          idEntidad: i,
          valorNuevo: { tituloTarea: `Tarea ${i}` },
        });
      }
    });
    const filas = await prisma.bitacoraAuditoria.findMany({ where: { idUsuario: leader.idUsuario } });
    auditoriaIds.push(...filas.map((f) => f.idAuditoria));
    const idsCreados = new Set(auditoriaIds);

    const limit = 10;
    const primera = await bitacoraConsulta.listEventos(project.idProyecto, leader.idUsuario, { page: 1, limit });
    expect(primera.total).toBe(TOTAL_EVENTOS);
    expect(primera.totalPages).toBe(3);

    const vistos = new Set<number>();
    const tamañosDePagina: number[] = [];
    for (let page = 1; page <= primera.totalPages; page += 1) {
      const resultado = await bitacoraConsulta.listEventos(project.idProyecto, leader.idUsuario, { page, limit });
      tamañosDePagina.push(resultado.data.length);
      for (const evento of resultado.data) {
        expect(vistos.has(evento.idAuditoria)).toBe(false);
        vistos.add(evento.idAuditoria);
      }
    }

    expect(tamañosDePagina).toEqual([10, 10, 3]);
    expect(vistos.size).toBe(TOTAL_EVENTOS);
    expect(vistos).toEqual(idsCreados);
  });

  it('paginación con un filtro de persona aplicado también recorre cada registro una sola vez, sin colar al otro actor', async () => {
    const leader = await createIntegrationUser(prisma);
    const elena = await createIntegrationUser(prisma, { nombre: 'Elena', apellido: 'Marroquín' });
    const diego = await createIntegrationUser(prisma, { nombre: 'Diego', apellido: 'Paredes' });
    scope.userIds = [leader.idUsuario, elena.idUsuario, diego.idUsuario];
    const project = await createIntegrationProject(prisma, leader.idUsuario);
    scope.projectIds = [project.idProyecto];

    const EVENTOS_ELENA = 12;
    const EVENTOS_DIEGO = 7;
    await prisma.$transaction(async (tx) => {
      for (let i = 1; i <= EVENTOS_ELENA; i += 1) {
        await bitacoraEventos.registrarEvento({
          tx,
          tipoEvento: TipoEventoBitacora.TASK_CREATED,
          idActor: elena.idUsuario,
          idProyecto: project.idProyecto,
          tipoEntidad: 'TAREA',
          idEntidad: i,
          valorNuevo: { marca: `ELENA-${i}` },
        });
      }
      for (let i = 1; i <= EVENTOS_DIEGO; i += 1) {
        await bitacoraEventos.registrarEvento({
          tx,
          tipoEvento: TipoEventoBitacora.TASK_CREATED,
          idActor: diego.idUsuario,
          idProyecto: project.idProyecto,
          tipoEntidad: 'TAREA',
          idEntidad: 100 + i,
          valorNuevo: { marca: `DIEGO-${i}` },
        });
      }
    });
    const filasElena = await prisma.bitacoraAuditoria.findMany({ where: { idUsuario: elena.idUsuario } });
    const filasDiego = await prisma.bitacoraAuditoria.findMany({ where: { idUsuario: diego.idUsuario } });
    auditoriaIds.push(...filasElena.map((f) => f.idAuditoria), ...filasDiego.map((f) => f.idAuditoria));
    const idsElena = new Set(filasElena.map((f) => f.idAuditoria));

    const limit = 5;
    const primera = await bitacoraConsulta.listEventos(project.idProyecto, leader.idUsuario, {
      page: 1,
      limit,
      persona: 'marroquin', // sin acentos: T-245
    });
    expect(primera.total).toBe(EVENTOS_ELENA);
    expect(primera.totalPages).toBe(3);

    const vistos = new Set<number>();
    for (let page = 1; page <= primera.totalPages; page += 1) {
      const resultado = await bitacoraConsulta.listEventos(project.idProyecto, leader.idUsuario, {
        page,
        limit,
        persona: 'marroquin',
      });
      for (const evento of resultado.data) {
        expect(vistos.has(evento.idAuditoria)).toBe(false);
        vistos.add(evento.idAuditoria);
      }
    }

    expect(vistos.size).toBe(EVENTOS_ELENA);
    expect(vistos).toEqual(idsElena);
  });

  it('cada filtro por separado (idSprint, idActor, tipoEvento, rango de fechas) devuelve solo lo suyo entre valores distintos', async () => {
    const leader = await createIntegrationUser(prisma);
    const actorA = await createIntegrationUser(prisma, { nombre: 'Ana', apellido: 'Gómez' });
    const actorB = await createIntegrationUser(prisma, { nombre: 'Bruno', apellido: 'Solís' });
    scope.userIds = [leader.idUsuario, actorA.idUsuario, actorB.idUsuario];
    const project = await createIntegrationProject(prisma, leader.idUsuario);
    scope.projectIds = [project.idProyecto];

    const [filaVieja, filaSprint2, filaSprintStarted, filaReciente] = await prisma.$transaction(async (tx) => {
      await bitacoraEventos.registrarEvento({
        tx,
        tipoEvento: TipoEventoBitacora.TASK_CREATED,
        idActor: actorA.idUsuario,
        idProyecto: project.idProyecto,
        idSprint: 1,
        tipoEntidad: 'TAREA',
        idEntidad: 1,
        valorNuevo: { marca: 'VIEJA-SPRINT1-A' },
      });
      await bitacoraEventos.registrarEvento({
        tx,
        tipoEvento: TipoEventoBitacora.TASK_CREATED,
        idActor: actorA.idUsuario,
        idProyecto: project.idProyecto,
        idSprint: 2,
        tipoEntidad: 'TAREA',
        idEntidad: 2,
        valorNuevo: { marca: 'RECIENTE-SPRINT2-A' },
      });
      await bitacoraEventos.registrarEvento({
        tx,
        tipoEvento: TipoEventoBitacora.SPRINT_STARTED,
        idActor: actorB.idUsuario,
        idProyecto: project.idProyecto,
        idSprint: 1,
        tipoEntidad: 'SPRINT',
        idEntidad: 1,
        valorNuevo: { marca: 'RECIENTE-SPRINT1-B-STARTED' },
      });
      await bitacoraEventos.registrarEvento({
        tx,
        tipoEvento: TipoEventoBitacora.TASK_CREATED,
        idActor: actorB.idUsuario,
        idProyecto: project.idProyecto,
        idSprint: 2,
        tipoEntidad: 'TAREA',
        idEntidad: 3,
        valorNuevo: { marca: 'RECIENTE-SPRINT2-B' },
      });
      return Promise.all([
        tx.bitacoraAuditoria.findFirstOrThrow({ where: { idUsuario: actorA.idUsuario, idObjeto: '1' } }),
        tx.bitacoraAuditoria.findFirstOrThrow({ where: { idUsuario: actorA.idUsuario, idObjeto: '2' } }),
        tx.bitacoraAuditoria.findFirstOrThrow({ where: { idUsuario: actorB.idUsuario, idObjeto: '1' } }),
        tx.bitacoraAuditoria.findFirstOrThrow({ where: { idUsuario: actorB.idUsuario, idObjeto: '3' } }),
      ]);
    });
    auditoriaIds.push(
      filaVieja.idAuditoria,
      filaSprint2.idAuditoria,
      filaSprintStarted.idAuditoria,
      filaReciente.idAuditoria,
    );

    await prisma.bitacoraAuditoria.update({
      where: { idAuditoria: filaVieja.idAuditoria },
      data: { fechaEvento: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) },
    });

    const porSprint = await bitacoraConsulta.listEventos(project.idProyecto, leader.idUsuario, {
      page: 1,
      limit: 20,
      idSprint: 1,
    });
    expect(porSprint.data.map((e) => e.idAuditoria).sort()).toEqual(
      [filaVieja.idAuditoria, filaSprintStarted.idAuditoria].sort(),
    );

    const porActor = await bitacoraConsulta.listEventos(project.idProyecto, leader.idUsuario, {
      page: 1,
      limit: 20,
      idActor: actorA.idUsuario,
    });
    expect(porActor.data.map((e) => e.idAuditoria).sort()).toEqual(
      [filaVieja.idAuditoria, filaSprint2.idAuditoria].sort(),
    );

    const porTipo = await bitacoraConsulta.listEventos(project.idProyecto, leader.idUsuario, {
      page: 1,
      limit: 20,
      tipoEvento: TipoEventoBitacora.SPRINT_STARTED,
    });
    expect(porTipo.data.map((e) => e.idAuditoria)).toEqual([filaSprintStarted.idAuditoria]);

    const porFecha = await bitacoraConsulta.listEventos(project.idProyecto, leader.idUsuario, {
      page: 1,
      limit: 20,
      desde: new Date(Date.now() - 24 * 60 * 60 * 1000),
      hasta: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    expect(porFecha.data.map((e) => e.idAuditoria).sort()).toEqual(
      [filaSprint2.idAuditoria, filaSprintStarted.idAuditoria, filaReciente.idAuditoria].sort(),
    );
    expect(porFecha.data.map((e) => e.idAuditoria)).not.toContain(filaVieja.idAuditoria);
  });

  it('"saul" (sin acentos) encuentra eventos de un actor guardado como "Saúl", de punta a punta a través de la bitácora', async () => {
    const leader = await createIntegrationUser(prisma);
    const saul = await createIntegrationUser(prisma, { nombre: 'Saúl', apellido: 'Castillo' });
    scope.userIds = [leader.idUsuario, saul.idUsuario];
    const project = await createIntegrationProject(prisma, leader.idUsuario);
    scope.projectIds = [project.idProyecto];

    const fila = await prisma.$transaction(async (tx) => {
      await bitacoraEventos.registrarEvento({
        tx,
        tipoEvento: TipoEventoBitacora.TASK_CREATED,
        idActor: saul.idUsuario,
        idProyecto: project.idProyecto,
        tipoEntidad: 'TAREA',
        idEntidad: 1,
        valorNuevo: { marca: 'EVENTO-SAUL-CON-ACENTO' },
      });
      return tx.bitacoraAuditoria.findFirstOrThrow({ where: { idUsuario: saul.idUsuario } });
    });
    auditoriaIds.push(fila.idAuditoria);

    const resultado = await bitacoraConsulta.listEventos(project.idProyecto, leader.idUsuario, {
      page: 1,
      limit: 20,
      persona: 'saul',
    });

    expect(resultado.data.map((e) => e.idAuditoria)).toEqual([fila.idAuditoria]);
  });

  it('"Saúl" (con acentos) encuentra eventos de un actor guardado como "Saul", de punta a punta a través de la bitácora', async () => {
    const leader = await createIntegrationUser(prisma);
    const saul = await createIntegrationUser(prisma, { nombre: 'Saul', apellido: 'Castillo' });
    scope.userIds = [leader.idUsuario, saul.idUsuario];
    const project = await createIntegrationProject(prisma, leader.idUsuario);
    scope.projectIds = [project.idProyecto];

    const fila = await prisma.$transaction(async (tx) => {
      await bitacoraEventos.registrarEvento({
        tx,
        tipoEvento: TipoEventoBitacora.TASK_CREATED,
        idActor: saul.idUsuario,
        idProyecto: project.idProyecto,
        tipoEntidad: 'TAREA',
        idEntidad: 1,
        valorNuevo: { marca: 'EVENTO-SAUL-SIN-ACENTO' },
      });
      return tx.bitacoraAuditoria.findFirstOrThrow({ where: { idUsuario: saul.idUsuario } });
    });
    auditoriaIds.push(fila.idAuditoria);

    const resultado = await bitacoraConsulta.listEventos(project.idProyecto, leader.idUsuario, {
      page: 1,
      limit: 20,
      persona: 'Saúl',
    });

    expect(resultado.data.map((e) => e.idAuditoria)).toEqual([fila.idAuditoria]);
  });
});
