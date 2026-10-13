'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { ChartLine } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import type { SprintBurndownDto } from '@/lib/types/sprints';

// T-293 (HU-176): recharts se carga aparte, solo cuando hay gráfico que dibujar.
const BurndownChartPlot = dynamic(() => import('./burndown-chart-plot'), {
  ssr: false,
  loading: () => <div className="h-[280px] w-full animate-pulse rounded-md bg-surface-container" />,
});

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

const FORMATO_DIA_UTC = new Intl.DateTimeFormat('es-GT', { timeZone: 'UTC', day: 'numeric', month: 'short' });

/**
 * Rótulo del eje y del tooltip. Cada punto es un día calendario anclado a
 * medianoche UTC (`diaUTC`), así que se rotula en UTC: en hora local de
 * Guatemala (UTC−6) esa medianoche cae en el día anterior.
 */
export function formatearFechaEje(iso: string): string {
  return FORMATO_DIA_UTC.format(new Date(iso));
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
  // Sin story points planificados el eje de puntos es una recta en 0 que parece
  // «todo completado»: se abre en número de tareas y se explica por qué.
  const sinPuntos = burndown.puntosHistoriaPlanificadosTotal === 0;
  const [eje, setEje] = useState<Eje>(sinPuntos ? 'tareas' : 'puntos');
  const serie = useMemo(() => construirSerie(burndown, eje), [burndown, eje]);
  const etiquetaEje = eje === 'puntos' ? 'Story points' : 'Tareas';

  if (burndown.instantaneas.length < 2) {
    return (
      <Empty role="status">
        <EmptyMedia variant="subtle">
          <ChartLine aria-hidden="true" />
        </EmptyMedia>
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
    <div className="card-base">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="type-subtitle">Burndown del Sprint</h2>
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

      {sinPuntos && (
        <p role="note" className="type-meta mb-4">
          Este Sprint no tiene story points asignados; consulta el número de tareas.
        </p>
      )}

      <BurndownChartPlot serie={serie} etiquetaEje={etiquetaEje} formatearFecha={formatearFechaEje} />

      {/* Los mismos puntos de la gráfica, día a día, para quien no puede leer el SVG.
          Un día sin instantánea se dice «Sin dato»: no es un cero. `sr-only` va en un
          contenedor: una tabla no se deja recortar y desbordaría la página. */}
      <div className="sr-only">
        <table>
          <caption>Burndown del Sprint, en {etiquetaEje.toLowerCase()} pendientes por día</caption>
          <thead>
            <tr>
              <th scope="col">Día</th>
              <th scope="col">Ideal</th>
              <th scope="col">Real</th>
            </tr>
          </thead>
          <tbody>
            {serie.map((punto) => (
              <tr key={punto.fecha}>
                <th scope="row">{formatearFechaEje(punto.fecha)}</th>
                <td>{punto.ideal ?? 'Sin dato'}</td>
                <td>{punto.real ?? 'Sin dato'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
