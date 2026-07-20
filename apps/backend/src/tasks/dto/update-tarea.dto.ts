import { EstadoTarea, Prioridad } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateTareaDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  tituloTarea?: string;

  @IsOptional()
  @IsString()
  descripcionTarea?: string;

  @IsOptional()
  @IsEnum(EstadoTarea)
  estadoTarea?: EstadoTarea;

  @IsOptional()
  @IsEnum(Prioridad)
  prioridad?: Prioridad;

  @IsOptional()
  @IsInt()
  idHito?: number;

  @IsOptional()
  @IsInt()
  orden?: number;
}