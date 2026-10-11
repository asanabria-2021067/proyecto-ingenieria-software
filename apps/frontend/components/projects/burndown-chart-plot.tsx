'use client';

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PuntoBurndown } from './burndown-chart';

export interface BurndownChartPlotProps {
  serie: PuntoBurndown[];
  etiquetaEje: string;
  formatearFecha: (iso: string) => string;
}

/**
 * T-293 (HU-176): solo el dibujo de recharts del burndown. BurndownChart lo
 * carga con next/dynamic para que recharts no viaje en el JS inicial.
 */
export default function BurndownChartPlot({ serie, etiquetaEje, formatearFecha }: BurndownChartPlotProps) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={serie} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-outline-variant" />
        <XAxis
          dataKey="fecha"
          tickFormatter={formatearFecha}
          tick={{ fontSize: 11 }}
          className="fill-tertiary"
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11 }}
          className="fill-tertiary"
          label={{ value: etiquetaEje, angle: -90, position: 'insideLeft', fontSize: 11 }}
        />
        <Tooltip
          labelFormatter={(fecha: string) => formatearFecha(fecha)}
          formatter={(valor: number | string, nombre: string) => [valor ?? '—', nombre] as [string, string]}
        />
        <Legend />
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
    </ResponsiveContainer>
  );
}
