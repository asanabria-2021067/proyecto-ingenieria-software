import { Transform, Type } from 'class-transformer';
import { IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';

/**
 * C113 (06 v2 §41 `ReserveDocumentDto`): reservar un hueco para una evidencia.
 *
 * El cliente NO propone publicId, proveedor, material criptográfico ni autor:
 * la identidad remota la construye el servidor y el autor es la sesión. El
 * nombre de archivo es puramente descriptivo y se sanea, porque un nombre
 * proporcionado por el usuario nunca puede convertirse en una ruta remota.
 */
export const CLOSURE_FILENAME_MAX = 255;

/** Deja solo un nombre plano: sin separadores, sin recorridos, sin control. */
export function sanitizeClosureFilename(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  const plano = value
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/]+/g, '_')
    .replace(/\.{2,}/g, '.')
    .trim();
  return plano.slice(0, CLOSURE_FILENAME_MAX);
}

export class ReserveDocumentDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  revisionId!: number;

  @Transform(({ value }) => sanitizeClosureFilename(value))
  @IsString()
  @MinLength(1)
  @MaxLength(CLOSURE_FILENAME_MAX)
  nombreArchivo!: string;
}
