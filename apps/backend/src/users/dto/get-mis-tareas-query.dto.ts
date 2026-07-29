import { IsEnum, IsOptional } from 'class-validator';
import { EstadoTarea } from '@prisma/client';

enum OrdenFechaLimite {
  ASC = 'asc',
  DESC = 'desc',
}

export class GetMisTareasQueryDto {
  @IsOptional()
  @IsEnum(EstadoTarea)
  estado?: EstadoTarea;

  @IsOptional()
  @IsEnum(OrdenFechaLimite)
  orden?: OrdenFechaLimite;
}
