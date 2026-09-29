import { Transform } from 'class-transformer';
import { IsDateString, IsInt, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

/**
 * HU-169 (T-263): edición parcial. Mismo patrón que UpdateLabelDto/UpdateTaskDto:
 * @ValidateIf en vez de @IsOptional, para rechazar `null` explícito y aceptar
 * solo la omisión real del campo.
 */
export class UpdateEventDto {
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'tituloEvento no puede estar vacío' })
  @MaxLength(200)
  tituloEvento?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(5000)
  descripcionEvento?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsDateString({}, { message: 'fechaInicio debe ser una fecha/hora válida (ISO 8601)' })
  fechaInicio?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsDateString({}, { message: 'fechaFin debe ser una fecha/hora válida (ISO 8601)' })
  fechaFin?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(10080)
  antelacionMinutos?: number;
}
