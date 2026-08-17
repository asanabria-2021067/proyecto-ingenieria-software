import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import {
  createIntegrationProject,
  createIntegrationSprint,
  createIntegrationTask,
  createIntegrationUser,
} from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';

/**
 * FND-08 — gate PostgreSQL real de Foundation (Sprint 6). Cuatro
 * invariantes estructurales dejadas por FND-01..FND-07, verificadas
 * dinámicamente contra PostgreSQL (no mocks, no inspección estática):
 *
 *   1. sprint_operable_unique (FND-01): a lo sumo un Sprint ACTIVO/
 *      EN_FINALIZACION por proyecto; CERRADO no está restringido.
 *   2. solicitud_salida_proyecto_pendiente_unique (FND-05): a lo sumo una
 *      solicitud de salida abierta (PREPARACION/PENDIENTE_LIDER) por
 *      (idProyecto, idUsuario); APROBADA/RECHAZADA/CANCELADA no bloquean.
 *   3. tarea.id_sprint NOT NULL (FND-03).
 *   4. Ningún proyecto CERRADO/CANCELADO tiene Sprint operable — invariante
 *      de DATOS post-backfill (FND-02), no una constraint PostgreSQL nueva.
 *
 * Se activa solo con `INTEGRATION_DATABASE_URL` (mismo harness que el resto
 * de test/integration/); sin esa variable, SKIP limpio vía
 * `describeIntegration`. No repite las suites detalladas de FND-02/FND-02.B
 * (backfill legacy) ni implementa Flow A/B — solo certifica que el estado
 * final estructural de Foundation es correcto y se sostiene en PostgreSQL.
 */
describeIntegration('Foundation invariants (PostgreSQL real)', () => {
  let prisma: PrismaClient;
  let scope: IntegrationCleanupScope;
  let solicitudIds: number[];

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    scope = {};
    solicitudIds = [];
  });

  afterEach(async () => {
    // SolicitudSalidaProyecto no forma parte de IntegrationCleanupScope
    // (mismo patrón ya usado en solicitudes-salida.integration.spec.ts):
    // FK directa a proyecto/usuario, se borra explícitamente antes de que
    // cleanupIntegrationFixtures elimine esos padres.
    if (solicitudIds.length > 0) {
      await prisma.solicitudSalidaProyecto.deleteMany({ where: { idSolicitud: { in: solicitudIds } } });
    }
    await cleanupIntegrationFixtures(prisma, scope);
  });

  // ---------------------------------------------------------------------
  // INVARIANTE 1 — sprint_operable_unique
  // ---------------------------------------------------------------------

  it('invariante 1: rechaza un segundo Sprint operable (ACTIVO + EN_FINALIZACION) para el mismo proyecto', async () => {
    const leader = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario];

    const project = await createIntegrationProject(prisma, leader.idUsuario);
    scope.projectIds = [project.idProyecto];

    const activo = await createIntegrationSprint(prisma, project.idProyecto, { numero: 1, estado: 'ACTIVO' });
    scope.sprintIds = [activo.idSprint];

    let rejection: unknown;
    try {
      await prisma.sprint.create({
        data: { idProyecto: project.idProyecto, numero: 2, estado: 'EN_FINALIZACION' },
      });
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((rejection as Prisma.PrismaClientKnownRequestError).code).toBe('P2002');

    const operables = await prisma.sprint.count({
      where: { idProyecto: project.idProyecto, estado: { in: ['ACTIVO', 'EN_FINALIZACION'] } },
    });
    expect(operables).toBe(1);
  });

  it('invariante 1: dos Sprints CERRADO conviven sin problema para el mismo proyecto (el índice no los cubre)', async () => {
    const leader = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario];

    const project = await createIntegrationProject(prisma, leader.idUsuario);
    scope.projectIds = [project.idProyecto];

    const cerrado1 = await createIntegrationSprint(prisma, project.idProyecto, { numero: 1, estado: 'CERRADO' });
    const cerrado2 = await createIntegrationSprint(prisma, project.idProyecto, { numero: 2, estado: 'CERRADO' });
    scope.sprintIds = [cerrado1.idSprint, cerrado2.idSprint];

    const cerrados = await prisma.sprint.count({
      where: { idProyecto: project.idProyecto, estado: 'CERRADO' },
    });
    expect(cerrados).toBe(2);
  });

  // ---------------------------------------------------------------------
  // INVARIANTE 2 — solicitud_salida_proyecto_pendiente_unique
  // ---------------------------------------------------------------------

  it('invariante 2: rechaza una segunda solicitud abierta (PREPARACION + PENDIENTE_LIDER) para el mismo (idProyecto, idUsuario)', async () => {
    const leader = await createIntegrationUser(prisma);
    const member = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario, member.idUsuario];

    const project = await createIntegrationProject(prisma, leader.idUsuario);
    scope.projectIds = [project.idProyecto];

    const primera = await prisma.solicitudSalidaProyecto.create({
      data: { idProyecto: project.idProyecto, idUsuario: member.idUsuario, motivo: 'motivo A', estadoSolicitud: 'PREPARACION' },
    });
    solicitudIds.push(primera.idSolicitud);

    let rejection: unknown;
    try {
      await prisma.solicitudSalidaProyecto.create({
        data: { idProyecto: project.idProyecto, idUsuario: member.idUsuario, motivo: 'motivo B', estadoSolicitud: 'PENDIENTE_LIDER' },
      });
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((rejection as Prisma.PrismaClientKnownRequestError).code).toBe('P2002');

    const abiertas = await prisma.solicitudSalidaProyecto.count({
      where: { idProyecto: project.idProyecto, idUsuario: member.idUsuario, estadoSolicitud: { in: ['PREPARACION', 'PENDIENTE_LIDER'] } },
    });
    expect(abiertas).toBe(1);
  });

  it('invariante 2: una solicitud cerrada (RECHAZADA) no bloquea una nueva solicitud abierta (PENDIENTE_LIDER)', async () => {
    const leader = await createIntegrationUser(prisma);
    const member = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario, member.idUsuario];

    const project = await createIntegrationProject(prisma, leader.idUsuario);
    scope.projectIds = [project.idProyecto];

    const rechazada = await prisma.solicitudSalidaProyecto.create({
      data: { idProyecto: project.idProyecto, idUsuario: member.idUsuario, motivo: 'motivo previo', estadoSolicitud: 'RECHAZADA' },
    });
    solicitudIds.push(rechazada.idSolicitud);

    const nueva = await prisma.solicitudSalidaProyecto.create({
      data: { idProyecto: project.idProyecto, idUsuario: member.idUsuario, motivo: 'motivo nuevo', estadoSolicitud: 'PENDIENTE_LIDER' },
    });
    solicitudIds.push(nueva.idSolicitud);

    const total = await prisma.solicitudSalidaProyecto.count({
      where: { idProyecto: project.idProyecto, idUsuario: member.idUsuario },
    });
    expect(total).toBe(2);
  });

  // ---------------------------------------------------------------------
  // INVARIANTE 3 — tarea.id_sprint NOT NULL
  // ---------------------------------------------------------------------

  it('invariante 3: PostgreSQL rechaza id_sprint = NULL sobre una Tarea real (NOT NULL, no solo el tipo Prisma)', async () => {
    const leader = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario];

    const project = await createIntegrationProject(prisma, leader.idUsuario);
    scope.projectIds = [project.idProyecto];

    const sprint = await createIntegrationSprint(prisma, project.idProyecto);
    scope.sprintIds = [sprint.idSprint];

    const task = await createIntegrationTask(prisma, project.idProyecto, leader.idUsuario, sprint.idSprint);
    scope.taskIds = [task.idTarea];

    let rejection: unknown;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`UPDATE "tarea" SET "id_sprint" = NULL WHERE "id_tarea" = ${task.idTarea};`);
      });
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    // 23502 = not_null_violation (PostgreSQL). Prisma reporta el código real
    // de Postgres en meta.code cuando envuelve un fallo de $executeRawUnsafe.
    expect((rejection as Prisma.PrismaClientKnownRequestError).meta?.code).toBe('23502');

    const filaTrasIntento = await prisma.tarea.findUniqueOrThrow({ where: { idTarea: task.idTarea } });
    expect(filaTrasIntento.idSprint).toBe(sprint.idSprint);

    const columna = await prisma.$queryRawUnsafe<{ is_nullable: string }[]>(`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_name = 'tarea' AND column_name = 'id_sprint';
    `);
    expect(columna[0].is_nullable).toBe('NO');
  });

  // ---------------------------------------------------------------------
  // INVARIANTE 4 — CERRADO/CANCELADO sin Sprint operable (dato post-backfill,
  // NO una constraint estructural: Foundation no creó ninguna que impida
  // crear esa combinación; sprint_operable_unique solo limita cuántos
  // Sprints operables coexisten por proyecto, no el estado del proyecto).
  // ---------------------------------------------------------------------

  it('invariante 4: ningún proyecto CERRADO/CANCELADO tiene Sprint ACTIVO/EN_FINALIZACION, en toda la base', async () => {
    const violaciones = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`
      SELECT COUNT(*)::int AS n
      FROM sprint s
      JOIN proyecto p ON p.id_proyecto = s.id_proyecto
      WHERE p.estado_proyecto IN ('CERRADO', 'CANCELADO')
        AND s.estado IN ('ACTIVO', 'EN_FINALIZACION');
    `);
    expect(Number(violaciones[0].n)).toBe(0);
  });

  it('invariante 4: un proyecto CERRADO con su propio Sprint CERRADO fixture no viola la invariante (caso no trivial)', async () => {
    const leader = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario];

    // Creado directamente (no vía createIntegrationProject, que no expone
    // estadoProyecto): mismo patrón de creación inline ya usado en este
    // harness para formas de fixture no cubiertas por el helper genérico.
    const project = await prisma.proyecto.create({
      data: {
        tituloProyecto: `Integration Closed Project ${leader.idUsuario}`,
        descripcionProyecto: 'Proyecto CERRADO de prueba para invariante 4 (FND-08).',
        tipoProyecto: 'ACADEMICO_HORAS_BECA',
        creadoPor: leader.idUsuario,
        estadoProyecto: 'CERRADO',
      },
    });
    scope.projectIds = [project.idProyecto];

    const sprint = await createIntegrationSprint(prisma, project.idProyecto, { numero: 1, estado: 'CERRADO' });
    scope.sprintIds = [sprint.idSprint];

    const violaciones = await prisma.sprint.count({
      where: {
        idProyecto: project.idProyecto,
        estado: { in: ['ACTIVO', 'EN_FINALIZACION'] },
      },
    });
    expect(violaciones).toBe(0);

    const proyectoTerminalConSprintCerrado = await prisma.sprint.count({
      where: { idProyecto: project.idProyecto, estado: 'CERRADO' },
    });
    expect(proyectoTerminalConSprintCerrado).toBe(1);
  });
});
