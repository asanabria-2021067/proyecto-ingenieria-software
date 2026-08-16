import { Transform } from 'class-transformer';
import { IsNumber, IsString, Min, ValidateIf } from 'class-validator';

// La regla condicional (justificacionAjuste obligatoria solo cuando
// horasAprobadas != horasCalculadas) no puede expresarse aquí: el DTO no
// conoce horasCalculadas (vive en el registro persistido). Esa comparación
// es responsabilidad de SprintsService.adjustRecognizedHours; este DTO solo
// valida la forma de cada campo que se envía.
export class AdjustRecognizedHoursDto {
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  horasAprobadas!: number;

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  justificacionAjuste?: string;
}
