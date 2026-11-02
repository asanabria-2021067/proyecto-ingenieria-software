interface EntradaLector {
  idUsuario: number | null;
  idLider: number | null;
  /** Ids de los participantes activos del proyecto. */
  idsParticipantes: number[];
  /** Organizaciones dueñas del proyecto. */
  idsOrganizacionesProyecto: number[];
  /** Organizaciones de las que soy miembro activo. */
  idsMisOrganizaciones: number[];
}

/**
 * Miembro de la organización dueña que no lidera ni participa: ve el proyecto en solo lectura
 * (tablero, tareas, avance), sin crear, mover ni registrar horas.
 */
export function esLectorDeOrganizacion({
  idUsuario,
  idLider,
  idsParticipantes,
  idsOrganizacionesProyecto,
  idsMisOrganizaciones,
}: EntradaLector): boolean {
  if (idUsuario === null || idLider === null) return false;
  if (idUsuario === idLider || idsParticipantes.includes(idUsuario)) return false;
  return idsOrganizacionesProyecto.some((id) => idsMisOrganizaciones.includes(id));
}
