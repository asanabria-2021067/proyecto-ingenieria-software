import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import { createIntegrationUser, createIntegrationProject } from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';
import { BitacoraEventosService } from '../../src/bitacora/bitacora-eventos.service';
import { BitacoraContextService } from '../../src/bitacora/bitacora-context.service';
import { BitacoraConsultaService } from '../../src/bitacora/bitacora-consulta.service';
import { TipoEventoBitacora } from '../../src/bitacora/tipos-evento-bitacora';
import type { PrismaService } from '../../src/prisma/prisma.service';

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
    bitacoraConsulta = new BitacoraConsultaService(prisma as unknown as PrismaService, context);
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
});
