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
} from '@/components/ui/chart';
import type { PuntoHorasProyecto } from './horas-por-proyecto';

const CONFIG = {
  registradas: { label: 'Registradas' },
  acreditadas: { label: 'Acreditadas' },
};

const MAX_ETIQUETA = 18;

/** Etiqueta del eje en una sola línea; el nombre completo va en el tooltip y en la lista inferior. */
export function recortar(nombre: string): string {
  return nombre.length > MAX_ETIQUETA ? `${nombre.slice(0, MAX_ETIQUETA - 1)}…` : nombre;
}

/** Solo el dibujo de recharts; HorasPorProyecto lo carga con next/dynamic. */
export default function HorasPorProyectoPlot({ serie }: { serie: PuntoHorasProyecto[] }) {
  return (
    <ChartContainer config={CONFIG} className="aspect-auto w-full" style={{ height: 56 + serie.length * 52 }}>
      <BarChart accessibilityLayer layout="vertical" data={serie} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid {...CHART_GRID_PROPS} horizontal={false} vertical />
        <XAxis type="number" allowDecimals={false} {...CHART_AXIS_PROPS} unit=" h" />
        <YAxis type="category" dataKey="nombre" width={140} tickFormatter={recortar} {...CHART_AXIS_PROPS} />
        <ChartTooltip content={<ChartTooltipContent valueFormatter={(valor) => `${String(valor)} h`} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="registradas" name="Registradas" fill="var(--color-primary)" radius={[0, 6, 6, 0]} isAnimationActive={false} />
        <Bar dataKey="acreditadas" name="Acreditadas" fill="var(--color-tertiary)" radius={[0, 6, 6, 0]} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  );
}
