import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsInt, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { Prioridad } from '@prisma/client';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreatePlantillaTareaDto {
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'nombre no puede estar vacío' })
  @MaxLength(100)
  nombre!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'tituloTarea no puede estar vacío' })
  @MaxLength(150)
  tituloTarea!: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  descripcionTarea?: string;

  @IsEnum(Prioridad)
  prioridad!: Prioridad;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(1000)
  tiempoEstimadoHoras?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(50)
  @Transform(({ value }) => (Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v.trim() : v)) : value))
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(200, { each: true })
  checklist?: string[];
}
