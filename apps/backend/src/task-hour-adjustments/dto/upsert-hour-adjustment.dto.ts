import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

/**
 * C070 (06 v2 §41 UpsertHourAdjustmentDto): el delta viaja como STRING decimal
 * con signo opcional y como máximo dos posiciones. No es un `number` por una
 * razón concreta: un delta como `0.1` no tiene representación exacta en coma
 * flotante, y el importe que el líder propone no puede depender de eso.
 *
 * `horasBase` y el autor NO llegan por body: la base es la evidencia del
 * reporte que el servidor observó al ajustar y el autor es el actor
 * autenticado. Aceptarlos del cliente permitiría fabricar una evidencia.
 */
export const DELTA_HORAS_PATTERN = /^[+-]?\d{1,10}(\.\d{1,2})?$/;

export class UpsertHourAdjustmentDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(DELTA_HORAS_PATTERN, {
    message: 'deltaHoras debe ser un decimal con signo opcional y hasta dos posiciones',
  })
  deltaHoras!: string;

  /**
   * Obligatoria cuando el delta no es cero: un ajuste que cambia el importe
   * propuesto sin explicar por qué no es auditable. Con delta cero se omite.
   */
  @ValidateIf((objeto: UpsertHourAdjustmentDto) => !esDeltaCero(objeto.deltaHoras))
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'justificacion es obligatoria cuando deltaHoras no es cero' })
  @MaxLength(5000)
  justificacion?: string;
}

/** Cero es cero se escriba `0`, `0.00`, `+0.0` o `-0.00`. */
export function esDeltaCero(valor: unknown): boolean {
  if (typeof valor !== 'string' || !DELTA_HORAS_PATTERN.test(valor.trim())) {
    return false;
  }
  return Number(valor.trim()) === 0;
}
