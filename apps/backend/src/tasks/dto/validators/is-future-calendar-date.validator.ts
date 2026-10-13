import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { todayInGuatemala } from '../../../common/utils/guatemala-date';

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

function isRealCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

@ValidatorConstraint({ name: 'isFutureCalendarDate', async: false })
export class IsFutureCalendarDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || !DATE_FORMAT.test(value)) {
      return false;
    }

    const [year, month, day] = value.split('-').map(Number);
    if (!isRealCalendarDate(year, month, day)) {
      return false;
    }

    // Ambas cadenas ya están validadas en formato YYYY-MM-DD, por lo que la
    // comparación lexicográfica equivale a la comparación cronológica de
    // días calendario, sin depender de la zona horaria del servidor.
    return value > todayInGuatemala();
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} debe ser una fecha válida (YYYY-MM-DD) posterior al día de hoy`;
  }
}

export function IsFutureCalendarDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsFutureCalendarDateConstraint,
    });
  };
}
