/**
 * Query key del endpoint legacy `GET /proyectos/:id/equipo`
 * (`ProjectsService.findTeam`), compartida a propósito entre
 * `useProjectMembers` (cascada rol → usuarios del formulario de tarea) y
 * cualquier otro consumidor de esa misma respuesta plana.
 *
 * No reutilizar esta key para `GET /proyectos/:id/miembros/resumen` (T-106):
 * esa respuesta es person-centric (`ResumenEquipoProyectoDTO`), una forma
 * incompatible con la que devuelve `/equipo`. Compartir la key entre ambas
 * corrompería la caché de `useProjectMembers` — usar
 * `projectTeamSummaryQueryKey` para T-106.
 */
export const projectMembersQueryKey = (idProyecto: number) => ['proyecto-equipo', idProyecto] as const;

/** Detalle individual de un integrante — `GET /proyectos/:id/equipo/:idUsuario`, exclusivo del líder. */
export const projectMemberDetailQueryKey = (idProyecto: number, idUsuario: number) =>
  ['proyecto-equipo', idProyecto, idUsuario] as const;

/** Resumen person-centric de equipo — `GET /proyectos/:id/miembros/resumen` (T-106, HU-123). */
export const projectTeamSummaryQueryKey = (idProyecto: number) =>
  ['proyecto-miembros-resumen', idProyecto] as const;
