import { ValidateIf } from 'class-validator';
import { IsFutureCalendarDate } from '../../tasks/dto/validators/is-future-calendar-date.validator';

/**
 * HU-160: fecha de fin planeada del Sprint, como el modal "Start Sprint" de
 * Jira — ancla únicamente la línea ideal del burndown (T-240). Opcional: si
 * se omite, `SprintsService.startSprint` calcula `fechaInicio + 14 días`.
 * El cierre real del Sprint sigue siendo el flujo Finalizar -> Cerrar
 * existente, sin relación con este campo.
 */
export class StartSprintDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsFutureCalendarDate()
  fechaFinPlaneada?: string;
}
