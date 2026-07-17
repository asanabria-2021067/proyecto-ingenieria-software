import { Prioridad } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTareaDto {
  @IsInt()
  idProyecto!: number;

  @IsOptional()
  @IsInt()
  idHito?: number;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  tituloTarea!: string;

  @IsOptional()
  @IsString()
  descripcionTarea?: string;

  @IsOptional()
  @IsEnum(Prioridad)
  prioridad?: Prioridad;
}
