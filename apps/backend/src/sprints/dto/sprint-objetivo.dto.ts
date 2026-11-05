import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export const OBJETIVO_SPRINT_MAX = 280;

/** Quita caracteres de control, colapsa espacios y deja `null` si queda vacío. */
export function sanearObjetivo(valor: unknown): unknown {
  if (typeof valor !== 'string') return valor;
  const limpio = valor.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim();
  return limpio === '' ? null : limpio;
}

/** Objetivo opcional del Sprint: texto de hasta 280 caracteres; vacío o ausente equivale a "sin objetivo". */
export class UpdateSprintObjetivoDto {
  @IsOptional()
  @Transform(({ value }) => sanearObjetivo(value))
  @IsString()
  @MaxLength(OBJETIVO_SPRINT_MAX)
  objetivo?: string | null;
}
