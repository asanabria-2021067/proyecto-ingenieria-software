'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
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
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={serie} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-outline-variant" />
        <XAxis dataKey="sprint" tick={{ fontSize: 11 }} className="fill-tertiary" />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11 }}
          className="fill-tertiary"
          label={{ value: 'Story points', angle: -90, position: 'insideLeft', fontSize: 11 }}
        />
        <Tooltip
          formatter={(valor: number | string) => [valor ?? 'Sin puntos asignados', 'Completado'] as [string, string]}
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
    </ResponsiveContainer>
  );
}
