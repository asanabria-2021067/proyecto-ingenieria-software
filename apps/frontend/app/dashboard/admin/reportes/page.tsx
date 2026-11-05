'use client';

import { useState } from 'react';
import { AlertCircle, Bug } from 'lucide-react';
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb';
import { ADMIN_PAGE, ADMIN_PAGE_LEAD, ADMIN_PAGE_TITLE } from '@/components/admin/admin-page';
import { ADMIN_TAB_LIST, ADMIN_TAB_TRIGGER } from '@/components/admin/admin-tabs';
import { DATA_TABLE_CARD, DATA_TABLE_ROWS } from '@/components/dashboard/data-table';
import { SafeExternalLink } from '@/components/profile/safe-external-link';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { PageTitle } from '@/components/ui/page-title';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tag } from '@/components/ui/tag';
import { useAtenderReporte, useReportesProblema } from '@/hooks/use-ayuda';
import { aviso } from '@/lib/mensajes';
import type { EstadoReporte } from '@/lib/services/ayuda';

function fecha(valor: string): string {
  return new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(
    new Date(valor),
  );
}

/** MEJ-90: reportes de problemas enviados por los usuarios; el administrador los marca como atendidos. */
export default function AdminReportesPage() {
  const [estado, setEstado] = useState<EstadoReporte>('PENDIENTE');
  const { data, isLoading, isError, refetch } = useReportesProblema(estado);
  const atender = useAtenderReporte();

  return (
    <div className={ADMIN_PAGE}>
      <AdminBreadcrumb seccion="Verificación y seguridad" pagina="Reportes de problemas" />
      <section className="mb-8">
        <PageTitle className={ADMIN_PAGE_TITLE}>Reportes de problemas</PageTitle>
        <p className={ADMIN_PAGE_LEAD}>Problemas que reportaron los usuarios, con la pantalla y el navegador desde donde los enviaron.</p>
      </section>

      <Tabs value={estado} onValueChange={(v) => setEstado(v as EstadoReporte)} className="mb-stack">
        <TabsList className={ADMIN_TAB_LIST}>
          <TabsTrigger value="PENDIENTE" className={ADMIN_TAB_TRIGGER}>
            Pendientes
          </TabsTrigger>
          <TabsTrigger value="ATENDIDO" className={ADMIN_TAB_TRIGGER}>
            Atendidos
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {isError ? (
        <Empty tone="danger" role="alert">
          <EmptyMedia variant="icon">
            <AlertCircle aria-hidden="true" className="size-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No pudimos cargar los reportes</EmptyTitle>
            <EmptyDescription>Revisa tu conexión y vuelve a intentarlo.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              Reintentar
            </Button>
          </EmptyContent>
        </Empty>
      ) : isLoading || !data ? (
        <SkeletonRegion className={DATA_TABLE_CARD} label="Cargando reportes">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="m-stack h-16" />
          ))}
        </SkeletonRegion>
      ) : data.length === 0 ? (
        <Empty tone="muted" role="status">
          <EmptyMedia variant="icon">
            <Bug aria-hidden="true" className="size-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{estado === 'PENDIENTE' ? 'No hay reportes pendientes' : 'Aún no hay reportes atendidos'}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className={`${DATA_TABLE_CARD} ${DATA_TABLE_ROWS}`} aria-label="Reportes de problemas">
          {data.map((r) => (
            <li key={r.idReporte} className="flex flex-col gap-tight px-card py-stack sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-tight">
                <p className="type-body break-words font-semibold text-text-primary">
                  {r.usuario.nombre} {r.usuario.apellido} <span className="type-meta font-normal">({r.usuario.correo})</span>
                </p>
                <p className="type-body whitespace-pre-line break-words text-text-secondary">{r.descripcion}</p>
                <p className="type-meta break-all">
                  {fecha(r.creadoEn)} - Pantalla: {r.ruta}
                </p>
                <p className="type-meta break-words">Navegador: {r.userAgent}</p>
                {r.urlCaptura && (
                  <SafeExternalLink url={r.urlCaptura} className="type-body font-medium text-primary hover:underline">
                    Ver captura
                  </SafeExternalLink>
                )}
              </div>
              {r.estado === 'PENDIENTE' ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={atender.isPending}
                  aria-label={`Marcar como atendido el reporte de ${r.usuario.nombre} ${r.usuario.apellido}`}
                  onClick={() =>
                    atender.mutate(r.idReporte, {
                      onSuccess: () => aviso.exito('Reporte marcado como atendido'),
                      onError: (error) => aviso.error('No se pudo marcar el reporte', getApiErrorMessage(error, 'admin')),
                    })
                  }
                  className="shrink-0"
                >
                  Marcar como atendido
                </Button>
              ) : (
                <Tag tone="success" className="shrink-0">
                  Atendido
                </Tag>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
