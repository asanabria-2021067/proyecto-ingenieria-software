'use client';

import { useMemo } from 'react';
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
import { TrendingUp } from 'lucide-react';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import type { SprintComparativeAnalyticsItemDto } from '@/lib/types/sprints';

export interface PuntoVelocidad {
  sprint: string;
  puntos: number | null;
}

/**
 * T-241 (HU-160): velocidad real, en story points completados, SOLO de
 * Sprints `CERRADO` (el congelado de T-239 es la unica fuente). Un Sprint
 * "sin puntos asignados" (`puntosHistoriaCompletados === null`) no entra a
 * la barra ni al promedio — no es lo mismo que "0 puntos".
 */
export function construirSerieVelocidad(
  sprints: SprintComparativeAnalyticsItemDto[],
): { serie: PuntoVelocidad[]; promedio: number | null } {
  const cerrados = sprints.filter((s) => s.estado === 'CERRADO');
  const conPuntos = cerrados.filter(
    (s): s is SprintComparativeAnalyticsItemDto & { puntosHistoriaCompletados: number } =>
      s.puntosHistoriaCompletados !== null,
  );
  const promedio =
    conPuntos.length === 0
      ? null
      : Math.round((conPuntos.reduce((acc, s) => acc + s.puntosHistoriaCompletados, 0) / conPuntos.length) * 10) / 10;

  const serie = cerrados.map((s) => ({ sprint: `Sprint ${s.numero}`, puntos: s.puntosHistoriaCompletados }));
  return { serie, promedio };
}

export interface VelocityChartProps {
  sprints: SprintComparativeAnalyticsItemDto[];
}

/**
 * Grafica de velocidad — story points completados por Sprint CERRADO, con
 * una linea de promedio. Mismo token de acento (`--color-primary`) que
 * BurndownChart: un solo color en toda la pantalla de analitica.
 */
export function VelocityChart({ sprints }: VelocityChartProps) {
  const { serie, promedio } = useMemo(() => construirSerieVelocidad(sprints), [sprints]);
  const cerrados = sprints.filter((s) => s.estado === 'CERRADO');

  if (serie.length === 0) {
    return (
      <Empty role="status">
        <EmptyMedia variant="subtle">
          <TrendingUp aria-hidden="true" />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>Aún no hay Sprints cerrados para calcular la velocidad.</EmptyTitle>
          <EmptyDescription>
            La velocidad se calcula en story points completados por cada Sprint ya cerrado.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div>
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
      {/* Valor exacto por Sprint junto al de la barra: un hueco visual entre
          barras no distingue "0 puntos" de "sin puntos asignados", y el
          tooltip de recharts solo aparece al pasar el mouse. */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-tertiary">
        {cerrados.map((sprint) => (
          <span key={sprint.idSprint}>
            <span className="font-semibold text-on-surface">Sprint {sprint.numero}:</span>{' '}
            {sprint.puntosHistoriaCompletados === null ? 'Sin puntos asignados' : `${sprint.puntosHistoriaCompletados} pts`}
          </span>
        ))}
      </div>
      <p className="mt-2 text-sm font-semibold text-on-surface">
        Promedio: {promedio === null ? 'sin datos suficientes' : `${promedio} pts / sprint`}
      </p>
    </div>
  );
}
