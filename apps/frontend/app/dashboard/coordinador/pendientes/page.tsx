'use client';

import Link from 'next/link';
import { AlertCircle, ChevronRight, ClipboardList, Clock, Inbox, type LucideIcon } from 'lucide-react';
import { PageTitle } from '@/components/ui/page-title';
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb';
import { ADMIN_PAGE, ADMIN_PAGE_LEAD, ADMIN_PAGE_TITLE } from '@/components/admin/admin-page';
import { DATA_TABLE_CARD, DATA_TABLE_ROWS } from '@/components/dashboard/data-table';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { Tag } from '@/components/ui/tag';
import { useCoordinadorPendientes } from '@/hooks/use-coordinador';
import type { ClavePendienteCoordinador } from '@/lib/services/coordinador';

const DESTINOS: Record<ClavePendienteCoordinador, { titulo: string; descripcion: string; href: string; icono: LucideIcon }> = {
  revisiones: {
    titulo: 'Solicitudes de publicación',
    descripcion: 'Proyectos de tus carreras en revisión',
    href: '/dashboard/projects/admin/reviews',
    icono: ClipboardList,
  },
  cierres: {
    titulo: 'Solicitudes de cierre',
    descripcion: 'Proyectos de tus carreras que piden cerrarse',
    href: '/dashboard/coordinador/cierres',
    icono: Clock,
  },
};

/** Lo que espera una decisión del coordinador dentro de su alcance, con su contador. */
export default function CoordinadorPendientesPage() {
  const { data, isLoading, isError, refetch } = useCoordinadorPendientes();

  return (
    <div className={ADMIN_PAGE}>
      <AdminBreadcrumb seccion="Coordinación" pagina="Bandeja de pendientes" />
      <section className="mb-8">
        <PageTitle className={ADMIN_PAGE_TITLE}>Bandeja de pendientes</PageTitle>
        <p className={ADMIN_PAGE_LEAD}>
          Lo que espera tu decisión dentro de tu alcance, con su contador. Cada fila lleva a la bandeja donde se resuelve.
        </p>
      </section>

      {isError ? (
        <Empty tone="danger" role="alert">
          <EmptyMedia variant="icon">
            <AlertCircle aria-hidden="true" className="size-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No pudimos cargar los pendientes</EmptyTitle>
            <EmptyDescription>Revisa tu conexión y vuelve a intentarlo.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              Reintentar
            </Button>
          </EmptyContent>
        </Empty>
      ) : isLoading || !data ? (
        <SkeletonRegion className={DATA_TABLE_CARD} label="Cargando pendientes">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="m-stack h-12" />
          ))}
        </SkeletonRegion>
      ) : data.total === 0 ? (
        <Empty tone="muted" role="status">
          <EmptyMedia variant="icon">
            <Inbox aria-hidden="true" className="size-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Todo al día</EmptyTitle>
            <EmptyDescription>
              No hay nada esperando tu decisión. Si esperabas ver proyectos, revisa que tengas carreras asignadas en tu panel.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/coordinador">Ir al panel</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="flex flex-col gap-stack">
          <p className="type-body text-text-secondary" role="status" aria-live="polite">
            Pendientes: <span className="font-semibold tabular-nums text-text-primary">{data.total}</span>
          </p>
          <ul className={`${DATA_TABLE_CARD} ${DATA_TABLE_ROWS}`}>
            {data.items.map(({ clave, total }) => {
              const destino = DESTINOS[clave];
              const Icono = destino.icono;
              return (
                <li
                  key={clave}
                  data-fila={clave}
                  className="relative flex items-center gap-inline px-card py-stack transition-colors hover:bg-surface-container-low"
                >
                  <Icono className="size-5 shrink-0 text-text-secondary" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={destino.href}
                      className="type-body font-semibold outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-primary/40"
                    >
                      {destino.titulo}
                    </Link>
                    <p className="type-meta">{destino.descripcion}</p>
                  </div>
                  {total > 0 && <Tag tone="amber">Pendiente</Tag>}
                  <span className="w-12 text-center font-headline text-2xl font-bold tabular-nums text-text-primary">{total}</span>
                  <ChevronRight className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
