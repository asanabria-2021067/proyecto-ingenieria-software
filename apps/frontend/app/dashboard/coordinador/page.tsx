'use client';

import Link from 'next/link';
import { AlertCircle, GraduationCap } from 'lucide-react';
import { PageTitle } from '@/components/ui/page-title';
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb';
import { ADMIN_PAGE, ADMIN_PAGE_LEAD, ADMIN_PAGE_TITLE } from '@/components/admin/admin-page';
import { RequestInboxKpis } from '@/components/admin/request-inbox';
import { ResumenKpi } from '@/components/dashboard/resumen-kpi';
import { DATA_TABLE_CARD } from '@/components/dashboard/data-table';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { Tag } from '@/components/ui/tag';
import { SITUACION_PUBLICACION } from '@/lib/admin/request-status';
import { useCoordinadorPendientes, useMiAlcance } from '@/hooks/use-coordinador';

/** Panel del coordinador académico: lo que espera su decisión, su alcance y la regla que lo define. */
export default function CoordinadorPanelPage() {
  const alcance = useMiAlcance();
  const pendientes = useCoordinadorPendientes();
  const total = (clave: 'revisiones' | 'cierres') => pendientes.data?.items.find((i) => i.clave === clave)?.total ?? 0;

  return (
    <div className={ADMIN_PAGE}>
      <AdminBreadcrumb seccion="Coordinación" pagina="Panel del coordinador" />
      <section className="mb-8">
        <PageTitle className={ADMIN_PAGE_TITLE}>Panel del coordinador</PageTitle>
        <p className={ADMIN_PAGE_LEAD}>
          Revisa y aprueba los proyectos de tus carreras, valida sus cierres y da seguimiento a las horas de tus
          estudiantes.
        </p>
      </section>

      <div className="flex flex-col gap-section">
        <section aria-labelledby="coordinador-pendientes">
          <h2 id="coordinador-pendientes" className="mb-4 font-headline text-lg font-black tracking-tight text-on-surface">
            Pendientes de tu decisión
          </h2>
          {pendientes.isError ? (
            <p role="alert" className="type-body text-error">
              No pudimos cargar tus pendientes.
            </p>
          ) : (
            <RequestInboxKpis columns={3}>
              <ResumenKpi label="Total" valor={pendientes.data?.total ?? 0} punto={SITUACION_PUBLICACION.PENDIENTE_DE_REVISION.punto} />
              <ResumenKpi label="Solicitudes de publicación" valor={total('revisiones')} punto={SITUACION_PUBLICACION.REENVIADA_PARA_REVISION.punto} />
              <ResumenKpi label="Solicitudes de cierre" valor={total('cierres')} punto={SITUACION_PUBLICACION.EN_ESPERA_DE_CORRECCIONES.punto} />
            </RequestInboxKpis>
          )}
          <Button asChild variant="outline" size="sm" className="mt-stack">
            <Link href="/dashboard/coordinador/pendientes">Ver la bandeja de pendientes</Link>
          </Button>
        </section>

        <section aria-labelledby="coordinador-alcance">
          <h2 id="coordinador-alcance" className="mb-4 font-headline text-lg font-black tracking-tight text-on-surface">
            Tu alcance
          </h2>
          {alcance.isError ? (
            <Empty tone="danger" role="alert">
              <EmptyMedia variant="icon">
                <AlertCircle aria-hidden="true" className="size-7" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>No pudimos cargar tu alcance</EmptyTitle>
                <EmptyDescription>Revisa tu conexión y vuelve a intentarlo.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button type="button" variant="outline" size="sm" onClick={() => void alcance.refetch()}>
                  Reintentar
                </Button>
              </EmptyContent>
            </Empty>
          ) : !alcance.data ? (
            <SkeletonRegion className={DATA_TABLE_CARD} label="Cargando tu alcance">
              <Skeleton className="m-stack h-16" />
            </SkeletonRegion>
          ) : (
            <div className="card-base flex flex-col gap-stack">
              {alcance.data.carreras.length === 0 ? (
                <Empty tone="muted" role="status">
                  <EmptyMedia variant="icon">
                    <GraduationCap aria-hidden="true" className="size-7" />
                  </EmptyMedia>
                  <EmptyHeader>
                    <EmptyTitle>Aún no tienes carreras asignadas</EmptyTitle>
                    <EmptyDescription>
                      Mientras no tengas alcance, tus listas de revisiones, cierres y horas aparecen vacías y no puedes
                      resolver proyectos. Pide a un administrador que te asigne carreras o una facultad.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <ul aria-label="Carreras de tu alcance" className="flex flex-wrap gap-tight">
                  {alcance.data.carreras.map((c) => (
                    <li key={c.idCarrera}>
                      <Tag tone="sage">
                        {c.nombreCarrera}
                        {c.facultad ? ` · ${c.facultad}` : ''}
                      </Tag>
                    </li>
                  ))}
                </ul>
              )}
              <div>
                <h3 className="type-body font-semibold text-text-primary">Qué proyectos son tuyos</h3>
                <p className="type-meta mt-micro">{alcance.data.regla}</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
