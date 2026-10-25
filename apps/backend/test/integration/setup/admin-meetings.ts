import type { PrismaClient } from '@prisma/client';

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
    prisma.revisionCierreProyecto.deleteMany({ where: { idProyecto: { in: projectIds } } }),
    prisma.usuarioRolAcceso.deleteMany({ where: { idUsuario: { in: userIds } } }),
  ]);
}
