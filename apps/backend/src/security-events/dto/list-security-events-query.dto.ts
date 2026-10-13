import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  Matches,
  Max,
  Min,
  Validate,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { TipoEventoSeguridad, type TipoEventoSeguridadValor } from '../tipos-evento-seguridad';

export const SECURITY_EVENTS_DEFAULT_LIMIT = 20;
export const SECURITY_EVENTS_MAX_LIMIT = 50;

/** Un instante sin zona depende del reloj del servidor: se exige `Z` o un desplazamiento explícito. */
const CON_ZONA_HORARIA = /(Z|[+-]\d{2}:\d{2})$/;
const MENSAJE_FECHA = 'debe ser una fecha ISO 8601 con zona horaria (por ejemplo 2026-10-11T00:00:00-06:00)';

@ValidatorConstraint({ name: 'rangoDeFechas' })
class RangoDeFechas implements ValidatorConstraintInterface {
  validate(hasta: unknown, args: ValidationArguments): boolean {
    const { desde } = args.object as { desde?: unknown };
    if (typeof desde !== 'string' || typeof hasta !== 'string') return true;
    const inicio = Date.parse(desde);
    const fin = Date.parse(hasta);
    // Una fecha ilegible ya la rechaza su propia regla; aquí solo se compara el orden.
    return Number.isNaN(inicio) || Number.isNaN(fin) || inicio <= fin;
  }

  defaultMessage(): string {
    return 'hasta no puede ser anterior a desde';
  }
}

/**
 * FG01-C01 (T-310): consulta del visor administrativo de eventos de seguridad.
 *
 * Solo existen estas seis claves; el ValidationPipe global (`whitelist` +
 * `forbidNonWhitelisted`) responde 400 a cualquier otra. `tipo` se limita al
 * catálogo cerrado de eventos que ya se registran.
 */
export class ListSecurityEventsQueryDto {
  @IsOptional()
  @IsIn(TipoEventoSeguridad.VALORES, {
    message: `tipo debe ser uno de: ${TipoEventoSeguridad.VALORES.join(', ')}`,
  })
  tipo?: TipoEventoSeguridadValor;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: `desde ${MENSAJE_FECHA}` })
  @Matches(CON_ZONA_HORARIA, { message: `desde ${MENSAJE_FECHA}` })
  desde?: string;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: `hasta ${MENSAJE_FECHA}` })
  @Matches(CON_ZONA_HORARIA, { message: `hasta ${MENSAJE_FECHA}` })
  @Validate(RangoDeFechas)
  hasta?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  idUsuario?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SECURITY_EVENTS_MAX_LIMIT)
  limit?: number = SECURITY_EVENTS_DEFAULT_LIMIT;
}
