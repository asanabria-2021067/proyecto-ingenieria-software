'use client';

import Link from 'next/link';
import { AlertCircle, CheckCircle2, Clock, FolderCheck, Users } from 'lucide-react';
import { usePortafolio } from '@/hooks/use-seguimiento';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { Tag } from '@/components/ui/tag';
import { TIPO_LABEL } from '@/types';
import type { TipoProyecto } from '@/types';
import type { ProyectoCerradoResumenDTO } from '@/lib/services/seguimiento';

function fecha(iso: string | null): string {
  if (!iso) return 'Sin fecha';
  const [anio, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${anio}`;
}

export function formatearHoras(horas: number): string {
  return `${horas.toLocaleString('es-GT', { maximumFractionDigits: 2 })} h`;
}

/** Lista de proyectos cerrados con sus cifras; cada tarjeta lleva a la página de resultados. */
export function PortafolioLista({ proyectos }: { proyectos: ProyectoCerradoResumenDTO[] }) {
  return (
    <ul className="grid grid-cols-1 gap-stack md:grid-cols-2" aria-label="Proyectos cerrados">
      {proyectos.map((p) => (
        <li key={p.idProyecto} className="card-base flex flex-col gap-tight" data-testid={`portafolio-${p.idProyecto}`}>
          <div className="flex flex-wrap items-start justify-between gap-tight">
            <Link
              href={`/dashboard/proyectos/${p.idProyecto}/resultados`}
              className="type-subtitle min-w-0 flex-1 text-text-primary hover:underline"
            >
              {p.tituloProyecto}
            </Link>
            <Tag size="sm" tone="subtle">
              {TIPO_LABEL[p.tipoProyecto as TipoProyecto] ?? p.tipoProyecto}
            </Tag>
          </div>
          <p className="type-meta text-text-secondary">
            {fecha(p.fechaInicio)} - {fecha(p.fechaCierre)}
          </p>
          <dl className="grid grid-cols-3 gap-tight type-body">
            <div>
              <dt className="flex items-center gap-1 text-xs text-text-secondary">
                <Users className="size-3.5" aria-hidden="true" />
                Equipo
              </dt>
              <dd className="font-semibold tabular-nums text-text-primary">{p.integrantes}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-xs text-text-secondary">
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                Tareas hechas
              </dt>
              <dd className="font-semibold tabular-nums text-text-primary">{p.tareasHechas}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-xs text-text-secondary">
                <Clock className="size-3.5" aria-hidden="true" />
                Horas
              </dt>
              <dd className="font-semibold tabular-nums text-text-primary">{formatearHoras(p.horasAcreditadas)}</dd>
            </div>
          </dl>
          <Button asChild variant="outline" size="sm" className="mt-tight w-fit">
            <Link href={`/dashboard/proyectos/${p.idProyecto}/resultados`}>Ver resultados</Link>
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** Portafolio de una organización o asociación: sus proyectos cerrados y los resultados de cada uno (MEJ-56). */
export function PortafolioProyectos({ tipo, id }: { tipo: 'organizacion' | 'asociacion'; id: number }) {
  const { data, isLoading, isError, refetch } = usePortafolio(tipo, id);
  const dueno = tipo === 'organizacion' ? 'la organización' : 'la asociación';

  if (isLoading) {
    return (
      <SkeletonRegion label="Cargando el portafolio" className="grid grid-cols-1 gap-stack md:grid-cols-2">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-40 w-full rounded-card" />
        ))}
      </SkeletonRegion>
    );
  }
  if (isError) {
    return (
      <Empty tone="danger" role="alert">
        <EmptyMedia variant="icon">
          <AlertCircle aria-hidden="true" className="size-7" />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>No pudimos cargar el portafolio</EmptyTitle>
          <EmptyDescription>Revisa tu conexión y vuelve a intentarlo.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
            Reintentar
          </Button>
        </EmptyContent>
      </Empty>
    );
  }
  if (!data || data.length === 0) {
    return (
      <Empty tone="muted" role="status">
        <EmptyMedia variant="icon">
          <FolderCheck aria-hidden="true" className="size-7" />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>Todavía no hay proyectos cerrados</EmptyTitle>
          <EmptyDescription>
            Cuando un proyecto de {dueno} se cierre, sus resultados aparecerán aquí como parte del portafolio.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/proyectos">Explorar proyectos</Link>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }
  return <PortafolioLista proyectos={data} />;
}
