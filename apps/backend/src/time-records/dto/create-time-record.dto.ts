import { Transform } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

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
}
