'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { TrendingUp } from 'lucide-react';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import type { SprintComparativeAnalyticsItemDto } from '@/lib/types/sprints';

// T-293 (HU-176): recharts se carga aparte, solo cuando hay gráfico que dibujar.
const VelocityChartPlot = dynamic(() => import('./velocity-chart-plot'), {
  ssr: false,
  loading: () => <div className="h-[260px] w-full animate-pulse rounded-md bg-surface-container" />,
});

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
      <VelocityChartPlot serie={serie} promedio={promedio} />
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
