import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AdminTablasQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  /** Pares `columna:valor` separados por coma; solo columnas de la lista blanca de la entidad. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  filtros?: string;

  @IsOptional()
  @Matches(/^[A-Za-z]{1,40}$/)
  orden?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  dir?: 'asc' | 'desc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  pagina?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limite?: number;
}
