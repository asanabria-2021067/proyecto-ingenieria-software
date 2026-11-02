'use client';

import { PageTitle } from '@/components/ui/page-title';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Building2, Plus, SearchX } from 'lucide-react';
import { DashboardSearchField } from '@/components/dashboard/dashboard-search-field';
import { dashboardPage } from '@/components/layout/dashboard-page';
import { PROJECT_CARD_GRID, AvailableProjectCardSkeleton } from '@/components/projects/available-project-card';
import { OrgCard } from '@/components/organizations/org-card';
import { MisInvitaciones } from '@/components/organizations/mis-invitaciones';
import { AsociacionesSeguibles } from '@/components/organizations/asociaciones-seguibles';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { SkeletonRegion } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBuscarOrganizaciones, useMisOrganizaciones, useSolicitarUnirse } from '@/hooks/use-organizations';
import { mensajeErrorOrganizacion } from '@/lib/organizations/errors';
import { aviso } from '@/lib/mensajes';

function GridSkeleton({ label }: { label: string }) {
  return (
    <SkeletonRegion className={PROJECT_CARD_GRID} label={label}>
      {Array.from({ length: 4 }).map((_, i) => (
        <AvailableProjectCardSkeleton key={i} />
      ))}
    </SkeletonRegion>
  );
}

function MisOrganizaciones() {
  const { data: organizaciones = [], isLoading, isError, refetch } = useMisOrganizaciones();

  if (isLoading) return <GridSkeleton label="Cargando tus organizaciones" />;

  if (isError) {
    return (
      <Empty tone="danger" className="surface-enter" role="alert">
        <EmptyMedia variant="icon">
          <AlertCircle aria-hidden="true" className="h-7 w-7" />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>No se pudieron cargar tus organizaciones</EmptyTitle>
          <EmptyDescription>Intenta nuevamente en unos segundos.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button type="button" onClick={() => refetch()}>
            Reintentar
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  if (organizaciones.length === 0) {
    return (
      <Empty className="surface-enter" aria-live="polite">
        <EmptyMedia variant="icon">
          <Building2 aria-hidden="true" className="h-7 w-7" />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>Aún no perteneces a una organización.</EmptyTitle>
          <EmptyDescription>
            Crea la tuya, o busca una pública y solicita unirte para publicar y trabajar proyectos en grupo.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link href="/dashboard/organizaciones/nueva">Crear organización</Link>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className={PROJECT_CARD_GRID}>
      {organizaciones.map((org) => (
        <OrgCard key={org.idOrganizacion} org={org} />
      ))}
    </div>
  );
}

function ExplorarOrganizaciones() {
  const [texto, setTexto] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const solicitar = useSolicitarUnirse();
  const { data, isLoading, isError, refetch } = useBuscarOrganizaciones(q, page);

  useEffect(() => {
    const espera = setTimeout(() => {
      setQ(texto);
      setPage(1);
    }, 300);
    return () => clearTimeout(espera);
  }, [texto]);

  const solicitarUnirse = (idOrganizacion: number) =>
    solicitar.mutate(idOrganizacion, {
      onSuccess: () => aviso.exito('Solicitud enviada', 'Los administradores de la organización la revisarán.'),
      onError: (err) => aviso.error('No se pudo enviar la solicitud', mensajeErrorOrganizacion(err)),
    });

  const resultados = data?.data ?? [];

  return (
    <div>
      <DashboardSearchField
        containerClassName="mb-4.5"
        aria-label="Buscar organizaciones públicas por nombre"
        placeholder="Buscar organizaciones públicas..."
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
      />

      {isLoading && <GridSkeleton label="Buscando organizaciones" />}

      {isError && (
        <Empty tone="danger" className="surface-enter" role="alert">
          <EmptyMedia variant="icon">
            <AlertCircle aria-hidden="true" className="h-7 w-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No se pudo buscar</EmptyTitle>
            <EmptyDescription>Intenta nuevamente en unos segundos.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" onClick={() => refetch()}>
              Reintentar
            </Button>
          </EmptyContent>
        </Empty>
      )}

      {!isLoading && !isError && resultados.length === 0 && (
        <Empty tone="muted" className="surface-enter" aria-live="polite">
          <EmptyMedia variant="icon">
            <SearchX aria-hidden="true" className="h-7 w-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{q ? 'Sin resultados' : 'Todavía no hay organizaciones públicas'}</EmptyTitle>
            <EmptyDescription>
              {q ? 'No encontramos organizaciones públicas con ese nombre.' : 'Cuando alguien cree una, aparecerá aquí.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {resultados.length > 0 && (
        <div className={PROJECT_CARD_GRID}>
          {resultados.map((org) => (
            <OrgCard key={org.idOrganizacion} org={org} onSolicitar={solicitarUnirse} solicitando={solicitar.isPending} />
          ))}
        </div>
      )}

      {data && data.totalPages > 1 && (
        <nav aria-label="Paginación" className="mt-6 flex items-center justify-center gap-3">
          <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Anterior
          </Button>
          <span className="text-sm text-on-surface-variant">
            Página {data.page} de {data.totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= data.totalPages}
            onClick={() => setPage(page + 1)}
          >
            Siguiente
          </Button>
        </nav>
      )}
    </div>
  );
}

export default function OrganizacionesPage() {
  return (
    <div className={dashboardPage('pt-7 pb-10')}>
      <div className="mb-4.5 flex items-start justify-between gap-4">
        <div>
          <PageTitle className="type-display">Mis Organizaciones</PageTitle>
          <p className="mt-1 text-[14px] font-normal text-tertiary">
            Grupos con miembros, roles, chat y proyectos propios.
          </p>
        </div>
        <Button asChild className="h-10 shrink-0">
          <Link href="/dashboard/organizaciones/nueva">
            <Plus aria-hidden="true" />
            Nueva organización
          </Link>
        </Button>
      </div>

      <MisInvitaciones />

      <Tabs defaultValue="mias">
        <TabsList className="mb-4.5">
          <TabsTrigger value="mias">Mis organizaciones</TabsTrigger>
          <TabsTrigger value="explorar">Explorar</TabsTrigger>
          <TabsTrigger value="asociaciones">Asociaciones</TabsTrigger>
        </TabsList>
        <TabsContent value="mias">
          <MisOrganizaciones />
        </TabsContent>
        <TabsContent value="explorar">
          <ExplorarOrganizaciones />
        </TabsContent>
        <TabsContent value="asociaciones">
          <AsociacionesSeguibles />
        </TabsContent>
      </Tabs>
    </div>
  );
}
