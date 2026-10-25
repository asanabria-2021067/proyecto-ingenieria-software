import { EstadoParticipacion, EstadoProyecto, EstadoUsuario, type Prisma } from '@prisma/client';

export interface ProyectoDeEquipo {
  idProyecto: number;
  creadoPor: number;
  estadoProyecto: EstadoProyecto;
}

/**
 * HU-195 (T-364): equipo convocado de cada proyecto de una reunión de
 * Administración, siempre con cuentas ACTIVO:
 *  - el líder (`Proyecto.creadoPor`), que no tiene ParticipacionProyecto;
 *  - en un proyecto CERRADO, el equipo histórico: el cierre aprobado pasa las
 *    participaciones ACTIVO a COMPLETADO en su misma transacción, y es la única
 *    escritura de COMPLETADO, así que ACTIVO o COMPLETADO es exactamente el
 *    equipo al cierre;
 *  - en cualquier otro estado, solo las participaciones ACTIVO.
 * RETIRADO nunca. Cada lista sale sin duplicados y con el líder primero.
 */
export async function equiposDeProyectos(
  db: Prisma.TransactionClient,
  proyectos: ProyectoDeEquipo[],
): Promise<Map<number, number[]>> {
  if (proyectos.length === 0) return new Map();
  const participaciones = await db.participacionProyecto.findMany({
    where: {
      rolProyecto: { idProyecto: { in: proyectos.map((p) => p.idProyecto) } },
      estadoParticipacion: { in: [EstadoParticipacion.ACTIVO, EstadoParticipacion.COMPLETADO] },
      usuario: { estado: EstadoUsuario.ACTIVO },
    },
    select: { idUsuario: true, estadoParticipacion: true, rolProyecto: { select: { idProyecto: true } } },
  });
  const lideresActivos = await db.usuario.findMany({
    where: { idUsuario: { in: proyectos.map((p) => p.creadoPor) }, estado: EstadoUsuario.ACTIVO },
    select: { idUsuario: true },
  });
  const lideres = new Set(lideresActivos.map((u) => u.idUsuario));

  const equipos = new Map<number, number[]>();
  for (const proyecto of proyectos) {
    const admitidos: EstadoParticipacion[] =
      proyecto.estadoProyecto === EstadoProyecto.CERRADO
        ? [EstadoParticipacion.ACTIVO, EstadoParticipacion.COMPLETADO]
        : [EstadoParticipacion.ACTIVO];
    const miembros = participaciones
      .filter((p) => p.rolProyecto.idProyecto === proyecto.idProyecto && admitidos.includes(p.estadoParticipacion))
      .map((p) => p.idUsuario);
    const lider = lideres.has(proyecto.creadoPor) ? [proyecto.creadoPor] : [];
    equipos.set(proyecto.idProyecto, [...new Set([...lider, ...miembros])]);
  }
  return equipos;
}

/** Destinatarios únicos de los proyectos indicados (por defecto, todos). */
export function unionDeEquipos(equipos: Map<number, number[]>, idsProyecto: number[] = [...equipos.keys()]): Set<number> {
  return new Set(idsProyecto.flatMap((id) => equipos.get(id) ?? []));
}

/**
 * Para cada usuario, el primer proyecto (en `orden`) en cuyo equipo está:
 * su aviso enlaza a esa proyección y nombra solo ese proyecto, nunca otros de la reunión.
 */
export function proyectoDeCadaUsuario(equipos: Map<number, number[]>, orden: number[]): Map<number, number> {
  const asignado = new Map<number, number>();
  for (const idProyecto of orden) {
    for (const idUsuario of equipos.get(idProyecto) ?? []) {
      if (!asignado.has(idUsuario)) asignado.set(idUsuario, idProyecto);
    }
  }
  return asignado;
}
