import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

function toIdArray({ value }: { value: unknown }): unknown {
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value === 'string' && value.trim().length > 0) return value.split(',').map(Number);
  return value;
}

/** T-195: rangos fijos que pide el filtro de semestre en Personas. "Todos" no
 * es un valor de este enum: es la ausencia del parámetro. */
export const SEMESTRE_RANGOS = ['1-4', '5-7', '8+'] as const;
export type SemestreRango = (typeof SEMESTRE_RANGOS)[number];

export class BuscarUsuariosQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsBoolean()
  carrera?: boolean;

  @IsOptional()
  @IsBoolean()
  amigosDeAmigos?: boolean;

  @IsOptional()
  @IsBoolean()
  soloAmigos?: boolean;

  @IsOptional()
  @Transform(toIdArray)
  @IsArray()
  @IsInt({ each: true })
  habilidades?: number[];

  @IsOptional()
  @Transform(toIdArray)
  @IsArray()
  @IsInt({ each: true })
  intereses?: number[];

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsIn(SEMESTRE_RANGOS)
  semestreRango?: SemestreRango;
}
