import { IsFutureCalendarDate } from '../../tasks/dto/validators/is-future-calendar-date.validator';
import { IsWithinSprintPlanningWindow } from './validators/is-within-sprint-planning-window.validator';

/**
 * Fecha esperada de finalización del trabajo del Sprint (`YYYY-MM-DD`),
 * obligatoria para todo Sprint nuevo: estrictamente posterior a hoy y a lo
 * sumo 90 días calendario después, ambos en America/Guatemala. No es el
 * cierre formal — ese sigue siendo el flujo Finalizar -> Cerrar — y una vez
 * iniciado el Sprint no se puede cambiar.
 *
 * `fechaInicio` no forma parte del contrato: la fija el servidor al iniciar.
 * La columna sigue siendo nullable solo por los Sprints anteriores a esta
 * regla.
 */
export class StartSprintDto {
  @IsFutureCalendarDate()
  @IsWithinSprintPlanningWindow()
  fechaFinPlaneada!: string;
}
