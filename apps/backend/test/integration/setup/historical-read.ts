import type { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { ProjectReadPolicyService } from '../../../src/common/project-policy/project-read-policy.service';
import { ProjectHoursSummaryService } from '../../../src/sprints/project-hours-summary.service';
import { ProjectPolicyService } from '../../../src/common/project-policy/project-policy.service';
import { ProjectIdResolverService } from '../../../src/common/project-policy/project-id-resolver.service';
import { HistoricalProjectReadService } from '../../../src/project-closure/historical-project-read.service';
import { BitacoraConsultaService } from '../../../src/bitacora/bitacora-consulta.service';
import { BitacoraContextService } from '../../../src/bitacora/bitacora-context.service';
import * as fixtures from './fixtures';
import { cleanupIntegrationFixtures } from './cleanup';
import type { ClosureCleanupScope } from './closure-storage';
import { CLOSURE_GENERATOR_VERSION } from '../../../src/project-closure/project-close-readiness.service';

/**
 * C122+ (06 v2 §34/§46/§47 T35): pila real de lecturas históricas sobre
 * PostgreSQL. Ninguna dependencia externa interviene: la vista histórica es
 * composición de lecturas ya autorizadas.
 */
export function historicalStack(db: PrismaClient) {
  const prisma = db as unknown as PrismaService;
  const readPolicy = new ProjectReadPolicyService(prisma);
  const service = new HistoricalProjectReadService(
    prisma,
    readPolicy,
    new ProjectHoursSummaryService(prisma),
    new ProjectPolicyService(new ProjectIdResolverService(prisma)),
  );
  const bitacora = new BitacoraConsultaService(
    prisma,
    new BitacoraContextService(prisma),
    readPolicy,
  );
  return { service, readPolicy, bitacora };
}

/**
 * Proyecto CERRADO con historia completa: Sprints cerrados, una tarea viva y
 * una eliminada con horas, participaciones en los tres estados, una revisión
 * aprobada con su informe oficial y su evidencia enviada.
 */
export async function closedProjectFixture(db: PrismaClient, scope: ClosureCleanupScope) {
  const collect = <K extends keyof ClosureCleanupScope>(clave: K, ids: number[]) => {
    scope[clave] = [...((scope[clave] ?? []) as number[]), ...ids] as ClosureCleanupScope[K];
  };

  const leader = await fixtures.createIntegrationUser(db);
  const completado = await fixtures.createIntegrationUser(db);
  const retirado = await fixtures.createIntegrationUser(db);
  const externo = await fixtures.createIntegrationUser(db);
  collect('userIds', [
    leader.idUsuario,
    completado.idUsuario,
    retirado.idUsuario,
    externo.idUsuario,
  ]);

  const project = await fixtures.createIntegrationProject(db, leader.idUsuario, {
    estadoProyecto: 'CERRADO',
  });
  collect('projectIds', [project.idProyecto]);
  const role = await fixtures.createIntegrationProjectRole(db, project.idProyecto, { cupos: 5 });
  collect('roleIds', [role.idRolProyecto]);

  const participaciones = await Promise.all([
    fixtures.createIntegrationParticipation(db, completado.idUsuario, role.idRolProyecto, {
      estadoParticipacion: 'COMPLETADO',
    }),
    fixtures.createIntegrationParticipation(db, retirado.idUsuario, role.idRolProyecto, {
      estadoParticipacion: 'RETIRADO',
    }),
  ]);
  collect(
    'participationIds',
    participaciones.map((fila) => fila.idParticipacion),
  );

  const sprint = await fixtures.createIntegrationSprint(db, project.idProyecto, {
    estado: 'CERRADO',
  });
  collect('sprintIds', [sprint.idSprint]);

  const tareaViva = await fixtures.createIntegrationTask(
    db,
    project.idProyecto,
    leader.idUsuario,
    sprint.idSprint,
  );
  const tareaEliminada = await fixtures.createIntegrationTask(
    db,
    project.idProyecto,
    leader.idUsuario,
    sprint.idSprint,
    { tituloTarea: 'Tarea eliminada con horas' },
  );
  collect('taskIds', [tareaViva.idTarea, tareaEliminada.idTarea]);
  await db.tarea.update({
    where: { idTarea: tareaEliminada.idTarea },
    data: { eliminadoEn: new Date('2026-05-01T10:00:00.000Z') },
  });

  const asignaciones = await Promise.all([
    fixtures.createIntegrationTaskAssignment(
      db,
      tareaViva.idTarea,
      completado.idUsuario,
      leader.idUsuario,
      {
        idParticipacion: participaciones[0].idParticipacion,
        desasignadaEn: new Date('2026-04-30T10:00:00.000Z'),
        horasReales: '5.00',
      },
    ),
    fixtures.createIntegrationTaskAssignment(
      db,
      tareaEliminada.idTarea,
      retirado.idUsuario,
      leader.idUsuario,
      {
        idParticipacion: participaciones[1].idParticipacion,
        desasignadaEn: new Date('2026-04-29T10:00:00.000Z'),
        horasReales: '3.00',
      },
    ),
  ]);
  collect(
    'assignmentIds',
    asignaciones.map((fila) => fila.idAsignacion),
  );
  await db.registroTiempoTarea.createMany({
    data: [
      {
        idAsignacion: asignaciones[0].idAsignacion,
        idUsuario: completado.idUsuario,
        horas: '5.00',
        fecha: new Date('2026-04-20'),
      },
      {
        idAsignacion: asignaciones[1].idAsignacion,
        idUsuario: retirado.idUsuario,
        horas: '3.00',
        fecha: new Date('2026-04-21'),
      },
    ],
  });

  // Revisión aprobada con su informe oficial y una evidencia enviada.
  const revision = await db.revisionCierreProyecto.create({
    data: {
      idProyecto: project.idProyecto,
      numeroRevision: 1,
      estadoRevision: 'BORRADOR',
    },
  });
  collect('revisionIds', [revision.idRevisionCierre]);

  const crearDocumento = async (tipo: 'EVIDENCIA_LIDER' | 'INFORME_OFICIAL_FINAL', nombre: string) =>
    db.documentoCierre.create({
      data: {
        idProyecto: project.idProyecto,
        idRevisionOrigen: revision.idRevisionCierre,
        tipoDocumento: tipo,
        externalId: `uvgenius/cierre/${project.idProyecto}/${nombre}.enc`,
        deliveryType: 'authenticated',
        nombreArchivo: `${nombre}.pdf`,
        idAutor: leader.idUsuario,
        reservaExpiraEn: new Date(Date.now() + 600_000),
        estadoDocumento: 'DISPONIBLE',
        // CK24: un documento DISPONIBLE tiene identidad remota confirmada.
        assetId: `asset-${nombre}`,
        versionRemota: '1',
        disponibleEn: new Date('2026-05-02T10:00:00.000Z'),
        cargaIniciadaEn: new Date('2026-05-02T09:00:00.000Z'),
        cargaLimiteEn: new Date('2026-05-02T11:00:00.000Z'),
        tamanoBytes: BigInt(2048),
        tamanoCifradoBytes: BigInt(2048),
        checksumSha256: 'a'.repeat(64),
        checksumCifradoSha256: 'b'.repeat(64),
        cryptoMetadata: { format: 'aes-256-gcm-v1', keyId: 'k1' },
        // CK26: el informe oficial exige generador, huellas y contexto; una
        // evidencia exige que los cuatro sean nulos.
        ...(tipo === 'INFORME_OFICIAL_FINAL'
          ? {
              generatorVersion: CLOSURE_GENERATOR_VERSION,
              fingerprintEjecucion: 'd'.repeat(64),
              fingerprintModelo: 'e'.repeat(64),
              contextoReporte: { schemaVersion: 1, variante: 'OFICIAL' },
            }
          : {}),
      },
    });

  const evidencia = await crearDocumento('EVIDENCIA_LIDER', 'evidencia');
  const oficial = await crearDocumento('INFORME_OFICIAL_FINAL', 'informe-oficial');
  collect('documentIds', [evidencia.idDocumentoCierre, oficial.idDocumentoCierre]);
  await db.documentoRevisionCierre.createMany({
    data: [
      {
        idRevisionCierre: revision.idRevisionCierre,
        idDocumentoCierre: evidencia.idDocumentoCierre,
        orden: 0,
      },
      {
        idRevisionCierre: revision.idRevisionCierre,
        idDocumentoCierre: oficial.idDocumentoCierre,
        orden: 1,
      },
    ],
  });
  // CK18/CK20: una revisión APROBADA exige solicitante, envío, huella,
  // revisor, resolución y su informe oficial.
  await db.revisionCierreProyecto.update({
    where: { idRevisionCierre: revision.idRevisionCierre },
    data: {
      estadoRevision: 'APROBADA',
      idSolicitante: leader.idUsuario,
      enviadaEn: new Date('2026-05-02T12:00:00.000Z'),
      fingerprintEntrega: 'c'.repeat(64),
      idRevisor: leader.idUsuario,
      resueltaEn: new Date('2026-05-03T12:00:00.000Z'),
      idDocumentoOficial: oficial.idDocumentoCierre,
    },
  });

  return {
    leader,
    completado,
    retirado,
    externo,
    project,
    role,
    sprint,
    tareaViva,
    tareaEliminada,
    revision,
    evidencia,
    oficial,
  };
}

export async function cleanupHistoricalFixture(
  db: PrismaClient,
  scope: ClosureCleanupScope,
): Promise<void> {
  await db.bitacoraAuditoria.deleteMany({ where: { idUsuario: { in: scope.userIds ?? [] } } });
  await db.notificacion.deleteMany({ where: { idUsuario: { in: scope.userIds ?? [] } } });
  // CK20 ata APROBADA con su informe oficial, así que para soltar la FK hay
  // que devolver la revisión a ENVIADA en la misma sentencia (CK18).
  await db.revisionCierreProyecto.updateMany({
    where: { idRevisionCierre: { in: scope.revisionIds ?? [] }, estadoRevision: 'APROBADA' },
    data: {
      estadoRevision: 'ENVIADA',
      idDocumentoOficial: null,
      idRevisor: null,
      resueltaEn: null,
      comentarioRevisor: null,
    },
  });
  await db.documentoRevisionCierre.deleteMany({
    where: { idRevisionCierre: { in: scope.revisionIds ?? [] } },
  });
  await db.documentoCierre.deleteMany({ where: { idProyecto: { in: scope.projectIds ?? [] } } });
  await db.revisionCierreProyecto.deleteMany({
    where: { idRevisionCierre: { in: scope.revisionIds ?? [] } },
  });
  await db.historialLiderazgo.deleteMany({ where: { idProyecto: { in: scope.projectIds ?? [] } } });
  await db.apelacionLiderazgo.deleteMany({ where: { idProyecto: { in: scope.projectIds ?? [] } } });
  await db.usuarioRolAcceso.deleteMany({
    where: { idUsuario: { in: scope.accessRoleUserIds ?? [] } },
  });
  await db.horasParticipacion.deleteMany({
    where: { idParticipacion: { in: scope.participationIds ?? [] } },
  });
  await cleanupIntegrationFixtures(db, scope);
}
