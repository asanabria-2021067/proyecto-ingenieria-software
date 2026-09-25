'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import type { SprintBurndownDto } from '@/lib/types/sprints';

export type Eje = 'puntos' | 'tareas';

export interface PuntoBurndown {
  fecha: string;
  ideal: number | null;
  real: number | null;
}

const UN_DIA_MS = 24 * 60 * 60 * 1000;

/** Día calendario UTC de un ISO string — mismo ancla que `@db.Date` en el backend. */
function diaUTC(iso: string): number {
  const fecha = new Date(iso);
  return Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate());
}

/**
 * Construye la serie del gráfico: un punto POR CADA DÍA entre `fechaInicio`
 * y el último día relevante (la fecha planeada de fin si existe, si no el
 * último día con instantánea). `real` viene únicamente de una instantánea
 * que exista para ese día exacto — un día sin fila queda en `null`, nunca
 * interpolado. `ideal` es la recta desde el total inicial hasta 0 en la
 * fecha planeada; sin `fechaFinPlaneada` no hay línea ideal (todo `null`).
 */
export function construirSerie(burndown: SprintBurndownDto, eje: Eje): PuntoBurndown[] {
  const inicio = diaUTC(burndown.fechaInicio);
  const finPlaneado = burndown.fechaFinPlaneada ? diaUTC(burndown.fechaFinPlaneada) : null;
  const ultimaInstantanea =
    burndown.instantaneas.length > 0
      ? diaUTC(burndown.instantaneas[burndown.instantaneas.length - 1].fecha)
      : inicio;
  const fin = Math.max(finPlaneado ?? ultimaInstantanea, ultimaInstantanea, inicio);

  const totalInicial =
    eje === 'puntos' ? burndown.puntosHistoriaPlanificadosTotal : burndown.tareasPlanificadasTotal;
  const duracionDias = finPlaneado !== null ? Math.max(1, (finPlaneado - inicio) / UN_DIA_MS) : null;

  const porDia = new Map<number, number>();
  for (const instantanea of burndown.instantaneas) {
    const valor = eje === 'puntos' ? instantanea.puntosHistoriaRestantes : instantanea.tareasPendientes;
    porDia.set(diaUTC(instantanea.fecha), valor);
  }

  const serie: PuntoBurndown[] = [];
  for (let dia = inicio; dia <= fin; dia += UN_DIA_MS) {
    const transcurridos = (dia - inicio) / UN_DIA_MS;
    const ideal =
      duracionDias === null
        ? null
        : Math.max(0, Math.round(totalInicial * (1 - transcurridos / duracionDias)));
    serie.push({
      fecha: new Date(dia).toISOString(),
      ideal,
      real: porDia.has(dia) ? (porDia.get(dia) as number) : null,
    });
  }
  return serie;
}

function formatearFechaEje(iso: string): string {
  return format(new Date(iso), 'd MMM', { locale: es });
}

export interface BurndownChartProps {
  burndown: SprintBurndownDto;
}

/**
 * T-240 (HU-160): burndown del Sprint — línea ideal + línea real, con
 * huecos honestos (sin interpolar) y toggle story points / número de
 * tareas. Un solo color de acento (`--color-primary`, mismo token del resto
 * de la pantalla): la línea real lo usa sólido, la ideal el mismo color
 * atenuado y punteado — nunca un segundo color.
 */
export function BurndownChart({ burndown }: BurndownChartProps) {
  const [eje, setEje] = useState<Eje>('puntos');
  const serie = useMemo(() => construirSerie(burndown, eje), [burndown, eje]);
  const etiquetaEje = eje === 'puntos' ? 'Story points' : 'Tareas';

  if (burndown.instantaneas.length < 2) {
    return (
      <Empty tone="muted" role="status">
        <EmptyHeader>
          <EmptyTitle>Aún no hay suficientes datos para el burndown.</EmptyTitle>
          <EmptyDescription>
            Se necesitan al menos dos instantáneas diarias del Sprint para poder trazar la línea
            real. Vuelve más tarde, cuando el Sprint lleve un par de días activo.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-on-surface">Burndown del Sprint</h2>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={eje}
          onValueChange={(valor) => valor && setEje(valor as Eje)}
          aria-label="Eje del burndown"
        >
          <ToggleGroupItem value="puntos">Story points</ToggleGroupItem>
          <ToggleGroupItem value="tareas">Número de tareas</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={serie} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-outline-variant" />
          <XAxis
            dataKey="fecha"
            tickFormatter={formatearFechaEje}
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
            labelFormatter={(fecha: string) => formatearFechaEje(fecha)}
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
    </div>
  );
}
