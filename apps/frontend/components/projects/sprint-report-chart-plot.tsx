'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  CHART_AXIS_PROPS,
  CHART_GRID_PROPS,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import type { FilaReporte, SerieReporte } from './sprint-report-chart';

export interface SprintReportChartPlotProps {
  datos: FilaReporte[];
  ejeX: string;
  series: SerieReporte[];
  apilado: boolean;
}

/** Solo el dibujo de recharts de los informes del Sprint; SprintReportChart lo carga con next/dynamic. */
export default function SprintReportChartPlot({ datos, ejeX, series, apilado }: SprintReportChartPlotProps) {
  const config: ChartConfig = Object.fromEntries(series.map((s) => [s.key, { label: s.label }]));

  return (
    <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
      <BarChart accessibilityLayer data={datos} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid {...CHART_GRID_PROPS} />
        <XAxis dataKey={ejeX} interval={0} {...CHART_AXIS_PROPS} />
        <YAxis allowDecimals {...CHART_AXIS_PROPS} />
        <ChartTooltip content={<ChartTooltipContent />} />
        {series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={s.color}
            stackId={apilado ? 'a' : undefined}
            radius={apilado && i < series.length - 1 ? 0 : [6, 6, 0, 0]}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
