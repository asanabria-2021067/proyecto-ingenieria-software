import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import { closedProjectFixture, cleanupHistoricalFixture, historicalStack } from './setup/historical-read';
import type { ClosureCleanupScope } from './setup/closure-storage';
import { ValidationPipe } from '@nestjs/common';
import { AdminProjectsQueryDto } from '../../src/project-closure/dto/admin-projects-query.dto';
import { createIntegrationAdmin } from './setup/leadership';
import {
  createIntegrationParticipation,
  createIntegrationProject,
  createIntegrationProjectRole,
  createIntegrationSprint,
  createIntegrationUser,
} from './setup/fixtures';
import { ProjectsService } from '../../src/projects/projects.service';
import { ProjectPolicyService } from '../../src/common/project-policy/project-policy.service';
import { ProjectIdResolverService } from '../../src/common/project-policy/project-id-resolver.service';
import { ProjectTransactionService } from '../../src/common/project-policy/project-transaction.service';
import { ProjectReadPolicyService } from '../../src/common/project-policy/project-read-policy.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import type { NotificationsService } from '../../src/notifications/notifications.service';
import type { ProjectWriteFamily } from '../../src/common/guards/project-write.metadata';

/** Mismo pipe que main.ts: la paginación inválida la rechaza el borde. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

function parseAdminQuery(plain: unknown): Promise<AdminProjectsQueryDto> {
  return pipe.transform(plain, {
    type: 'query',
    metatype: AdminProjectsQueryDto,
  }) as Promise<AdminProjectsQueryDto>;
}

async function expectStatus(status: number, fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof HttpException && error.getStatus() === status) {
      return error.getResponse();
    }
    throw new Error(
      `Se esperaba HTTP ${status} pero la operación falló con: ${
        error instanceof HttpException ? `HTTP ${error.getStatus()}` : String(error)
      }`,
    );
  }
  throw new Error(`Se esperaba HTTP ${status} pero la operación se resolvió sin error.`);
}

/**
 * C122+ (06 v2 §34/§46/§47 T35): lectura histórica de un proyecto cerrado.
 * Cerrar no borra ni publica: cambia quién puede leer y qué puede hacer.
 */
describeIntegration('S7 lectura histórica de proyectos', () => {
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
    vi.restoreAllMocks();
    await cleanupHistoricalFixture(db, scope);
  });
  afterAll(async () => {
    await db.$disconnect();
  });

  it('T35-A: participantes activos, completados y retirados leen el proyecto histórico tras el cierre', async () => {
    const f = await closedProjectFixture(db, scope);
    const { service } = historicalStack(db);

    const lectores: Array<[string, number]> = [
      ['líder', f.leader.idUsuario],
      ['completado', f.completado.idUsuario],
      ['retirado', f.retirado.idUsuario],
    ];

    for (const [quien, actorId] of lectores) {
      const vista = await service.historicalProject(f.project.idProyecto, actorId);

      // Resumen del proyecto cerrado, sin exponer que fue eliminado.
      const resumen = vista.resumen as Record<string, unknown>;
      expect(resumen.idProyecto, quien).toBe(f.project.idProyecto);
      expect(resumen.estadoProyecto, quien).toBe('CERRADO');
      expect(Object.keys(resumen), quien).not.toContain('eliminadoEn');
      expect(JSON.stringify(vista), quien).not.toContain('eliminadoEn');

      // Liderazgo, miembros históricos y Sprints cerrados.
      const liderazgo = vista.liderazgo as { liderActual: { idUsuario: number } };
      expect(liderazgo.liderActual.idUsuario, quien).toBe(f.leader.idUsuario);
      const miembros = vista.miembrosHistoricos as Array<{ estadoParticipacion: string }>;
      expect(miembros.map((fila) => fila.estadoParticipacion).sort(), quien).toEqual([
        'COMPLETADO',
        'RETIRADO',
      ]);
      const sprints = vista.sprintsCerrados as Array<{ idSprint: number }>;
      expect(sprints.map((fila) => fila.idSprint), quien).toEqual([f.sprint.idSprint]);

      // Contribuciones y totales: las horas trabajadas siguen contando.
      const totales = vista.totales as Record<string, unknown>;
      expect(totales.reportadasGranulares, quien).toBe('8.00');
      expect(totales.tareasDistintas, quien).toBe(2);
      const eliminadas = vista.contribucionesEliminadas as Array<Record<string, unknown>>;
      expect(eliminadas, quien).toHaveLength(1);
      expect(eliminadas[0].razonDeInvisibilidad, quien).toBe('TAREA_ELIMINADA');
      expect(eliminadas[0].horasReportadas, quien).toBe('3.00');

      // Revisiones y el informe oficial SEPARADO de lo enviado.
      const revisiones = vista.revisiones as Array<{
        estadoRevision: string;
        documentosEnviados: Array<{ idDocumentoCierre: number; tipoDocumento: string }>;
      }>;
      expect(revisiones, quien).toHaveLength(1);
      expect(revisiones[0].estadoRevision, quien).toBe('APROBADA');
      expect(revisiones[0].documentosEnviados.map((doc) => doc.idDocumentoCierre), quien).toEqual([
        f.evidencia.idDocumentoCierre,
      ]);
      const oficial = vista.informeOficial as { idDocumentoCierre: number; tipoDocumento: string };
      expect(oficial.idDocumentoCierre, quien).toBe(f.oficial.idDocumentoCierre);
      expect(oficial.tipoDocumento, quien).toBe('INFORME_OFICIAL_FINAL');
      // El informe oficial no se cuela entre los documentos enviados.
      expect(
        revisiones[0].documentosEnviados.some(
          (doc) => doc.idDocumentoCierre === f.oficial.idDocumentoCierre,
        ),
        quien,
      ).toBe(false);

      // Ninguna bandera de escritura viene habilitada.
      const permisos = vista.permisos as Record<string, boolean>;
      expect(Object.values(permisos).every((valor) => valor === false), quien).toBe(true);

      // Y ningún material sensible viaja en la proyección.
      expect(JSON.stringify(vista), quien).not.toContain('wrappedDek');
      expect(JSON.stringify(vista), quien).not.toContain('cryptoMetadata');
    }

    // El retirado obtiene su contribución histórica sin operativa ajena: la
    // vista no habilita ninguna acción y su perfil es el de participante.
    const delRetirado = await service.historicalProject(
      f.project.idProyecto,
      f.retirado.idUsuario,
    );
    expect((delRetirado.lector as { perfil: string }).perfil).toBe('PARTICIPANTE_HISTORICO');

    // Un externo no lee el histórico de un proyecto en el que nunca estuvo.
    await expectStatus(403, () =>
      service.historicalProject(f.project.idProyecto, f.externo.idUsuario),
    );
  });

  it('T35-B: el administrador ve los cuatro grupos y solo Sprints cerrados, y el exlíder sin participación solo sus propios hechos', async () => {
    const f = await closedProjectFixture(db, scope);
    const { service, readPolicy, bitacora } = historicalStack(db);
    const admin = await createIntegrationAdmin(db, scope);

    // Un proyecto por grupo, además del cerrado del fixture.
    const vivo = await createIntegrationProject(db, f.leader.idUsuario, {
      estadoProyecto: 'EN_PROGRESO',
    });
    const enRevision = await createIntegrationProject(db, f.leader.idUsuario, {
      estadoProyecto: 'EN_REVISION',
    });
    const enCierre = await createIntegrationProject(db, f.leader.idUsuario, {
      estadoProyecto: 'EN_SOLICITUD_CIERRE',
    });
    scope.projectIds = [
      ...(scope.projectIds ?? []),
      vivo.idProyecto,
      enRevision.idProyecto,
      enCierre.idProyecto,
    ];
    const sprintActivo = await createIntegrationSprint(db, vivo.idProyecto, { estado: 'ACTIVO' });
    const sprintCerrado = await createIntegrationSprint(db, vivo.idProyecto, {
      estado: 'CERRADO',
      numero: 2,
    });
    scope.sprintIds = [...(scope.sprintIds ?? []), sprintActivo.idSprint, sprintCerrado.idSprint];

    // Los cuatro grupos mapean exactamente sus estados.
    const grupos: Array<[AdminProjectsQueryDto['grupo'], number, string]> = [
      ['activos', vivo.idProyecto, 'MONITOREAR'],
      ['revision', enRevision.idProyecto, 'REVISAR_PUBLICACION'],
      ['cierres', enCierre.idProyecto, 'REVISAR_CIERRE'],
      ['cerrados', f.project.idProyecto, 'CONSULTAR_HISTORICO'],
    ];
    for (const [grupo, esperado, accion] of grupos) {
      const pagina = await service.adminList(admin.idUsuario, await parseAdminQuery({ grupo }));
      expect(pagina.page, grupo).toBe(1);
      expect(pagina.limit, grupo).toBe(20);
      const fila = pagina.items.find((item) => item.idProyecto === esperado);
      expect(fila, grupo).toBeDefined();
      expect(fila!.accion, grupo).toBe(accion);
      expect((fila!.lider as { idUsuario: number }).idUsuario, grupo).toBe(f.leader.idUsuario);
      expect(typeof fila!.usuariosActivos, grupo).toBe('number');
      // Ninguna fila del grupo pertenece a otro estado.
      const estados = new Set(pagina.items.map((item) => item.estadoProyecto));
      for (const estado of estados) {
        expect(
          grupo === 'activos'
            ? ['PUBLICADO', 'EN_PROGRESO']
            : grupo === 'revision'
              ? ['EN_REVISION', 'OBSERVADO']
              : grupo === 'cierres'
                ? ['EN_SOLICITUD_CIERRE']
                : ['CERRADO'],
          grupo,
        ).toContain(estado as string);
      }
    }

    // El Sprint ambiente viaja como RESUMEN, sin detalle.
    const activos = await service.adminList(
      admin.idUsuario,
      await parseAdminQuery({ grupo: 'activos' }),
    );
    const filaViva = activos.items.find((item) => item.idProyecto === vivo.idProyecto)!;
    expect(filaViva.sprintAmbiente).toMatchObject({
      idSprint: sprintActivo.idSprint,
      estado: 'ACTIVO',
    });
    expect(Object.keys(filaViva.sprintAmbiente as object).sort()).toEqual([
      'estado',
      'idSprint',
      'numero',
    ]);

    // Paginación fuera de rango: la rechaza el borde, y el default es 20.
    await expectStatus(400, () => parseAdminQuery({ grupo: 'activos', limit: 51 }));
    await expectStatus(400, () => parseAdminQuery({ grupo: 'activos', page: 0 }));
    await expectStatus(400, () => parseAdminQuery({ grupo: 'inventado' }));

    // Detalle de un proyecto VIVO: resumen, miembros y liderazgo, y de los
    // Sprints solo los cerrados.
    const detalleVivo = await service.adminDetail(admin.idUsuario, vivo.idProyecto);
    expect(detalleVivo.resumen).toBeDefined();
    expect(detalleVivo.miembros).toBeDefined();
    expect(detalleVivo.liderazgo).toBeDefined();
    const sprintsVistos = detalleVivo.sprints as Array<{ idSprint: number; estado: string }>;
    expect(sprintsVistos.map((sprint) => sprint.idSprint)).toEqual([sprintCerrado.idSprint]);
    expect(sprintsVistos.every((sprint) => sprint.estado === 'CERRADO')).toBe(true);
    expect(Object.values(detalleVivo.permisos as Record<string, boolean>).every((v) => v === false)).toBe(
      true,
    );

    // El detalle de un Sprint ACTIVO se le niega al administrador.
    await expectStatus(403, () =>
      readPolicy.assertRead(undefined, {
        projectId: vivo.idProyecto,
        actorId: admin.idUsuario,
        scope: 'sprints',
        entitySprintId: sprintActivo.idSprint,
      }),
    );

    // Detalle de un proyecto CERRADO: histórico completo.
    const detalleCerrado = await service.adminDetail(admin.idUsuario, f.project.idProyecto);
    expect(detalleCerrado.informeOficial).toBeDefined();
    expect(detalleCerrado.sprintsCerrados).toBeDefined();

    // La bitácora admite al administrador además del líder.
    const eventosAdmin = await bitacora.listEventos(vivo.idProyecto, admin.idUsuario, {
      page: 1,
      limit: 20,
    });
    expect(Array.isArray(eventosAdmin.data)).toBe(true);

    // Un exlíder sin participación: solo sus propios hechos de liderazgo.
    const exLider = await createIntegrationUser(db);
    scope.userIds = [...(scope.userIds ?? []), exLider.idUsuario];
    await db.historialLiderazgo.create({
      data: {
        idProyecto: vivo.idProyecto,
        idLiderAnterior: exLider.idUsuario,
        idLiderNuevo: f.leader.idUsuario,
        idAdminResponsable: admin.idUsuario,
        motivo: 'Cambio administrativo previo.',
        origen: 'CAMBIO_ADMINISTRATIVO',
      },
    });

    const suLiderazgo = await readPolicy.assertRead(undefined, {
      projectId: vivo.idProyecto,
      actorId: exLider.idUsuario,
      scope: 'liderazgo',
    });
    expect(suLiderazgo.profile).toBe('EXLIDER_SIN_PARTICIPACION');
    expect(suLiderazgo.ownOnly).toBe(true);
    // Y nada más: ni bitácora, ni histórico general, ni bandeja administrativa.
    await expectStatus(403, () =>
      bitacora.listEventos(vivo.idProyecto, exLider.idUsuario, { page: 1, limit: 20 }),
    );
    await expectStatus(403, () =>
      service.historicalProject(vivo.idProyecto, exLider.idUsuario),
    );
    const consultaActivos = await parseAdminQuery({ grupo: 'activos' });
    await expectStatus(403, () => service.adminList(exLider.idUsuario, consultaActivos));
    await expectStatus(403, () => service.adminDetail(exLider.idUsuario, vivo.idProyecto));
  });

  it('T35-C: el externo no accede al histórico, el GET público no cubre CERRADO y ninguna escritura funciona en S o C', async () => {
    const f = await closedProjectFixture(db, scope);
    const { service, readPolicy } = historicalStack(db);
    const prisma = db as unknown as PrismaService;

    const publicado = await createIntegrationProject(db, f.leader.idUsuario, {
      estadoProyecto: 'PUBLICADO',
    });
    const enCierre = await createIntegrationProject(db, f.leader.idUsuario, {
      estadoProyecto: 'EN_SOLICITUD_CIERRE',
    });
    scope.projectIds = [...(scope.projectIds ?? []), publicado.idProyecto, enCierre.idProyecto];
    const rolCierre = await createIntegrationProjectRole(db, enCierre.idProyecto, { cupos: 3 });
    scope.roleIds = [...(scope.roleIds ?? []), rolCierre.idRolProyecto];
    const participante = await createIntegrationUser(db);
    scope.userIds = [...(scope.userIds ?? []), participante.idUsuario];
    const participacion = await createIntegrationParticipation(
      db,
      participante.idUsuario,
      rolCierre.idRolProyecto,
      { estadoParticipacion: 'ACTIVO' },
    );
    scope.participationIds = [...(scope.participationIds ?? []), participacion.idParticipacion];

    // El GET público responde solo para el proyecto PUBLICADO.
    const projects = new ProjectsService(
      prisma,
      undefined as unknown as NotificationsService,
      { get: async () => undefined, set: async () => undefined } as never,
      new ProjectTransactionService(prisma),
      new ProjectPolicyService(new ProjectIdResolverService(prisma)),
      new ProjectReadPolicyService(prisma),
    );
    expect((await projects.findOne(publicado.idProyecto)).idProyecto).toBe(publicado.idProyecto);
    // Cerrar un proyecto no lo publica: el endpoint público no se amplía.
    await expectStatus(404, () => projects.findOne(f.project.idProyecto));
    await expectStatus(404, () => projects.findOne(enCierre.idProyecto));

    // El externo no lee ninguna superficie privada del proyecto cerrado.
    await expectStatus(403, () =>
      service.historicalProject(f.project.idProyecto, f.externo.idUsuario),
    );
    for (const scopeProhibido of ['equipo', 'documentos', 'bitacora'] as const) {
      const respuesta = await expectStatus(403, () =>
        readPolicy.assertRead(undefined, {
          projectId: f.project.idProyecto,
          actorId: f.externo.idUsuario,
          scope: scopeProhibido,
        }),
      );
      // La negativa no filtra miembros ni documentos privados.
      const cuerpo = JSON.stringify(respuesta);
      expect(cuerpo, scopeProhibido).not.toContain('evidencia');
      expect(cuerpo, scopeProhibido).not.toContain(String(f.completado.idUsuario));
    }

    // Diez escrituras participantes contra S y C: todas rechazadas por el
    // catálogo congelado, que es el único punto donde se decide.
    const policy = new ProjectPolicyService(new ProjectIdResolverService(prisma));
    const familias: ProjectWriteFamily[] = [
      'TAREA_WRITE',
      'REGISTRO_TIEMPO',
      'COMENTARIO_TAREA',
      'ETIQUETA_TAREA',
      'AVANCE',
    ];
    const proyectosCongelados = [
      { id: enCierre.idProyecto, estado: 'EN_SOLICITUD_CIERRE' as const },
      { id: f.project.idProyecto, estado: 'CERRADO' as const },
    ];
    const tareasAntes = await db.tarea.count();
    const registrosAntes = await db.registroTiempoTarea.count();
    let rechazos = 0;

    for (const proyecto of proyectosCongelados) {
      for (const familia of familias) {
        await expectStatus(409, () =>
          db.$transaction(async (tx) =>
            policy.assertWriteTx(
              tx,
              {
                idProyecto: proyecto.id,
                creadoPor: f.leader.idUsuario,
                estadoProyecto: proyecto.estado,
                eliminadoEn: null,
              },
              familia,
              participante.idUsuario,
            ),
          ),
        );
        rechazos += 1;
      }
    }
    expect(rechazos).toBe(10);
    // Cero cambios: ninguna de las diez llegó a escribir.
    expect(await db.tarea.count()).toBe(tareasAntes);
    expect(await db.registroTiempoTarea.count()).toBe(registrosAntes);
  });
});
