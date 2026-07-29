import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const GUATEMALA_TIME_ZONE = 'America/Guatemala';

function isRealCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function todayInGuatemala(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: GUATEMALA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
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
