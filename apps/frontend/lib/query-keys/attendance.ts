/** Lista de actividades del proyecto — `GET /proyectos/:id/actividades`. */
export const projectActivitiesQueryKey = (idProyecto: number) => ['proyecto-actividades', idProyecto] as const;

/** Detalle de una actividad con asistencia por integrante. */
export const projectActivityDetailQueryKey = (idProyecto: number, idActividad: number) =>
  ['proyecto-actividades', idProyecto, idActividad] as const;
