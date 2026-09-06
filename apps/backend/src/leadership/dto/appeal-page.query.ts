import { Type } from 'class-transformer';
import { EstadoApelacionLiderazgo } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * C091 (06 v2 §41 «ApelacionPage query»): filtro y paginación de las listas de
 * apelaciones.
 *
 * El filtro por estado ACOTA lo que un lector ya podía ver; nunca amplía la
 * audiencia. Quien no puede leer las apelaciones de un proyecto tampoco las
 * obtiene pidiendo `estado=PENDIENTE`.
 */
export const APPEAL_PAGE_DEFAULT_PAGE = 1;
export const APPEAL_PAGE_DEFAULT_LIMIT = 20;
export const APPEAL_PAGE_MAX_LIMIT = 50;

export class ApelacionPageQueryDto {
  @IsOptional()
  @IsEnum(EstadoApelacionLiderazgo)
  estado?: EstadoApelacionLiderazgo;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(APPEAL_PAGE_MAX_LIMIT)
  limit?: number;
}

/** Paginación común de §46: `{items,total,page,limit}` en toda lista nueva. */
export interface PaginaLiderazgo<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/** Normaliza la página pedida a los valores por defecto congelados. */
export function resolveAppealPage(query: ApelacionPageQueryDto | undefined): {
  page: number;
  limit: number;
  skip: number;
} {
  const page = query?.page ?? APPEAL_PAGE_DEFAULT_PAGE;
  const limit = query?.limit ?? APPEAL_PAGE_DEFAULT_LIMIT;
  return { page, limit, skip: (page - 1) * limit };
}
