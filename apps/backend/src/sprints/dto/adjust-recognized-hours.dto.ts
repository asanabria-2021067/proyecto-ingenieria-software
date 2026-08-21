import { Transform } from 'class-transformer';
import { IsNumber, IsString, Min, ValidateIf } from 'class-validator';

// La regla condicional (justificacionAjuste obligatoria solo cuando
// horasAprobadas != horasCalculadas) no puede expresarse aquí: el DTO no
// conoce horasCalculadas (vive en el registro persistido). Esa comparación
// es responsabilidad de SprintsService.adjustRecognizedHours; este DTO solo
// valida la forma de cada campo que se envía.
export class AdjustRecognizedHoursDto {
  // maxDecimalPlaces: 2 refleja la precisión real de la columna
  // horas_aprobadas (Decimal(6,2)): sin este límite, un valor con más
  // decimales pasaría la validación y solo se truncaría silenciosamente al
  // persistir en PostgreSQL.
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0)
  horasAprobadas!: number;

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  justificacionAjuste?: string;
}
