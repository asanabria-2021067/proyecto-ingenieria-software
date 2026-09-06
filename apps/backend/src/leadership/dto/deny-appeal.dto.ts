import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * C091 (06 v2 §19/§41): payload de denegación administrativa.
 *
 * CK12 exige que una apelación DENEGADA tenga `mensaje_resolucion` no vacío:
 * el motivo se recorta y se exige aquí para que la negativa quede explicada al
 * autor, que la lee aunque ya no participe en el proyecto.
 */
export class DenyAppealDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  mensajeResolucion!: string;
}
