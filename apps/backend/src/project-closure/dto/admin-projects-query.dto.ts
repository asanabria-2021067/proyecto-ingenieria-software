import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * C121 (06 v2 §41/§46 `AdminProjects`): consulta de la bandeja administrativa
 * de proyectos.
 *
 * Los cuatro grupos son fijos y mapean estados concretos: agrupar por otra
 * cosa cambiaría el significado de la bandeja, no su presentación.
 */
export const ADMIN_PROJECT_GROUPS = ['activos', 'revision', 'cierres', 'cerrados'] as const;
export type AdminProjectGroup = (typeof ADMIN_PROJECT_GROUPS)[number];

export const ADMIN_PROJECTS_DEFAULT_PAGE = 1;
export const ADMIN_PROJECTS_DEFAULT_LIMIT = 20;
export const ADMIN_PROJECTS_MAX_LIMIT = 50;

export class AdminProjectsQueryDto {
  @IsEnum(ADMIN_PROJECT_GROUPS)
  grupo!: AdminProjectGroup;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_PROJECTS_MAX_LIMIT)
  limit?: number;
}
