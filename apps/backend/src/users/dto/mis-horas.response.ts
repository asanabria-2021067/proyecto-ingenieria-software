/**
 * HU-158 (T-231): respuesta de `GET /usuarios/me/horas`. El read-model lo
 * define `ProjectHoursSummaryService`; aquí solo se le da nombre de respuesta
 * para no duplicar su forma.
 */
export type {
  MisHorasView as MisHorasResponse,
  MisHorasProyecto,
  MisHorasTarea,
  MisHorasPorTipo,
} from '../../sprints/project-hours-summary.service';
