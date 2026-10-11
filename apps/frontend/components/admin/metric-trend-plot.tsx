'use client';

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AdminMetricasPunto } from '@/lib/services/admin';

export interface MetricTrendPlotProps {
  serie: AdminMetricasPunto[];
  dataKey: Exclude<keyof AdminMetricasPunto, 'inicio'>;
  label: string;
  esHoras?: boolean;
  formatearEje: (inicio: string) => string;
  formatearEtiqueta: (inicio: string) => string;
  formatearValor: (valor: number) => string;
}

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
}: MetricTrendPlotProps) {
  return (
    <ResponsiveContainer width="100%" height={140}>
      <LineChart data={serie} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-outline-variant" vertical={false} />
        <XAxis dataKey="inicio" tickFormatter={formatearEje} tick={{ fontSize: 11 }} className="fill-tertiary" />
        <YAxis allowDecimals={Boolean(esHoras)} tick={{ fontSize: 11 }} className="fill-tertiary" />
        <Tooltip
          labelFormatter={formatearEtiqueta}
          formatter={(valor: number) => [formatearValor(valor), label] as [string, string]}
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
    </ResponsiveContainer>
  );
}
