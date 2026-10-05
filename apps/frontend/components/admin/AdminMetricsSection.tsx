'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { AlertCircle, ChartLine } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { formatearHoras } from '@/lib/hours/format';
import {
  getAdminMetricas,
  type AdminMetricas,
  type AdminMetricasPeriodo,
  type AdminMetricasPunto,
} from '@/lib/services/admin';

type Serie = Exclude<keyof AdminMetricasPunto, 'inicio'>;

interface MetricaConfig {
  serie: Serie;
  label: string;
  descripcion: string;
  esHoras?: boolean;
}

/**
 * HU-178 (T-301): una gráfica por métrica, nunca dos escalas en el mismo eje
 * (horas y conteos no se comparan). Un solo color de acento,
 * `--color-primary`, igual que BurndownChart.
 */
export const METRICAS: MetricaConfig[] = [
  { serie: 'usuariosNuevos', label: 'Usuarios nuevos', descripcion: 'Cuentas creadas' },
  {
    serie: 'usuariosActivos',
    label: 'Usuarios activos',
    descripcion: 'Según su última sesión: cada usuario cuenta solo en el periodo más reciente en que entró',
  },
  { serie: 'proyectosCreados', label: 'Proyectos creados', descripcion: 'Proyectos nuevos, sin contar eliminados' },
  { serie: 'tareasCompletadas', label: 'Tareas completadas', descripcion: 'Tareas en Hecho, por su última actualización' },
  { serie: 'horasConfirmadas', label: 'Horas confirmadas', descripcion: 'Horas aprobadas, por fecha de aprobación', esHoras: true },
];

const PERIODO_TEXTO: Record<AdminMetricasPeriodo, { actual: string; ventana: string }> = {
  semana: { actual: 'esta semana', ventana: 'en las últimas 8 semanas' },
  mes: { actual: 'este mes', ventana: 'en los últimos 6 meses' },
};

/** `inicio` es una fecha calendario: parseISO la toma en hora local, sin corrimiento. */
export function formatearInicio(inicio: string, periodo: AdminMetricasPeriodo): string {
  return format(parseISO(inicio), periodo === 'semana' ? 'd MMM' : 'MMM yyyy', { locale: es });
}

function formatearValor(valor: number, esHoras?: boolean): string {
  return esHoras ? formatearHoras(String(Math.round(valor * 100) / 100)) : String(valor);
}

export function sinDatos(metricas: AdminMetricas): boolean {
  return metricas.serie.every((p) => METRICAS.every((m) => p[m.serie] === 0));
}

function MetricTrendCard({
  config,
  metricas,
}: {
  config: MetricaConfig;
  metricas: AdminMetricas;
}) {
  const { serie, periodo } = metricas;
  const actual = serie[serie.length - 1]?.[config.serie] ?? 0;
  const total = serie.reduce((acc, p) => acc + p[config.serie], 0);
  const textos = PERIODO_TEXTO[periodo];

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
      <div>
        <span className="text-[10px] font-black uppercase tracking-widest text-tertiary">{config.label}</span>
        <p className="mt-1 text-4xl font-black tracking-tighter text-on-surface">
          {formatearValor(actual, config.esHoras)}
        </p>
        <p className="text-xs text-tertiary">
          {textos.actual} · {formatearValor(total, config.esHoras)} {textos.ventana}
        </p>
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={serie} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-outline-variant" vertical={false} />
          <XAxis
            dataKey="inicio"
            tickFormatter={(inicio: string) => formatearInicio(inicio, periodo)}
            tick={{ fontSize: 11 }}
            className="fill-tertiary"
          />
          <YAxis allowDecimals={Boolean(config.esHoras)} tick={{ fontSize: 11 }} className="fill-tertiary" />
          <Tooltip
            labelFormatter={(inicio: string) =>
              periodo === 'semana' ? `Semana del ${formatearInicio(inicio, periodo)}` : formatearInicio(inicio, periodo)
            }
            formatter={(valor: number) => [formatearValor(valor, config.esHoras), config.label] as [string, string]}
          />
          <Line
            type="monotone"
            dataKey={config.serie}
            name={config.label}
            stroke="var(--color-primary)"
            strokeWidth={2}
            dot={{ r: 3 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="text-xs text-tertiary">{config.descripcion}</p>
    </div>
  );
}

function MetricasSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
      {METRICAS.map((m) => (
        <Skeleton key={m.serie} className="h-72 rounded-xl" />
      ))}
    </div>
  );
}

export function AdminMetricsSection() {
  const [periodo, setPeriodo] = useState<AdminMetricasPeriodo>('semana');
  const { data, isLoading, isError } = useQuery<AdminMetricas>({
    queryKey: ['adminMetricas', periodo],
    queryFn: () => getAdminMetricas(periodo),
  });

  let contenido: React.ReactNode;
  if (isLoading) {
    contenido = <MetricasSkeleton />;
  } else if (isError || !data) {
    contenido = (
      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-8 text-center">
        <AlertCircle className="mx-auto mb-3 h-8 w-8 text-error" />
        <p className="text-sm font-medium text-on-surface">No se pudieron cargar las tendencias de uso.</p>
      </div>
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
            No se registraron usuarios, proyectos, tareas ni horas {PERIODO_TEXTO[periodo].ventana}.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else {
    contenido = (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {METRICAS.map((m) => (
          <MetricTrendCard key={m.serie} config={m} metricas={data} />
        ))}
      </div>
    );
  }

  return (
    <section className="mb-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-headline text-lg font-black tracking-tight text-on-surface">Tendencias de uso</h2>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={periodo}
          onValueChange={(valor) => valor && setPeriodo(valor as AdminMetricasPeriodo)}
          aria-label="Periodo de las tendencias"
        >
          <ToggleGroupItem value="semana">Semana</ToggleGroupItem>
          <ToggleGroupItem value="mes">Mes</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {contenido}
    </section>
  );
}
