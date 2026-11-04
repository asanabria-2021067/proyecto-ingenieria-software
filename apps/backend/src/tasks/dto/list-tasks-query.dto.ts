import { EstadoTarea, Prioridad } from '@prisma/client';
import { IsEnum, IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { ORDEN_COLUMNAS, type OrdenColumna } from '../tasks.mapper';

/** MEJ-112: filtros y orden opcionales del listado; sin parametros se conserva el orden de negocio actual. */
export class ListTasksQueryDto {
  @IsOptional()
  @IsEnum(EstadoTarea)
  estado?: EstadoTarea;

  @IsOptional()
  @IsEnum(Prioridad)
  prioridad?: Prioridad;

  @IsOptional()
  @IsInt()
  @Min(1)
  idHito?: number;

  /** Responsable (principal o adicional). */
  @IsOptional()
  @IsInt()
  @Min(1)
  idUsuario?: number;

  /** Rol de la tarea, o rol que ocupa alguno de sus responsables. */
  @IsOptional()
  @IsInt()
  @Min(1)
  idRolProyecto?: number;

  /** Subtareas de esa tarea. */
  @IsOptional()
  @IsInt()
  @Min(1)
  idTareaPadre?: number;

  @IsOptional()
  @IsIn(ORDEN_COLUMNAS)
  ordenarPor?: OrdenColumna;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  direccion?: 'asc' | 'desc';
}
