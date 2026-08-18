import type { MiembroProyectoResumenDTO } from '@/lib/dto/member.dto';

/**
 * Agregaciones puramente presentacionales sobre el payload person-centric de
 * T-106 (`GET /proyectos/:id/miembros/resumen`): `tareasActivas`,
 * `tareasCompletadas` y `horasReconocidas` ya vienen calculadas por
 * integrante desde el backend, así que sumar por fila no duplica nada (a
 * diferencia del extinto `findTeam`, que repetía un mismo total agregado en
 * cada fila de un usuario con varios roles).
 */
export function sumarTareasActivas(miembros: MiembroProyectoResumenDTO[]): number {
  return miembros.reduce((total, miembro) => total + miembro.tareasActivas, 0);
}

export function sumarTareasCompletadas(miembros: MiembroProyectoResumenDTO[]): number {
  return miembros.reduce((total, miembro) => total + miembro.tareasCompletadas, 0);
}

/** Suma exclusivamente `horasReconocidas` (HorasParticipacion.horasAprobadas, APROBADA). */
export function sumarHorasReconocidas(miembros: MiembroProyectoResumenDTO[]): number {
  return miembros.reduce((total, miembro) => total + miembro.horasReconocidas, 0);
}
