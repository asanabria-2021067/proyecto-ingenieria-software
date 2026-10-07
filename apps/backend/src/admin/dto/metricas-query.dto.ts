import { IsIn, IsOptional } from 'class-validator';

export const PERIODOS_METRICAS = ['semana', 'mes'] as const;
export type PeriodoMetricas = (typeof PERIODOS_METRICAS)[number];

export class MetricasQueryDto {
  @IsOptional()
  @IsIn(PERIODOS_METRICAS, { message: `periodo debe ser uno de: ${PERIODOS_METRICAS.join(', ')}` })
  periodo?: PeriodoMetricas;
}
