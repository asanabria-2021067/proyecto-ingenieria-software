import {
  IsDateString,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * G04 (UI-20, B-06): tope de una consulta por rango. La vista más amplia del
 * calendario (Mes) pide 42 días (6 semanas); 62 deja margen para dos meses
 * naturales y evita que alguien vuelque años enteros de agenda en una sola
 * petición.
 */
export const MAX_DIAS_RANGO_EVENTOS = 62;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

function limites(hasta: unknown, args: ValidationArguments): { inicio: number; fin: number } | null {
  const desde = (args.object as { desde?: unknown }).desde;
  if (typeof desde !== 'string' || typeof hasta !== 'string') return null;
  const inicio = Date.parse(desde);
  const fin = Date.parse(hasta);
  // Un formato inválido ya lo reporta @IsDateString en su propio campo.
  return Number.isNaN(inicio) || Number.isNaN(fin) ? null : { inicio, fin };
}

@ValidatorConstraint({ name: 'rangoDeEventosAcotado', async: false })
export class RangoDeEventosAcotadoConstraint implements ValidatorConstraintInterface {
  validate(hasta: unknown, args: ValidationArguments): boolean {
    const rango = limites(hasta, args);
    if (!rango) return true;
    return rango.fin >= rango.inicio && rango.fin - rango.inicio <= MAX_DIAS_RANGO_EVENTOS * MS_POR_DIA;
  }

  defaultMessage(args: ValidationArguments): string {
    const rango = limites(args.value, args);
    return rango && rango.fin < rango.inicio
      ? 'hasta no puede ser anterior a desde'
      : `el rango entre desde y hasta no puede superar ${MAX_DIAS_RANGO_EVENTOS} días`;
  }
}

/**
 * HU-169 (T-263/T-264): consulta por rango de fechas que la vista mensual/semanal pide.
 * La usan `GET /usuarios/me/eventos` y la agenda de un calendario compartido,
 * así que el tope protege ambos.
 */
export class GetEventsRangeQueryDto {
  @IsDateString({}, { message: 'desde debe ser una fecha/hora válida (ISO 8601)' })
  desde!: string;

  @IsDateString({}, { message: 'hasta debe ser una fecha/hora válida (ISO 8601)' })
  @Validate(RangoDeEventosAcotadoConstraint)
  hasta!: string;
}
