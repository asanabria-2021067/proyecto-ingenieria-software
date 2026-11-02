'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { useMisHoras } from '@/hooks/use-my-hours';
import type { MisHorasProyecto } from '@/lib/services/users';

// MEJ-14: recharts se carga aparte, solo cuando hay gráfico que dibujar.
const HorasPorProyectoPlot = dynamic(() => import('./horas-por-proyecto-plot'), {
  ssr: false,
  loading: () => <Skeleton className="h-48 w-full rounded-card" />,
});

export interface PuntoHorasProyecto {
  nombre: string;
  registradas: number;
  acreditadas: number;
}

const MAX_PROYECTOS = 8;

/** Un punto por proyecto con horas; cada cifra viene ya calculada por el backend y no se suma aquí. */
export function construirSerieHorasProyecto(proyectos: MisHorasProyecto[]): PuntoHorasProyecto[] {
  return proyectos
    .map((p) => ({ nombre: p.tituloProyecto, registradas: Number(p.registradas), acreditadas: Number(p.acreditadas) }))
    .filter((p) => p.registradas > 0 || p.acreditadas > 0)
    .slice(0, MAX_PROYECTOS);
}

/** MEJ-14: horas registradas y acreditadas por proyecto, para el perfil del estudiante. */
export function HorasPorProyecto() {
  const { data, isLoading, isError } = useMisHoras();

  if (isLoading) return <Skeleton className="h-64 rounded-card" aria-label="Cargando horas por proyecto" />;
  if (isError || !data) return null;
  const serie = construirSerieHorasProyecto(data.proyectos);

  return (
    <section aria-labelledby="horas-proyecto-titulo" className="card-base flex flex-col gap-card">
      <h2 id="horas-proyecto-titulo" className="type-section">
        Horas por proyecto
      </h2>
      {serie.length === 0 ? (
        <Empty tone="muted" role="status">
          <EmptyMedia variant="icon">
            <BarChart3 aria-hidden="true" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Aún no hay horas por proyecto</EmptyTitle>
            <EmptyDescription>Registra tiempo en tus tareas para ver cuánto aportas a cada proyecto.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link href="/dashboard/mis-tareas">Ir a Mis Tareas</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <HorasPorProyectoPlot serie={serie} />
          <ul className="flex flex-col gap-micro type-meta">
            {serie.map((p) => (
              <li key={p.nombre}>
                <span className="font-semibold text-text-primary">{p.nombre}:</span> {p.registradas} h registradas,{' '}
                {p.acreditadas} h acreditadas
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
