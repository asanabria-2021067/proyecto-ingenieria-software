'use client';

import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { AlertCircle, ChartLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { formatearHoras } from '@/lib/hours/format';
import {
  getAdminMetricas,
  type AdminMetricas,
  type AdminMetricasPeriodo,
  type AdminMetricasPunto,
} from '@/lib/services/admin';

type Serie = Exclude<keyof AdminMetricasPunto, 'inicio'>;

// T-293 (HU-176): recharts se carga aparte, solo cuando hay tendencias que dibujar.
const MetricTrendPlot = dynamic(() => import('./metric-trend-plot'), {
  ssr: false,
  loading: () => <div className="h-[140px] w-full animate-pulse rounded-md bg-surface-container" />,
});

interface MetricaConfig {
  serie: Serie;
  label: string;
  descripcion: string;
  /** Unidad del conteo en singular y plural, para el tooltip. Las horas llevan la suya. */
  unidad?: [singular: string, plural: string];
  esHoras?: boolean;
}

/**
 * HU-178 (T-301): una gráfica por métrica, nunca dos escalas en el mismo eje
 * (horas y conteos no se comparan). Un solo color de acento,
 * `--color-primary`, igual que BurndownChart.
 */
export const METRICAS: MetricaConfig[] = [
  { serie: 'usuariosNuevos', label: 'Usuarios nuevos', descripcion: 'Cuentas creadas', unidad: ['usuario', 'usuarios'] },
  {
    serie: 'usuariosActivos',
    label: 'Usuarios activos',
    descripcion: 'Según su última sesión: cada usuario cuenta solo en el periodo más reciente en que entró',
    unidad: ['usuario', 'usuarios'],
  },
  {
    serie: 'proyectosCreados',
    label: 'Proyectos creados',
    descripcion: 'Proyectos nuevos, sin contar eliminados',
    unidad: ['proyecto', 'proyectos'],
  },
  {
    serie: 'tareasCompletadas',
    label: 'Tareas completadas',
    descripcion: 'Tareas en Hecho, por su última actualización',
    unidad: ['tarea', 'tareas'],
  },
  { serie: 'horasConfirmadas', label: 'Horas confirmadas', descripcion: 'Horas aprobadas, por fecha de aprobación', esHoras: true },
];

const PERIODO_TEXTO: Record<AdminMetricasPeriodo, { actual: string; ventana: string; explicacion: string; cargando: string }> = {
  semana: {
    actual: 'esta semana',
    ventana: 'en las últimas 8 semanas',
    explicacion:
      'Cada punto es una semana, de lunes a domingo, en hora de Guatemala: las últimas 8, incluida la actual. La semana en curso todavía está incompleta, así que su valor no es comparable con el de las semanas cerradas.',
    cargando: 'Cargando las tendencias por semana…',
  },
  mes: {
    actual: 'este mes',
    ventana: 'en los últimos 6 meses',
    explicacion:
      'Cada punto es un mes calendario, en hora de Guatemala: los últimos 6, incluido el actual. El mes en curso todavía está incompleto, así que su valor no es comparable con el de los meses cerrados.',
    cargando: 'Cargando las tendencias por mes…',
  },
};

/** Periodo pedido en la URL (`?periodo=`). Cualquier valor que no sea `mes` es `semana`: nunca se consulta uno inválido. */
export function periodoDeLaUrl(valor: string | null | undefined): AdminMetricasPeriodo {
  return valor === 'mes' ? 'mes' : 'semana';
}

/** `inicio` es una fecha calendario: parseISO la toma en hora local, sin corrimiento. */
export function formatearInicio(inicio: string, periodo: AdminMetricasPeriodo): string {
  return format(parseISO(inicio), periodo === 'semana' ? 'd MMM' : 'MMM yyyy', { locale: es });
}

function formatearValor(valor: number, esHoras?: boolean): string {
  return esHoras ? formatearHoras(String(Math.round(valor * 100) / 100)) : String(valor);
}

/** Valor con su unidad: «1 usuario», «3 usuarios», «4.5 h». */
export function formatearValorConUnidad(valor: number, config: MetricaConfig): string {
  const texto = formatearValor(valor, config.esHoras);
  return config.unidad ? `${texto} ${config.unidad[valor === 1 ? 0 : 1]}` : texto;
}

export function sinDatos(metricas: AdminMetricas): boolean {
  return metricas.serie.every((p) => METRICAS.every((m) => p[m.serie] === 0));
}

/** Rejilla de las tarjetas: tres columnas en la sección compacta, dos en la página de Tendencias. */
const REJILLA = {
  compacta: 'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3',
  amplia: 'grid grid-cols-1 gap-grid lg:grid-cols-2',
} as const;

function MetricTrendCard({
  config,
  metricas,
  amplia,
}: {
  config: MetricaConfig;
  metricas: AdminMetricas;
  amplia: boolean;
}) {
  const { serie, periodo } = metricas;
  const actual = serie[serie.length - 1]?.[config.serie] ?? 0;
  const total = serie.reduce((acc, p) => acc + p[config.serie], 0);
  const textos = PERIODO_TEXTO[periodo];

  return (
    <div className="card-base flex flex-col gap-stack">
      <div>
        <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{config.label}</span>
        <p className="mt-micro font-headline text-4xl font-bold tracking-tight tabular-nums text-text-primary">
          {formatearValor(actual, config.esHoras)}
        </p>
        <p className="type-meta">
          {textos.actual}, en curso · {formatearValor(total, config.esHoras)} {textos.ventana}
        </p>
      </div>
      {/* El alto mínimo reserva el sitio mientras llega el módulo de dibujo. */}
      <div className={amplia ? 'min-h-[240px]' : 'min-h-[140px]'}>
        <MetricTrendPlot
          serie={serie}
          dataKey={config.serie}
          label={config.label}
          esHoras={config.esHoras}
          alto={amplia ? 'amplio' : 'compacto'}
          formatearEje={(inicio) => formatearInicio(inicio, periodo)}
          formatearEtiqueta={(inicio) =>
            periodo === 'semana' ? `Semana del ${formatearInicio(inicio, periodo)}` : formatearInicio(inicio, periodo)
          }
          formatearValor={(valor) => formatearValorConUnidad(valor, config)}
        />
      </div>
      <p className="type-meta">{config.descripcion}</p>
    </div>
  );
}

function MetricasSkeleton({ amplia }: { amplia: boolean }) {
  return (
    <div className={amplia ? REJILLA.amplia : REJILLA.compacta} aria-busy="true">
      {METRICAS.map((m) => (
        <Skeleton key={m.serie} className={`rounded-card ${amplia ? 'h-96' : 'h-72'}`} />
      ))}
    </div>
  );
}

/**
 * `amplia`: la variante de la página de Tendencias (`/dashboard/admin/metricas`),
 * con gráficas más altas en dos columnas. El titular lo pone la página.
 *
 * El periodo vive en la URL (`?periodo=semana|mes`): se puede recargar y
 * compartir. Al cambiarlo, las gráficas anteriores siguen a la vista,
 * atenuadas y rotuladas con SU periodo, hasta que llegan las nuevas: nunca se
 * presentan datos de un periodo con el nombre de otro.
 */
export function AdminMetricsSection({ amplia = false }: { amplia?: boolean }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const periodo = periodoDeLaUrl(searchParams?.get('periodo'));
  const cambiarPeriodo = (valor: AdminMetricasPeriodo) => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('periodo', valor);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const { data, isLoading, isError, isFetching, isPlaceholderData, refetch } = useQuery<AdminMetricas>({
    queryKey: ['adminMetricas', periodo],
    queryFn: () => getAdminMetricas(periodo),
    placeholderData: keepPreviousData,
  });

  let contenido: React.ReactNode;
  if (isLoading) {
    contenido = <MetricasSkeleton amplia={amplia} />;
  } else if (isError || !data) {
    contenido = (
      <Empty tone="danger" role="alert">
        <EmptyMedia variant="icon">
          <AlertCircle aria-hidden="true" className="size-7" />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>No se pudieron cargar las tendencias de uso.</EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <Button type="button" onClick={() => void refetch()} disabled={isFetching}>
            Reintentar
          </Button>
        </EmptyContent>
      </Empty>
    );
  } else if (sinDatos(data)) {
    contenido = (
      <Empty role="status">
        <EmptyMedia variant="subtle">
          <ChartLine aria-hidden="true" />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>Aún no hay actividad para mostrar tendencias.</EmptyTitle>
          <EmptyDescription>
            No se registraron usuarios, proyectos, tareas ni horas {PERIODO_TEXTO[data.periodo].ventana}.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else {
    contenido = (
      <div className={amplia ? REJILLA.amplia : REJILLA.compacta}>
        {METRICAS.map((m) => (
          <MetricTrendCard key={m.serie} config={m} metricas={data} amplia={amplia} />
        ))}
      </div>
    );
  }

  // Lo que se ve mientras llega el periodo pedido es todavía el anterior.
  const mostrado = data && !isError ? data.periodo : periodo;

  return (
    <section className="mb-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="type-section">{amplia ? 'Métricas por periodo' : 'Tendencias de uso'}</h2>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={periodo}
          onValueChange={(valor) => valor && cambiarPeriodo(periodoDeLaUrl(valor))}
          aria-label="Periodo de las tendencias"
        >
          <ToggleGroupItem value="semana">Semana</ToggleGroupItem>
          <ToggleGroupItem value="mes">Mes</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <p className="type-meta mb-stack max-w-3xl">{PERIODO_TEXTO[mostrado].explicacion}</p>
      {isPlaceholderData && (
        <p className="type-meta mb-stack" role="status" aria-live="polite">
          {PERIODO_TEXTO[periodo].cargando}
        </p>
      )}
      {/* Mientras llega el otro periodo, el anterior queda atenuado y marcado como ocupado: no es el pedido. */}
      <div aria-busy={isPlaceholderData || undefined} className={isPlaceholderData ? 'opacity-60' : undefined}>
        {contenido}
      </div>
    </section>
  );
}
