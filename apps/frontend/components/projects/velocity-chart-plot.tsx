'use client';

import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts';
import {
  CHART_AXIS_PROPS,
  CHART_GRID_PROPS,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import type { PuntoVelocidad } from './velocity-chart';

export interface VelocityChartPlotProps {
  serie: PuntoVelocidad[];
  promedio: number | null;
}

/**
 * T-293 (HU-176): solo el dibujo de recharts de la velocidad. VelocityChart
 * lo carga con next/dynamic para que recharts no viaje en el JS inicial.
 */
export default function VelocityChartPlot({ serie, promedio }: VelocityChartPlotProps) {
  return (
    <ChartContainer config={{ puntos: { label: 'Completado' } }} className="aspect-auto h-[260px] w-full">
      <BarChart accessibilityLayer data={serie} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid {...CHART_GRID_PROPS} />
        <XAxis dataKey="sprint" {...CHART_AXIS_PROPS} />
        <YAxis
          allowDecimals={false}
          {...CHART_AXIS_PROPS}
          label={{
            value: 'Story points',
            angle: -90,
            position: 'insideLeft',
            fontSize: 11,
            fill: 'var(--color-muted-foreground)',
          }}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              valueFormatter={(valor) => (valor == null ? 'Sin puntos asignados' : `${String(valor)} pts`)}
            />
          }
        />
        {promedio !== null && (
          <ReferenceLine
            y={promedio}
            stroke="var(--color-tertiary)"
            strokeDasharray="6 4"
            label={{ value: `Promedio: ${promedio}`, position: 'insideTopRight', fontSize: 11, fill: 'var(--color-tertiary)' }}
          />
        )}
        <Bar dataKey="puntos" name="Completado" fill="var(--color-primary)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  );
}
