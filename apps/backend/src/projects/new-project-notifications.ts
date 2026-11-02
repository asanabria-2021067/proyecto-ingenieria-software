import { EstadoUsuario, Prisma } from '@prisma/client';
import type { NotificationsService } from '../notifications/notifications.service';

type MotivoNuevo = 'SIGUE' | 'CARRERA' | 'INTERES';

/**
 * MEJ-16: al publicarse un proyecto avisa a quien sigue a su organización o asociación, a los
 * estudiantes de la carrera que algún rol pide y a quienes comparten algún interés. Cada persona
 * recibe UN aviso, con el motivo más fuerte (sigue > carrera > interés). El líder no se avisa a
 * sí mismo; solo cuentas ACTIVAS. Respeta la preferencia de notificación del tipo.
 */
export async function avisarProyectoNuevo(
  tx: Prisma.TransactionClient,
  notifications: Pick<NotificationsService, 'notifyFromTemplate'>,
  idProyecto: number,
): Promise<number> {
  const proyecto = await tx.proyecto.findUnique({
    where: { idProyecto },
    select: {
      tituloProyecto: true,
      creadoPor: true,
      idAsociacion: true,
      asociacion: { select: { nombre: true } },
      organizaciones: { select: { idOrganizacion: true, organizacion: { select: { nombreOrganizacion: true } } } },
      intereses: { select: { idInteres: true } },
      roles: { select: { idCarreraRequerida: true } },
    },
  });
  if (!proyecto) return 0;

  const idsOrg = proyecto.organizaciones.map((o) => o.idOrganizacion);
  const carreras = [...new Set(proyecto.roles.flatMap((r) => (r.idCarreraRequerida === null ? [] : [r.idCarreraRequerida])))];
  const intereses = proyecto.intereses.map((i) => i.idInteres);
  const base = { estado: EstadoUsuario.ACTIVO, idUsuario: { not: proyecto.creadoPor } };

  const [seguidores, deCarrera, deInteres] = await Promise.all([
    idsOrg.length === 0 && proyecto.idAsociacion === null
      ? []
      : tx.seguimientoEntidad.findMany({
          where: {
            usuario: base,
            OR: [
              ...(idsOrg.length ? [{ idOrganizacion: { in: idsOrg } }] : []),
              ...(proyecto.idAsociacion === null ? [] : [{ idAsociacion: proyecto.idAsociacion }]),
            ],
          },
          select: { idUsuario: true, idOrganizacion: true },
        }),
    carreras.length === 0 ? [] : tx.usuario.findMany({ where: { ...base, perfil: { idCarrera: { in: carreras } } }, select: { idUsuario: true } }),
    intereses.length === 0 ? [] : tx.usuario.findMany({ where: { ...base, intereses: { some: { idInteres: { in: intereses } } } }, select: { idUsuario: true } }),
  ]);

  const nombreOrg = new Map(proyecto.organizaciones.map((o) => [o.idOrganizacion, o.organizacion.nombreOrganizacion]));
  const motivoPorUsuario = new Map<number, { motivo: MotivoNuevo; entidad: string | null }>();
  for (const u of deInteres) motivoPorUsuario.set(u.idUsuario, { motivo: 'INTERES', entidad: null });
  for (const u of deCarrera) motivoPorUsuario.set(u.idUsuario, { motivo: 'CARRERA', entidad: null });
  for (const s of seguidores) {
    const entidad = (s.idOrganizacion === null ? proyecto.asociacion?.nombre : nombreOrg.get(s.idOrganizacion)) ?? null;
    motivoPorUsuario.set(s.idUsuario, { motivo: 'SIGUE', entidad });
  }

  // Un aviso por (motivo, entidad): el texto lo nombra.
  const grupos = new Map<string, { motivo: MotivoNuevo; entidad: string | null; ids: number[] }>();
  for (const [idUsuario, { motivo, entidad }] of motivoPorUsuario) {
    const clave = `${motivo}:${entidad ?? ''}`;
    const grupo = grupos.get(clave) ?? { motivo, entidad, ids: [] };
    grupo.ids.push(idUsuario);
    grupos.set(clave, grupo);
  }
  for (const { motivo, entidad, ids } of grupos.values()) {
    await notifications.notifyFromTemplate(
      ids,
      'PROYECTO_NUEVO_PARA_TI',
      { projectTitle: proyecto.tituloProyecto, projectId: idProyecto, motivo, entidad },
      tx,
    );
  }
  return motivoPorUsuario.size;
}
