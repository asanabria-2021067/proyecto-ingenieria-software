import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import { cleanupHistoricalFixture, historicalStack } from './setup/historical-read';
import type { ClosureCleanupScope } from './setup/closure-storage';
import {
  createIntegrationParticipation,
  createIntegrationProject,
  createIntegrationProjectRole,
  createIntegrationSprint,
  createIntegrationTask,
  createIntegrationTaskAssignment,
  createIntegrationUser,
} from './setup/fixtures';

/**
 * Un ex-integrante (RETIRADO) de un proyecto TODAVÍA abierto lee el histórico
 * con ownOnly: solo sus propios hechos. Antes, `historicalProject` y
 * `deletedContributions` devolvían las contribuciones eliminadas y las horas
 * de todo el equipo, y las revisiones del cierre en curso.
 */
describeIntegration('histórico de un proyecto abierto: el ex-integrante solo ve lo propio', () => {
  let db: PrismaClient;
  let scope: ClosureCleanupScope;

  beforeAll(async () => {
    db = createIntegrationPrismaClient();
    await db.$connect();
  });
  beforeEach(() => {
    scope = {};
  });
  afterEach(async () => {
    await cleanupHistoricalFixture(db, scope);
  });
  afterAll(async () => {
    await db.$disconnect();
  });

  async function escenario() {
    const lider = await createIntegrationUser(db);
    const retirado = await createIntegrationUser(db);
    const activo = await createIntegrationUser(db);
    scope.userIds = [lider.idUsuario, retirado.idUsuario, activo.idUsuario];
    const proyecto = await createIntegrationProject(db, lider.idUsuario, { estadoProyecto: 'EN_PROGRESO' });
    scope.projectIds = [proyecto.idProyecto];
    const rol = await createIntegrationProjectRole(db, proyecto.idProyecto, { cupos: 3 });
    scope.roleIds = [rol.idRolProyecto];
    const sprint = await createIntegrationSprint(db, proyecto.idProyecto, { estado: 'CERRADO' });
    scope.sprintIds = [sprint.idSprint];
    scope.participationIds = [];
    scope.taskIds = [];
    scope.assignmentIds = [];

    const hechos = async (usuario: { idUsuario: number }, estadoParticipacion: 'RETIRADO' | 'ACTIVO') => {
      const participacion = await createIntegrationParticipation(db, usuario.idUsuario, rol.idRolProyecto, {
        estadoParticipacion,
      });
      scope.participationIds!.push(participacion.idParticipacion);
      const tarea = await createIntegrationTask(db, proyecto.idProyecto, lider.idUsuario, sprint.idSprint);
      await db.tarea.update({ where: { idTarea: tarea.idTarea }, data: { eliminadoEn: new Date() } });
      scope.taskIds!.push(tarea.idTarea);
      const asignacion = await createIntegrationTaskAssignment(db, tarea.idTarea, usuario.idUsuario, lider.idUsuario, {
        idParticipacion: participacion.idParticipacion,
        horasReales: '3.00',
      });
      scope.assignmentIds!.push(asignacion.idAsignacion);
      await db.registroTiempoTarea.create({
        data: { idAsignacion: asignacion.idAsignacion, idUsuario: usuario.idUsuario, horas: '3.00', fecha: new Date('2026-04-15') },
      });
    };
    await hechos(retirado, 'RETIRADO');
    await hechos(activo, 'ACTIVO');
    return { proyecto, sprint, lider, retirado, activo };
  }

  it('historicalProject: contribuciones eliminadas y horas por usuario son solo las del ex-integrante', async () => {
    const f = await escenario();
    const { service } = historicalStack(db);

    const vista = await service.historicalProject(f.proyecto.idProyecto, f.retirado.idUsuario);

    const propia = vista as unknown as {
      lector: unknown;
      contribucionesEliminadas: Array<{ usuario: { idUsuario: number } }>;
      totales: { porUsuario: Array<{ idUsuario: number }> };
    };
    expect(propia.lector).toMatchObject({ soloPropio: true });
    expect(propia.contribucionesEliminadas.map((c) => c.usuario.idUsuario)).toEqual([f.retirado.idUsuario]);
    expect(propia.totales.porUsuario.map((u) => u.idUsuario)).toEqual([f.retirado.idUsuario]);
  });

  it('deletedContributions: el ex-integrante tampoco ve las contribuciones eliminadas de otros', async () => {
    const f = await escenario();
    const { service } = historicalStack(db);

    const filas = await service.deletedContributions(f.proyecto.idProyecto, f.retirado.idUsuario, f.sprint.idSprint);

    expect(filas.map((c) => (c.usuario as { idUsuario: number }).idUsuario)).toEqual([f.retirado.idUsuario]);
  });

  it('el líder sigue viendo las de todo el equipo', async () => {
    const f = await escenario();
    const { service } = historicalStack(db);

    const filas = await service.deletedContributions(f.proyecto.idProyecto, f.lider.idUsuario);

    expect(filas.map((c) => (c.usuario as { idUsuario: number }).idUsuario).sort()).toEqual(
      [f.retirado.idUsuario, f.activo.idUsuario].sort(),
    );
  });
});
