'use client';

import dynamic from 'next/dynamic';
import { BarChart3 } from 'lucide-react';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import type { SprintBurndownDto, SprintDetailDto } from '@/lib/types/sprints';
import type { TiempoPorColumnaDto } from '@/lib/services/sprints';

// Igual que burndown y velocidad: recharts se carga aparte, solo si hay algo que dibujar.
const SprintReportChartPlot = dynamic(() => import('./sprint-report-chart-plot'), {
  ssr: false,
  loading: () => <div className="h-[260px] w-full animate-pulse rounded-md bg-surface-container" />,
});

export interface SerieReporte {
  key: string;
  label: string;
  color: string;
}

export type FilaReporte = Record<string, string | number>;

const PRIMARIO = 'var(--color-primary)';
const TERCIARIO = 'var(--color-tertiary)';

const redondear = (n: number) => Math.round(n * 10) / 10;

/** Horas reales reportadas por cada integrante en las tareas del Sprint (tramos de asignación). */
export function horasPorIntegrante(detail: SprintDetailDto): FilaReporte[] {
  const porUsuario = new Map<number, { integrante: string; horas: number }>();
  for (const tarea of detail.tareas) {
    for (const asignacion of tarea.asignaciones) {
      if (!asignacion.horasReales) continue;
      const { idUsuario, nombre, apellido } = asignacion.usuario;
      const previo = porUsuario.get(idUsuario) ?? { integrante: `${nombre} ${apellido}`.trim(), horas: 0 };
      porUsuario.set(idUsuario, { ...previo, horas: previo.horas + asignacion.horasReales });
    }
  }
  return [...porUsuario.values()]
    .map((fila) => ({ ...fila, horas: redondear(fila.horas) }))
    .sort((a, b) => b.horas - a.horas);
}

const MAX_TAREAS_ESTIMADAS = 10;

/** Horas estimadas contra reales de las tareas con estimación (las de mayor estimación, hasta 10). */
export function estimadasContraReales(detail: SprintDetailDto): FilaReporte[] {
  return detail.tareas
    .filter((t) => (t.tiempoEstimadoHoras ?? 0) > 0)
    .sort((a, b) => (b.tiempoEstimadoHoras ?? 0) - (a.tiempoEstimadoHoras ?? 0))
    .slice(0, MAX_TAREAS_ESTIMADAS)
    .map((t) => ({
      tarea: t.tituloTarea.length > 18 ? `${t.tituloTarea.slice(0, 17)}…` : t.tituloTarea,
      estimadas: t.tiempoEstimadoHoras ?? 0,
      reales: redondear(t.asignaciones.reduce((suma, a) => suma + (a.horasReales ?? 0), 0)),
    }));
}

/** Tareas pendientes y completadas por día, de las instantáneas diarias del Sprint. */
export function tareasPorEstadoEnElTiempo(burndown: SprintBurndownDto): FilaReporte[] {
  return burndown.instantaneas.map((i) => ({
    fecha: new Date(i.fecha).toLocaleDateString('es-GT', { timeZone: 'UTC', day: 'numeric', month: 'short' }),
    pendientes: i.tareasPendientes,
    completadas: i.tareasCompletadas,
  }));
}

const NOMBRE_COLUMNA = { POR_HACER: 'Por hacer', EN_PROGRESO: 'En progreso', EN_REVISION: 'En revisión' } as const;

export function tiempoPorColumna(datos: TiempoPorColumnaDto): FilaReporte[] {
  return datos.columnas
    .filter((c) => c.estado in NOMBRE_COLUMNA)
    .map((c) => ({ columna: NOMBRE_COLUMNA[c.estado as keyof typeof NOMBRE_COLUMNA], horas: c.promedioHoras }));
}

export const SERIES = {
  horas: [{ key: 'horas', label: 'Horas reales', color: PRIMARIO }],
  estimadasReales: [
    { key: 'estimadas', label: 'Estimadas', color: TERCIARIO },
    { key: 'reales', label: 'Reales', color: PRIMARIO },
  ],
  estados: [
    { key: 'pendientes', label: 'Pendientes', color: TERCIARIO },
    { key: 'completadas', label: 'Completadas', color: PRIMARIO },
  ],
  columnas: [{ key: 'horas', label: 'Horas promedio', color: PRIMARIO }],
} satisfies Record<string, SerieReporte[]>;

interface SprintReportChartProps {
  titulo: string;
  datos: FilaReporte[];
  ejeX: string;
  series: SerieReporte[];
  apilado?: boolean;
  vacio: string;
}

/** Tarjeta de una gráfica de barras de informes del Sprint, con su estado vacío y una tabla accesible equivalente. */
export function SprintReportChart({ titulo, datos, ejeX, series, apilado = false, vacio }: SprintReportChartProps) {
  const hayDatos = datos.some((fila) => series.some((s) => Number(fila[s.key]) > 0));

  return (
    <section aria-label={titulo} className="card-base">
      <h2 className="type-section mb-3">{titulo}</h2>
      {hayDatos ? (
        <>
          <div role="img" aria-label={`Gráfica: ${titulo}`}>
            <SprintReportChartPlot datos={datos} ejeX={ejeX} series={series} apilado={apilado} />
          </div>
          <table className="sr-only">
            <caption>{titulo}</caption>
            <thead>
              <tr>
                <th scope="col">{ejeX}</th>
                {series.map((s) => (
                  <th key={s.key} scope="col">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {datos.map((fila) => (
                <tr key={String(fila[ejeX])}>
                  <th scope="row">{fila[ejeX]}</th>
                  {series.map((s) => (
                    <td key={s.key}>{fila[s.key]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <Empty role="status">
          <EmptyMedia variant="subtle">
            <BarChart3 aria-hidden="true" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{vacio}</EmptyTitle>
            <EmptyDescription>Se llenará conforme el equipo trabaje en el Sprint.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </section>
  );
}
