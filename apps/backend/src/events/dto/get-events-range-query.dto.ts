import { IsDateString } from 'class-validator';

/** HU-169 (T-263/T-264): consulta por rango de fechas que la vista mensual/semanal pide. */
export class GetEventsRangeQueryDto {
  @IsDateString({}, { message: 'desde debe ser una fecha/hora válida (ISO 8601)' })
  desde!: string;

  @IsDateString({}, { message: 'hasta debe ser una fecha/hora válida (ISO 8601)' })
  hasta!: string;
}
