import { vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { NotificationsService } from '../../../src/notifications/notifications.service';
import type { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import type { PrismaService } from '../../../src/prisma/prisma.service';
import { CLOSURE_GENERATOR_VERSION } from '../../../src/project-closure/project-close-readiness.service';
import {
  createIntegrationParticipation,
  createIntegrationProject,
  createIntegrationProjectRole,
  createIntegrationUser,
} from './fixtures';

/** Da el rol `administrador` (el mismo que consulta RolesGuard) a un usuario existente. */
export async function hacerAdministrador(prisma: PrismaClient, idUsuario: number): Promise<void> {
  const rol = await prisma.rolAcceso.upsert({
    where: { nombrePerfil: 'administrador' },
    update: {},
    create: { nombrePerfil: 'administrador' },
  });
  await prisma.usuarioRolAcceso.create({ data: { idUsuario, idRolAcceso: rol.idRolAcceso } });
}

/**
 * Cierre oficial como lo deja la aprobación real: revisión APROBADA (con
 * solicitante, envío, huella, revisor e informe oficial, que exigen CK18/CK20)
 * cuyo `resueltaEn` es la fecha oficial, y proyecto CERRADO. Mismos campos que
 * `closedProjectFixture` de historical-read.ts.
 */
export async function cerrarOficialmente(prisma: PrismaClient, idProyecto: number, resueltaEn: Date): Promise<void> {
  const { creadoPor } = await prisma.proyecto.findUniqueOrThrow({ where: { idProyecto }, select: { creadoPor: true } });
  const revision = await prisma.revisionCierreProyecto.create({ data: { idProyecto, numeroRevision: 1, estadoRevision: 'BORRADOR' } });
  const oficial = await prisma.documentoCierre.create({
    data: {
      idProyecto,
      idRevisionOrigen: revision.idRevisionCierre,
      tipoDocumento: 'INFORME_OFICIAL_FINAL',
      externalId: `uvgenius/cierre/${idProyecto}/hu195-informe.enc`,
      deliveryType: 'authenticated',
      nombreArchivo: 'hu195-informe.pdf',
      idAutor: creadoPor,
      // CK27: la reserva vence después de su creación (ahora), no de la fecha simulada.
      reservaExpiraEn: new Date(Date.now() + 600_000),
      estadoDocumento: 'DISPONIBLE',
      assetId: `asset-hu195-${idProyecto}`,
      versionRemota: '1',
      disponibleEn: resueltaEn,
      cargaIniciadaEn: new Date(resueltaEn.getTime() - 3_600_000),
      cargaLimiteEn: new Date(resueltaEn.getTime() + 3_600_000),
      tamanoBytes: BigInt(2048),
      tamanoCifradoBytes: BigInt(2048),
      checksumSha256: 'a'.repeat(64),
      checksumCifradoSha256: 'b'.repeat(64),
      cryptoMetadata: { format: 'aes-256-gcm-v1', keyId: 'k1' },
      generatorVersion: CLOSURE_GENERATOR_VERSION,
      fingerprintEjecucion: 'd'.repeat(64),
      fingerprintModelo: 'e'.repeat(64),
      contextoReporte: { schemaVersion: 1, variante: 'OFICIAL' },
    },
  });
  await prisma.revisionCierreProyecto.update({
    where: { idRevisionCierre: revision.idRevisionCierre },
    data: {
      estadoRevision: 'APROBADA',
      idSolicitante: creadoPor,
      enviadaEn: new Date(resueltaEn.getTime() - 86_400_000),
      fingerprintEntrega: 'c'.repeat(64),
      idRevisor: creadoPor,
      resueltaEn,
      idDocumentoOficial: oficial.idDocumentoCierre,
    },
  });
  await prisma.proyecto.update({ where: { idProyecto }, data: { estadoProyecto: 'CERRADO' } });
}

const DIA_MS = 86_400_000;

/**
 * Escenario común de HU-195 (ids reales en la base desechable):
 *  - P1 EN_PROGRESO: líder L1; M1 y COMUN activos; RET retirado; INACT activo con cuenta INACTIVO.
 *  - P2 PUBLICADO: líder L2; COMUN y M2 activos.
 *  - PC CERRADO hace 10 días (cierre oficial): líder LC; H1 COMPLETADO; HRET RETIRADO.
 *  - PVENC CERRADO hace 3 meses; PSIN CERRADO sin revisión aprobada; PCANC CANCELADO.
 *  - ADMIN y ADMIN2 administradores; ESTUDIANTE sin rol.
 */
export async function escenarioReuniones(
  prisma: PrismaClient,
  scope: { userIds: number[]; projectIds: number[]; roleIds: number[]; participationIds: number[] },
) {
  const persona = async (nombre: string) => {
    const u = await createIntegrationUser(prisma, { nombre, apellido: 'HU195' });
    scope.userIds.push(u.idUsuario);
    return u;
  };
  const u = {
    ADMIN: await persona('Admin'), ADMIN2: await persona('Admin2'), ESTUDIANTE: await persona('Estudiante'),
    L1: await persona('L1'), M1: await persona('M1'), COMUN: await persona('Comun'), RET: await persona('Ret'), INACT: await persona('Inact'),
    L2: await persona('L2'), M2: await persona('M2'),
    LC: await persona('LC'), H1: await persona('H1'), HRET: await persona('HRet'),
  };
  await hacerAdministrador(prisma, u.ADMIN.idUsuario);
  await hacerAdministrador(prisma, u.ADMIN2.idUsuario);
  await prisma.usuario.update({ where: { idUsuario: u.INACT.idUsuario }, data: { estado: 'INACTIVO' } });

  const proyecto = async (lider: number, estadoProyecto: 'EN_PROGRESO' | 'PUBLICADO' | 'CANCELADO', miembros: [number, 'ACTIVO' | 'RETIRADO' | 'COMPLETADO'][]) => {
    const p = await createIntegrationProject(prisma, lider, { estadoProyecto });
    scope.projectIds.push(p.idProyecto);
    const rol = await createIntegrationProjectRole(prisma, p.idProyecto, { cupos: 10 });
    scope.roleIds.push(rol.idRolProyecto);
    for (const [idUsuario, estadoParticipacion] of miembros) {
      const part = await createIntegrationParticipation(prisma, idUsuario, rol.idRolProyecto, { estadoParticipacion });
      scope.participationIds.push(part.idParticipacion);
    }
    return { ...p, idRol: rol.idRolProyecto };
  };
  const ahora = Date.now();
  const p = {
    P1: await proyecto(u.L1.idUsuario, 'EN_PROGRESO', [[u.M1.idUsuario, 'ACTIVO'], [u.COMUN.idUsuario, 'ACTIVO'], [u.RET.idUsuario, 'RETIRADO'], [u.INACT.idUsuario, 'ACTIVO']]),
    P2: await proyecto(u.L2.idUsuario, 'PUBLICADO', [[u.COMUN.idUsuario, 'ACTIVO'], [u.M2.idUsuario, 'ACTIVO']]),
    PC: await proyecto(u.LC.idUsuario, 'EN_PROGRESO', [[u.H1.idUsuario, 'COMPLETADO'], [u.HRET.idUsuario, 'RETIRADO']]),
    PVENC: await proyecto(u.LC.idUsuario, 'EN_PROGRESO', []),
    PSIN: await proyecto(u.LC.idUsuario, 'EN_PROGRESO', []),
    PCANC: await proyecto(u.L1.idUsuario, 'CANCELADO', [[u.M1.idUsuario, 'ACTIVO']]),
  };
  await cerrarOficialmente(prisma, p.PC.idProyecto, new Date(ahora - 10 * DIA_MS));
  await cerrarOficialmente(prisma, p.PVENC.idProyecto, new Date(ahora - 95 * DIA_MS));
  await prisma.proyecto.update({ where: { idProyecto: p.PSIN.idProyecto }, data: { estadoProyecto: 'CERRADO' } });

  const id = (clave: keyof typeof u) => u[clave].idUsuario;
  return { u, p, id, enDias: (dias: number, hora = 15) => new Date(Math.floor(ahora / DIA_MS) * DIA_MS + dias * DIA_MS + hora * 3_600_000) };
}

/** NotificationsService real con un gateway que registra a quién se emitió y qué. */
export function notificacionesConGatewayFalso(prisma: PrismaClient) {
  const emitidos: { userIds: number[]; tipo: string }[] = [];
  const gateway = {
    server: {},
    notifyUsers: vi.fn(async (userIds: number[], payload: { tipoNotificacion: string }) => {
      emitidos.push({ userIds, tipo: payload.tipoNotificacion });
    }),
  } as unknown as NotificationsGateway;
  return { notifications: new NotificationsService(prisma as unknown as PrismaService, gateway), emitidos };
}

/**
 * HU-195: limpieza FK-safe de lo que crean las suites de reuniones de
 * Administración (notificaciones, editores, proyecciones y reuniones), antes de
 * `cleanupIntegrationFixtures`, que borra participaciones, roles, proyectos y usuarios.
 */
export async function cleanupAdminMeetings(
  prisma: PrismaClient,
  scope: { userIds?: number[]; projectIds?: number[] },
): Promise<void> {
  const userIds = scope.userIds ?? [];
  const projectIds = scope.projectIds ?? [];
  const reuniones = await prisma.reunionAdministracion.findMany({
    where: { OR: [{ idCreador: { in: userIds } }, { eventos: { some: { idProyecto: { in: projectIds } } } }] },
    select: { idReunion: true },
  });
  const idsReunion = reuniones.map((r) => r.idReunion);
  await prisma.$transaction([
    prisma.notificacion.deleteMany({ where: { idUsuario: { in: userIds } } }),
    prisma.bitacoraAuditoria.deleteMany({ where: { tipoObjeto: 'REUNION_ADMINISTRACION', idObjeto: { in: idsReunion.map(String) } } }),
    prisma.reunionAdministradorEditor.deleteMany({ where: { idReunion: { in: idsReunion } } }),
    prisma.eventoProyecto.deleteMany({ where: { OR: [{ idProyecto: { in: projectIds } }, { idReunion: { in: idsReunion } }] } }),
    prisma.reunionAdministracion.deleteMany({ where: { idReunion: { in: idsReunion } } }),
    // CK20 ata APROBADA con su informe: se devuelve a ENVIADA en la misma sentencia (CK18) para soltar la FK.
    prisma.revisionCierreProyecto.updateMany({
      where: { idProyecto: { in: projectIds }, estadoRevision: 'APROBADA' },
      data: { estadoRevision: 'ENVIADA', idDocumentoOficial: null, idRevisor: null, resueltaEn: null, comentarioRevisor: null },
    }),
    prisma.documentoCierre.deleteMany({ where: { idProyecto: { in: projectIds } } }),
    prisma.revisionCierreProyecto.deleteMany({ where: { idProyecto: { in: projectIds } } }),
    prisma.preferenciaNotificacion.deleteMany({ where: { idUsuario: { in: userIds } } }),
    prisma.usuarioRolAcceso.deleteMany({ where: { idUsuario: { in: userIds } } }),
  ]);
}
