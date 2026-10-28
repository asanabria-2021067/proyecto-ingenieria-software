import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export const ESTADOS_LISTADO_REUNIONES = ['activas', 'pasadas', 'canceladas'] as const;
export type EstadoListadoReuniones = (typeof ESTADOS_LISTADO_REUNIONES)[number];

/**
 * HU-195 (T-362): agenda de Administración. `activas` = no canceladas que aún
 * no terminan; `pasadas` = no canceladas ya terminadas; `canceladas` = historial.
 * `desde`/`hasta` filtran por solapamiento con [inicio, fin] de la reunión.
 */
export class ListAdminMeetingsQueryDto {
  @IsOptional()
  @IsIn(ESTADOS_LISTADO_REUNIONES)
  estado?: EstadoListadoReuniones;

  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

/** Proyectos convocables para un rango (por defecto, ahora). */
export class EligibleMeetingProjectsQueryDto {
  @IsOptional()
  @IsDateString()
  fechaInicio?: string;

  @IsOptional()
  @IsDateString()
  fechaFin?: string;
}
