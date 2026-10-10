/** HU-177 (T-298): la lista y cada detalle de actividad tienen su propia entrada de caché. */
export const projectActividadesQueryKey = (idProyecto: number) => ['project-actividades', idProyecto] as const;

export const actividadDetalleQueryKey = (idProyecto: number, idActividad: number) =>
  ['project-actividad', idProyecto, idActividad] as const;
