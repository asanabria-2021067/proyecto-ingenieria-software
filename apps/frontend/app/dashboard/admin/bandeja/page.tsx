'use client';

import { PageTitle } from '@/components/ui/page-title';
import Link from 'next/link';
import {
  AlertCircle,
  ChevronRight,
  ClipboardList,
  Clock,
  Gavel,
  Inbox,
  KeyRound,
  UserCheck,
  type LucideIcon,
} from 'lucide-react';
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb';
import { ADMIN_PAGE, ADMIN_PAGE_LEAD, ADMIN_PAGE_TITLE } from '@/components/admin/admin-page';
import { DATA_TABLE_CARD, DATA_TABLE_ROWS } from '@/components/dashboard/data-table';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { Tag } from '@/components/ui/tag';
import { useAdminPendientes } from '@/hooks/use-admin-pendientes';
import type { ClavePendiente } from '@/lib/services/admin';

const DESTINOS: Record<ClavePendiente, { titulo: string; descripcion: string; href: string; icono: LucideIcon }> = {
  cuentas: {
    titulo: 'Cuentas pendientes',
    descripcion: 'Cuentas nuevas que esperan verificación',
    href: '/dashboard/admin/cuentas-pendientes',
    icono: UserCheck,
  },
  revisiones: {
    titulo: 'Solicitudes de publicación',
    descripcion: 'Proyectos en revisión por la administración',
    href: '/dashboard/projects/admin/reviews',
    icono: ClipboardList,
  },
  cierres: {
    titulo: 'Solicitudes de cierre',
    descripcion: 'Proyectos que piden cerrarse',
    href: '/dashboard/admin/proyectos?grupo=cierres',
    icono: Clock,
  },
  recuperaciones: {
    titulo: 'Recuperación de contraseña',
    descripcion: 'Solicitudes sin atender',
    href: '/dashboard/admin/solicitudes-recuperacion',
    icono: KeyRound,
  },
  apelaciones: {
    titulo: 'Apelaciones',
    descripcion: 'Apelaciones de liderazgo por resolver',
    href: '/dashboard/admin/apelaciones',
    icono: Gavel,
  },
};

/** MEJ-69: todo lo que espera una decisión del administrador, en una sola lista con su contador. */
export default function AdminPendientesPage() {
  const { data, isLoading, isError, refetch } = useAdminPendientes();

  return (
    <div className={ADMIN_PAGE}>
      <AdminBreadcrumb seccion="Verificación y seguridad" pagina="Bandeja única" />
      <section className="mb-8">
        <PageTitle className={ADMIN_PAGE_TITLE}>Bandeja única</PageTitle>
        <p className={ADMIN_PAGE_LEAD}>
          Lo que espera una decisión de la administración, con su contador. Cada fila lleva a la bandeja donde se resuelve.
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
          {[0, 1, 2, 3, 4].map((i) => (
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
            <EmptyDescription>No hay nada esperando una decisión.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/admin">Ir al Panel Admin</Link>
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
                  <span className="w-12 text-center font-headline text-2xl font-bold tabular-nums text-text-primary">
                    {total}
                  </span>
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
