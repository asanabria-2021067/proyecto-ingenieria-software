import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { addDaysToDay, todayInGuatemala } from '../../../common/utils/guatemala-date';

/**
 * Horizonte máximo de planificación de un Sprint, en días calendario de
 * Guatemala contados desde hoy. Acota la serie del burndown (un punto por
 * día hasta la fecha planeada) y evita planes sin sentido en el calendario
 * administrativo.
 */
export const SPRINT_PLAN_MAX_DIAS = 90;

/**
 * Tope superior de `fechaFinPlaneada`. Es exclusivo de Sprint a propósito:
 * `IsFutureCalendarDate` lo comparten tareas e hitos, que no tienen este
 * límite. El formato, la fecha real y el "posterior a hoy" siguen siendo
 * responsabilidad de aquel validador; aquí solo se compara el máximo, con
 * ambas cadenas en `YYYY-MM-DD` (orden lexicográfico = cronológico).
 */
@ValidatorConstraint({ name: 'isWithinSprintPlanningWindow', async: false })
export class IsWithinSprintPlanningWindowConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && value <= addDaysToDay(todayInGuatemala(), SPRINT_PLAN_MAX_DIAS);
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} no puede superar los ${SPRINT_PLAN_MAX_DIAS} días a partir de hoy`;
  }
}

export function IsWithinSprintPlanningWindow(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsWithinSprintPlanningWindowConstraint,
    });
  };
}
