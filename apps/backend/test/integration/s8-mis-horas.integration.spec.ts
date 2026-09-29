import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import { cleanupHistoricalFixture } from './setup/historical-read';
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
import { UsersController } from '../../src/users/users.controller';
import { UsersService } from '../../src/users/users.service';
import { ProjectHoursSummaryService } from '../../src/sprints/project-hours-summary.service';
import type { PrismaService } from '../../src/prisma/prisma.service';

const suma = (valores: string[]) => valores.reduce((acc, v) => acc.plus(v), new Prisma.Decimal(0)).toFixed(2);

/**
 * HU-158 (T-231): «Mis Horas» y el dashboard leen las mismas horas persistidas
 * y tienen que contar lo mismo (INV-H07). Solo lectura: base desechable.
 */
describeIntegration('S8 Mis Horas frente al dashboard', () => {
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

  it('para el mismo usuario, me/horas y me/dashboard coinciden en registradas abiertas y acreditadas, y porTipo compone los totales', async () => {
    const prisma = db as unknown as PrismaService;
    const controller = new UsersController(new UsersService(prisma, new ProjectHoursSummaryService(prisma)));

    const estudiante = await createIntegrationUser(db);
    const otro = await createIntegrationUser(db);
    const lider = await createIntegrationUser(db);
    scope.userIds = [estudiante.idUsuario, otro.idUsuario, lider.idUsuario];

    /** Proyecto con una participación del estudiante y una tarea en un Sprint. */
    const proyectoCon = async (
      tipoProyecto: 'ACADEMICO_HORAS_BECA' | 'EXTRACURRICULAR_EXTENSION',
      estadoProyecto: 'EN_PROGRESO' | 'CERRADO',
      estadoParticipacion: 'ACTIVO' | 'RETIRADO' | 'COMPLETADO',
    ) => {
      const proyecto = await createIntegrationProject(db, lider.idUsuario, { tipoProyecto, estadoProyecto });
      scope.projectIds = [...(scope.projectIds ?? []), proyecto.idProyecto];
      const rol = await createIntegrationProjectRole(db, proyecto.idProyecto, { cupos: 3 });
      scope.roleIds = [...(scope.roleIds ?? []), rol.idRolProyecto];
      const participacion = await createIntegrationParticipation(db, estudiante.idUsuario, rol.idRolProyecto, {
        estadoParticipacion,
      });
      scope.participationIds = [...(scope.participationIds ?? []), participacion.idParticipacion];
      const sprint = await createIntegrationSprint(db, proyecto.idProyecto, {
        estado: estadoProyecto === 'CERRADO' ? 'CERRADO' : 'ACTIVO',
      });
      scope.sprintIds = [...(scope.sprintIds ?? []), sprint.idSprint];
      return { proyecto, participacion, sprint };
    };
    const tramo = async (
      contexto: Awaited<ReturnType<typeof proyectoCon>>,
      registros: string[],
      extra: { horasReales?: string; origenReporte?: 'LEGACY'; desasignadaEn?: Date } = {},
    ) => {
      const tarea = await createIntegrationTask(db, contexto.proyecto.idProyecto, lider.idUsuario, contexto.sprint.idSprint);
      scope.taskIds = [...(scope.taskIds ?? []), tarea.idTarea];
      const asignacion = await createIntegrationTaskAssignment(db, tarea.idTarea, estudiante.idUsuario, lider.idUsuario, {
        idParticipacion: contexto.participacion.idParticipacion,
        horasReales: extra.horasReales ?? suma(registros),
        ...(extra.origenReporte ? { origenReporte: extra.origenReporte } : {}),
        ...(extra.desasignadaEn ? { desasignadaEn: extra.desasignadaEn } : {}),
      });
      scope.assignmentIds = [...(scope.assignmentIds ?? []), asignacion.idAsignacion];
      for (const horas of registros) {
        await db.registroTiempoTarea.create({
          data: { idAsignacion: asignacion.idAsignacion, idUsuario: estudiante.idUsuario, horas, fecha: new Date('2026-04-15') },
        });
      }
    };

    // Beca abierto y activo: 3.50 + 1.00 registradas y un tramo LEGACY de 2.00.
    const beca = await proyectoCon('ACADEMICO_HORAS_BECA', 'EN_PROGRESO', 'ACTIVO');
    await tramo(beca, ['3.50', '1.00']);
    await tramo(beca, [], { horasReales: '2.00', origenReporte: 'LEGACY', desasignadaEn: new Date() });
    // Extensión abierto con participación RETIRADA: sus 2.50 siguen contando.
    const extension = await proyectoCon('EXTRACURRICULAR_EXTENSION', 'EN_PROGRESO', 'RETIRADO');
    await tramo(extension, ['2.50']);
    // Beca cerrado: 6.00 registradas que ya no son «abiertas» y 6.00 acreditadas.
    const cerrado = await proyectoCon('ACADEMICO_HORAS_BECA', 'CERRADO', 'COMPLETADO');
    await tramo(cerrado, ['6.00']);

    await db.horasParticipacion.create({
      data: {
        idParticipacion: cerrado.participacion.idParticipacion,
        periodoInicio: new Date('2026-03-01'),
        periodoFin: new Date('2026-04-30'),
        horasReportadas: '6.00',
        horasCalculadas: '6.00',
        horasAprobadas: '6.00',
        estadoHoras: 'APROBADA',
        aprobadoPor: lider.idUsuario,
        fechaAprobacion: new Date('2026-05-03'),
      },
    });
    await db.horasParticipacion.create({
      data: {
        idParticipacion: beca.participacion.idParticipacion,
        periodoInicio: new Date('2026-04-01'),
        periodoFin: new Date('2026-04-30'),
        horasReportadas: '4.50',
        horasCalculadas: '4.50',
        estadoHoras: 'PENDIENTE',
      },
    });

    const [misHoras, dashboard] = await Promise.all([
      controller.getMisHoras({ userId: estudiante.idUsuario }),
      controller.getDashboard({ userId: estudiante.idUsuario }),
    ]);

    // INV-H07: mismos totales que el dashboard para el mismo usuario.
    expect(misHoras.totales.registradasEnProyectosAbiertos).toBe(dashboard.horasRegistradasEnProyectosAbiertos);
    expect(misHoras.totales.acreditadas).toBe(dashboard.horasAcreditadas);
    // Y las cifras son las persistidas: 3.50 + 1.00 + 2.50; el legacy va aparte.
    expect(misHoras.totales).toEqual({
      registradasEnProyectosAbiertos: '7.00',
      legacyEnProyectosAbiertos: '2.00',
      propuestasPendientes: '4.50',
      acreditadas: '6.00',
    });

    // INV-H06: porTipo trae los tres tipos y compone cada total.
    expect(misHoras.porTipo.map((t) => t.tipoProyecto)).toEqual([
      'ACADEMICO_HORAS_BECA',
      'EXTRACURRICULAR_EXTENSION',
      'ACADEMICO_EXPERIENCIA',
    ]);
    expect(suma(misHoras.porTipo.map((t) => t.registradasEnProyectosAbiertos))).toBe(
      misHoras.totales.registradasEnProyectosAbiertos,
    );
    expect(suma(misHoras.porTipo.map((t) => t.propuestasPendientes))).toBe(misHoras.totales.propuestasPendientes);
    expect(suma(misHoras.porTipo.map((t) => t.acreditadas))).toBe(misHoras.totales.acreditadas);

    // Cada proyecto conserva su estado real.
    const porId = new Map(misHoras.proyectos.map((p) => [p.idProyecto, p]));
    expect(porId.get(beca.proyecto.idProyecto)).toMatchObject({
      abierto: true,
      participacionActiva: true,
      registradas: '4.50',
      legacy: '2.00',
      propuestasPendientes: '4.50',
      tareasDistintas: 2,
    });
    expect(porId.get(extension.proyecto.idProyecto)).toMatchObject({
      abierto: true,
      participacionActiva: false,
      registradas: '2.50',
    });
    expect(porId.get(cerrado.proyecto.idProyecto)).toMatchObject({
      abierto: false,
      acreditadas: '6.00',
      tareasDistintas: 1,
      tareas: [],
    });

    // Otro usuario no ve nada del estudiante, y la respuesta vacía también cuadra.
    const [ajenas, dashboardAjeno] = await Promise.all([
      controller.getMisHoras({ userId: otro.idUsuario }),
      controller.getDashboard({ userId: otro.idUsuario }),
    ]);
    expect(ajenas.proyectos).toEqual([]);
    expect(ajenas.totales.registradasEnProyectosAbiertos).toBe(dashboardAjeno.horasRegistradasEnProyectosAbiertos);
    expect(ajenas.totales.acreditadas).toBe(dashboardAjeno.horasAcreditadas);
    expect(ajenas.totales.acreditadas).toBe('0.00');
  });
});
