import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const recortar = (value: unknown) => (typeof value === 'string' ? value.trim() : value);

export class CreatePollDto {
  @Transform(({ value }) => recortar(value))
  @IsString()
  @MinLength(1, { message: 'La pregunta no puede estar vacía' })
  @MaxLength(300)
  pregunta!: string;

  @IsArray()
  @ArrayMinSize(2, { message: 'La encuesta necesita al menos 2 opciones' })
  @ArrayMaxSize(6, { message: 'La encuesta admite como máximo 6 opciones' })
  @Transform(({ value }) => (Array.isArray(value) ? value.map(recortar) : value))
  @IsString({ each: true })
  @MinLength(1, { each: true, message: 'Las opciones no pueden estar vacías' })
  @MaxLength(120, { each: true })
  opciones!: string[];

  @IsOptional()
  @IsBoolean()
  multiple?: boolean;

  @IsOptional()
  @IsDateString()
  cierraEn?: string;
}
