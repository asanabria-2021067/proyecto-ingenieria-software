'use client';

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import {
  CHART_AXIS_PROPS,
  CHART_GRID_PROPS,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import type { AdminMetricasPunto } from '@/lib/services/admin';

export interface MetricTrendPlotProps {
  serie: AdminMetricasPunto[];
  dataKey: Exclude<keyof AdminMetricasPunto, 'inicio'>;
  label: string;
  esHoras?: boolean;
  formatearEje: (inicio: string) => string;
  formatearEtiqueta: (inicio: string) => string;
  /** Valor con su unidad, para el tooltip (p. ej. «3 usuarios», «4.5 h»). */
  formatearValor: (valor: number) => string;
  /** `amplio` en la página de Tendencias; `compacto` (por defecto) en tarjetas pequeñas. */
  alto?: 'compacto' | 'amplio';
}

export const ALTO_PLOT = { compacto: 'h-[140px]', amplio: 'h-[240px]' } as const;

/**
 * T-293 (HU-176): solo el dibujo de recharts de una tendencia del panel de
 * administración. AdminMetricsSection lo carga con next/dynamic para que
 * recharts no viaje en el JS inicial de /dashboard/admin.
 */
export default function MetricTrendPlot({
  serie,
  dataKey,
  label,
  esHoras,
  formatearEje,
  formatearEtiqueta,
  formatearValor,
  alto = 'compacto',
}: MetricTrendPlotProps) {
  return (
    <ChartContainer config={{ [dataKey]: { label } }} className={`aspect-auto w-full ${ALTO_PLOT[alto]}`}>
      <LineChart accessibilityLayer data={serie} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid {...CHART_GRID_PROPS} />
        <XAxis dataKey="inicio" tickFormatter={formatearEje} {...CHART_AXIS_PROPS} />
        <YAxis allowDecimals={Boolean(esHoras)} {...CHART_AXIS_PROPS} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(inicio) => formatearEtiqueta(String(inicio))}
              valueFormatter={(valor) => formatearValor(Number(valor))}
            />
          }
        />
        <Line
          type="monotone"
          dataKey={dataKey}
          name={label}
          stroke="var(--color-primary)"
          strokeWidth={2}
          dot={{ r: 3 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
