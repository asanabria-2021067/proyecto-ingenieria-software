import { Transform } from 'class-transformer';
import { IsDateString, IsNumber, IsString, Min, MinLength, ValidateIf } from 'class-validator';

/**
 * C061 (06 v2 §9 UPDATE / §41 E057): corrección del autor sobre un registro
 * todavía no consumido. Solo viajan los cuatro campos corregibles: el actor,
 * la asignación, el origen del tramo y la revocación nunca llegan por body.
 *
 * Ningún campo usa @IsOptional(): igual que en UpdateTaskDto, esa decoración
 * trataría `null` como omisión. Se usa @ValidateIf para distinguir omitir
 * (conserva el valor almacenado) de enviar `null`, que solo `nota` admite —
 * es la única retirada explícita que §9 permite. `justificacionExceso` se
 * conserva aunque deje de hacer falta y solo se sustituye con texto no vacío.
 */
export const UPDATE_TIME_RECORD_FIELDS = ['horas', 'fecha', 'nota', 'justificacionExceso'] as const;

export class UpdateTimeRecordDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0.01, { message: 'horas debe ser mayor a 0' })
  horas?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsDateString({}, { message: 'fecha debe ser una fecha válida (YYYY-MM-DD)' })
  fecha?: string;

  // `null` retira la nota; `undefined` la conserva; una cadena vacía se
  // rechaza, para que retirar sea siempre un acto explícito.
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'nota no puede estar vacía si se envía' })
  nota?: string | null;

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'justificacionExceso no puede estar vacía si se envía' })
  justificacionExceso?: string;
}
