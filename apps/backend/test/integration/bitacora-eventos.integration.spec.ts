import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { EstadoProyecto, type PrismaClient } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import {
  createIntegrationUser,
  createIntegrationProject,
  createIntegrationProjectRole,
  createIntegrationParticipation,
} from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';
import { BitacoraEventosService } from '../../src/bitacora/bitacora-eventos.service';
import { BitacoraContextService } from '../../src/bitacora/bitacora-context.service';
import { BitacoraConsultaService } from '../../src/bitacora/bitacora-consulta.service';
import { TipoEventoBitacora } from '../../src/bitacora/tipos-evento-bitacora';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { ProjectReadPolicyService } from '../../src/common/project-policy/project-read-policy.service';
import { UserNameSearchService } from '../../src/common/search/user-name-search.service';

/**
 * T-165 (bloque de tests bundlado por la HU junto al frontend, pero de
 * naturaleza puramente backend): contra PostgreSQL real, verifica lo que un
 * mock no puede demostrar de forma creíble —
 *   1) ausencia de eventos huérfanos: si la transacción que registra un
 *      evento revierte, la fila de bitacora_auditoria revierte con ella;
 *   2) aislamiento cross-project real vía el filtro detalleJson.idProyecto
 *      (bitacora_auditoria no tiene columna idProyecto — T-140 exige "sin
 *      migración" — así que el aislamiento depende enteramente de ese JSON).
 * Se activa solo con INTEGRATION_DATABASE_URL; sin esa variable, SKIP limpio
 * (describeIntegration), mismo patrón que el resto de test/integration/.
 */
describeIntegration('Bitácora semántica de Sprint — PostgreSQL real (sin huérfanos + aislamiento)', () => {
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
    // bitacora_auditoria.idUsuario -> Usuario sin onDelete configurado
    // (RESTRICT por defecto): debe limpiarse ANTES de que
    // cleanupIntegrationFixtures borre los usuarios de prueba.
    if (auditoriaIds.length > 0) {
      await prisma.bitacoraAuditoria.deleteMany({ where: { idAuditoria: { in: auditoriaIds } } });
    }
    await cleanupIntegrationFixtures(prisma, scope);
  });

  it('sin eventos huérfanos: si la transacción revierte, la fila de bitacora_auditoria revierte con ella', async () => {
    const leader = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario];
    const project = await createIntegrationProject(prisma, leader.idUsuario);
    scope.projectIds = [project.idProyecto];

    const totalAntes = await prisma.bitacoraAuditoria.count({ where: { idUsuario: leader.idUsuario } });

    await expect(
      prisma.$transaction(async (tx) => {
        await bitacoraEventos.registrarEvento({
          tx,
          tipoEvento: TipoEventoBitacora.TASK_CREATED,
          idActor: leader.idUsuario,
          idProyecto: project.idProyecto,
          tipoEntidad: 'TAREA',
          idEntidad: 999999,
          valorNuevo: { tituloTarea: 'Nunca debe persistir' },
        });
        throw new Error('fallo deliberado después de registrar el evento');
      }),
    ).rejects.toThrow('fallo deliberado después de registrar el evento');

    const totalDespues = await prisma.bitacoraAuditoria.count({ where: { idUsuario: leader.idUsuario } });
    expect(totalDespues).toBe(totalAntes);
  });

  it('escribe realmente cuando la transacción sí se compromete (contraparte del test anterior)', async () => {
    const leader = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario];
    const project = await createIntegrationProject(prisma, leader.idUsuario);
    scope.projectIds = [project.idProyecto];

    const fila = await prisma.$transaction(async (tx) => {
      await bitacoraEventos.registrarEvento({
        tx,
        tipoEvento: TipoEventoBitacora.TASK_CREATED,
        idActor: leader.idUsuario,
        idProyecto: project.idProyecto,
        tipoEntidad: 'TAREA',
        idEntidad: 1,
        valorNuevo: { tituloTarea: 'Tarea real' },
      });
      return tx.bitacoraAuditoria.findFirst({ where: { idUsuario: leader.idUsuario } });
    });

    expect(fila).not.toBeNull();
    auditoriaIds.push(fila!.idAuditoria);
  });

  it('aislamiento cross-project: BitacoraConsultaService.listEventos(A) nunca expone eventos de B', async () => {
    const leader = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario];
    const projectA = await createIntegrationProject(prisma, leader.idUsuario);
    const projectB = await createIntegrationProject(prisma, leader.idUsuario);
    scope.projectIds = [projectA.idProyecto, projectB.idProyecto];

    const [filaA, filaB] = await prisma.$transaction(async (tx) => {
      await bitacoraEventos.registrarEvento({
        tx,
        tipoEvento: TipoEventoBitacora.SPRINT_STARTED,
        idActor: leader.idUsuario,
        idProyecto: projectA.idProyecto,
        idSprint: 1,
        tipoEntidad: 'SPRINT',
        idEntidad: 1,
        valorNuevo: { numero: 1, marca: 'EVENTO-A' },
      });
      await bitacoraEventos.registrarEvento({
        tx,
        tipoEvento: TipoEventoBitacora.SPRINT_STARTED,
        idActor: leader.idUsuario,
        idProyecto: projectB.idProyecto,
        idSprint: 1,
        tipoEntidad: 'SPRINT',
        idEntidad: 2,
        valorNuevo: { numero: 1, marca: 'EVENTO-B' },
      });
      const rows = await tx.bitacoraAuditoria.findMany({ where: { idUsuario: leader.idUsuario } });
      return rows;
    });
    auditoriaIds.push(filaA.idAuditoria, filaB.idAuditoria);

    const resultadoA = await bitacoraConsulta.listEventos(projectA.idProyecto, leader.idUsuario, {
      page: 1,
      limit: 20,
    });
    const resultadoB = await bitacoraConsulta.listEventos(projectB.idProyecto, leader.idUsuario, {
      page: 1,
      limit: 20,
    });

    expect(resultadoA.data.map((e) => (e.valorNuevo as { marca: string }).marca)).toEqual(['EVENTO-A']);
    expect(resultadoA.data.map((e) => (e.valorNuevo as { marca: string }).marca)).not.toContain('EVENTO-B');
    expect(resultadoB.data.map((e) => (e.valorNuevo as { marca: string }).marca)).toEqual(['EVENTO-B']);
    expect(resultadoB.data.map((e) => (e.valorNuevo as { marca: string }).marca)).not.toContain('EVENTO-A');
  });

  it('un miembro no-líder recibe ForbiddenException, sin filtrar ningún evento del proyecto', async () => {
    const leader = await createIntegrationUser(prisma);
    const member = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario, member.idUsuario];
    const project = await createIntegrationProject(prisma, leader.idUsuario);
    scope.projectIds = [project.idProyecto];

    const fila = await prisma.$transaction(async (tx) => {
      await bitacoraEventos.registrarEvento({
        tx,
        tipoEvento: TipoEventoBitacora.SPRINT_STARTED,
        idActor: leader.idUsuario,
        idProyecto: project.idProyecto,
        idSprint: 1,
        tipoEntidad: 'SPRINT',
        idEntidad: 1,
        valorNuevo: { numero: 1 },
      });
      return tx.bitacoraAuditoria.findFirst({ where: { idUsuario: leader.idUsuario } });
    });
    auditoriaIds.push(fila!.idAuditoria);

    await expect(
      bitacoraConsulta.listEventos(project.idProyecto, member.idUsuario, { page: 1, limit: 20 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  /**
   * T-269 (HU-170): a diferencia del test anterior (un usuario SIN
   * participación en el proyecto, denegado por diseño), aquí el actor tiene
   * una fila ACTIVO real en ParticipacionProyecto — el perfil que
   * ProjectReadPolicyService debe reconocer como PARTICIPANTE_ACTIVO y dejar
   * pasar para scope 'bitacora' desde HU-170, mientras el proyecto sigue en
   * vivo (EN_PROGRESO, no CERRADO).
   */
  it('HU-170: un participante ACTIVO del proyecto lee su bitácora mientras el proyecto está en vivo', async () => {
    const leader = await createIntegrationUser(prisma);
    const member = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario, member.idUsuario];
    const project = await createIntegrationProject(prisma, leader.idUsuario, {
      estadoProyecto: EstadoProyecto.EN_PROGRESO,
    });
    scope.projectIds = [project.idProyecto];
    const rol = await createIntegrationProjectRole(prisma, project.idProyecto);
    scope.roleIds = [rol.idRolProyecto];
    const participacion = await createIntegrationParticipation(prisma, member.idUsuario, rol.idRolProyecto, {
      estadoParticipacion: 'ACTIVO',
    });
    scope.participationIds = [participacion.idParticipacion];

    const fila = await prisma.$transaction(async (tx) => {
      await bitacoraEventos.registrarEvento({
        tx,
        tipoEvento: TipoEventoBitacora.TASK_CREATED,
        idActor: leader.idUsuario,
        idProyecto: project.idProyecto,
        tipoEntidad: 'TAREA',
        idEntidad: 1,
        valorNuevo: { tituloTarea: 'Tarea visible para el integrante' },
      });
      return tx.bitacoraAuditoria.findFirst({ where: { idUsuario: leader.idUsuario } });
    });
    auditoriaIds.push(fila!.idAuditoria);

    const resultado = await bitacoraConsulta.listEventos(project.idProyecto, member.idUsuario, {
      page: 1,
      limit: 20,
    });

    expect(resultado.data).toHaveLength(1);
    expect(resultado.data[0].tipoEvento).toBe(TipoEventoBitacora.TASK_CREATED);
  });

  /**
   * T-269 (HU-170, parte 4 — "muy importante"): la exclusión de entradas
   * administrativas debe ocurrir en la query real contra Postgres, no en un
   * filtro posterior en memoria. Se fuerza el proyecto a CERRADO para aislar
   * esta prueba del gate de acceso en vivo (ya cubierto arriba) y probar
   * solo la exclusión por tipo de evento, que debe aplicar sin importar el
   * estado del proyecto.
   */
  it('HU-170: las entradas administrativas (LEADERSHIP_CHANGED) no aparecen en la bitácora de un participante', async () => {
    const leader = await createIntegrationUser(prisma);
    const member = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario, member.idUsuario];
    const project = await createIntegrationProject(prisma, leader.idUsuario, {
      estadoProyecto: EstadoProyecto.CERRADO,
    });
    scope.projectIds = [project.idProyecto];
    const rol = await createIntegrationProjectRole(prisma, project.idProyecto);
    scope.roleIds = [rol.idRolProyecto];
    const participacion = await createIntegrationParticipation(prisma, member.idUsuario, rol.idRolProyecto, {
      estadoParticipacion: 'ACTIVO',
    });
    scope.participationIds = [participacion.idParticipacion];

    const [filaOperativa, filaAdministrativa] = await prisma.$transaction(async (tx) => {
      await bitacoraEventos.registrarEvento({
        tx,
        tipoEvento: TipoEventoBitacora.TASK_CREATED,
        idActor: leader.idUsuario,
        idProyecto: project.idProyecto,
        tipoEntidad: 'TAREA',
        idEntidad: 1,
        valorNuevo: { tituloTarea: 'Evento operativo' },
      });
      await bitacoraEventos.registrarEvento({
        tx,
        tipoEvento: TipoEventoBitacora.LEADERSHIP_CHANGED,
        idActor: leader.idUsuario,
        idProyecto: project.idProyecto,
        tipoEntidad: 'PROYECTO',
        idEntidad: project.idProyecto,
        valorNuevo: { idLiderNuevo: member.idUsuario },
      });
      const rows = await tx.bitacoraAuditoria.findMany({ where: { idUsuario: leader.idUsuario } });
      return rows;
    });
    auditoriaIds.push(filaOperativa.idAuditoria, filaAdministrativa.idAuditoria);

    const comoIntegrante = await bitacoraConsulta.listEventos(project.idProyecto, member.idUsuario, {
      page: 1,
      limit: 20,
    });
    const comoLider = await bitacoraConsulta.listEventos(project.idProyecto, leader.idUsuario, {
      page: 1,
      limit: 20,
    });

    expect(comoIntegrante.data.map((e) => e.tipoEvento)).toEqual([TipoEventoBitacora.TASK_CREATED]);
    expect(comoIntegrante.total).toBe(1);
    expect(comoLider.data.map((e) => e.tipoEvento).sort()).toEqual(
      [TipoEventoBitacora.LEADERSHIP_CHANGED, TipoEventoBitacora.TASK_CREATED].sort(),
    );

    // Filtrar explícitamente por el tipo administrativo tampoco debe filtrarlo.
    const filtradoPorAdministrativo = await bitacoraConsulta.listEventos(project.idProyecto, member.idUsuario, {
      page: 1,
      limit: 20,
      tipoEvento: TipoEventoBitacora.LEADERSHIP_CHANGED,
    });
    expect(filtradoPorAdministrativo.data).toHaveLength(0);
    expect(filtradoPorAdministrativo.total).toBe(0);
  });
});
