'use client';

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
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
import type { PuntoBurndown } from './burndown-chart';

export interface BurndownChartPlotProps {
  serie: PuntoBurndown[];
  etiquetaEje: string;
  formatearFecha: (iso: string) => string;
}

/** Muestra de cada serie en leyenda y tooltip: las dos comparten color y se distinguen por el trazo. */
function Trazo({ punteado = false }: { punteado?: boolean }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <line
        x1="0"
        y1="6"
        x2="12"
        y2="6"
        stroke="var(--color-primary)"
        strokeWidth={2}
        strokeOpacity={punteado ? 0.45 : 1}
        strokeDasharray={punteado ? '3 2' : undefined}
      />
    </svg>
  );
}

const CONFIG: ChartConfig = {
  ideal: { label: 'Ideal', icon: () => <Trazo punteado /> },
  real: { label: 'Real', icon: () => <Trazo /> },
};

/**
 * T-293 (HU-176): solo el dibujo de recharts del burndown. BurndownChart lo
 * carga con next/dynamic para que recharts no viaje en el JS inicial.
 */
export default function BurndownChartPlot({ serie, etiquetaEje, formatearFecha }: BurndownChartPlotProps) {
  return (
    <ChartContainer config={CONFIG} className="aspect-auto h-[280px] w-full">
      <LineChart accessibilityLayer data={serie} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid {...CHART_GRID_PROPS} />
        <XAxis dataKey="fecha" tickFormatter={formatearFecha} {...CHART_AXIS_PROPS} />
        <YAxis
          allowDecimals={false}
          {...CHART_AXIS_PROPS}
          label={{
            value: etiquetaEje,
            angle: -90,
            position: 'insideLeft',
            fontSize: 11,
            fill: 'var(--color-muted-foreground)',
          }}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(fecha) => formatearFecha(String(fecha))}
              // Un día sin instantánea no tiene valor real: se dice, no se muestra como 0.
              valueFormatter={(valor) => (valor == null ? 'Sin dato' : String(valor))}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Line
          type="monotone"
          dataKey="ideal"
          name="Ideal"
          stroke="var(--color-primary)"
          strokeOpacity={0.45}
          strokeDasharray="6 4"
          strokeWidth={2}
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="real"
          name="Real"
          stroke="var(--color-primary)"
          strokeWidth={2.5}
          dot={{ r: 3 }}
          connectNulls={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
