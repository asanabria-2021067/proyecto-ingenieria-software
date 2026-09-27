import { Transform } from 'class-transformer';
import { IsDateString, IsInt, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

/**
 * HU-169 (T-263): creación de un evento de calendario del proyecto.
 * fechaInicio/fechaFin validan formato ISO 8601 aquí; la regla
 * "fechaFin > fechaInicio" se valida en EventsService (mensaje legible del
 * 400, no un cruce de campos crudo de class-validator).
 */
export class CreateEventDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'tituloEvento no puede estar vacío' })
  @MaxLength(200)
  tituloEvento!: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(5000)
  descripcionEvento?: string;

  @IsDateString({}, { message: 'fechaInicio debe ser una fecha/hora válida (ISO 8601)' })
  fechaInicio!: string;

  @IsDateString({}, { message: 'fechaFin debe ser una fecha/hora válida (ISO 8601)' })
  fechaFin!: string;

  // Default documentado (T-265): 60 minutos antes de fechaInicio.
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(10080) // 7 días en minutos: tope razonable de antelación
  antelacionMinutos?: number;
}
