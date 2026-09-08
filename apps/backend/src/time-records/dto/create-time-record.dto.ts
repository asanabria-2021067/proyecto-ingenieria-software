import { Transform } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateTimeRecordDto {
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0.01, { message: 'horas debe ser mayor a 0' })
  horas!: number;

  @IsDateString({}, { message: 'fecha debe ser una fecha válida (YYYY-MM-DD)' })
  fecha!: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'nota no puede estar vacía si se envía' })
  nota?: string;

  /**
   * C065 (06 v2 §10): solo la exige el registro que cruza la estimación de la
   * tarea, por eso el DTO la acepta siempre y es el servicio quien decide si
   * hacía falta. Se recorta antes de validar para que un texto en blanco no
   * pase por justificación.
   */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'justificacionExceso no puede estar vacía si se envía' })
  @MaxLength(5000)
  justificacionExceso?: string;
}
