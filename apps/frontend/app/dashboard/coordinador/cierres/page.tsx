'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { PageTitle } from '@/components/ui/page-title';
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb';
import { ADMIN_PAGE, ADMIN_PAGE_LEAD, ADMIN_PAGE_TITLE } from '@/components/admin/admin-page';
import { REQUEST_INBOX_BUTTON } from '@/components/admin/request-inbox-details';
import {
  RequestInboxCard,
  RequestInboxKpis,
  RequestInboxMeta,
  RequestInboxSection,
  RequestInboxTitle,
} from '@/components/admin/request-inbox';
import { ResumenKpi } from '@/components/dashboard/resumen-kpi';
import { BOTON_CERRADO } from '@/components/projects/available-project-card';
import { Button } from '@/components/ui/button';
import { SkeletonCard, SkeletonList, SkeletonRegion } from '@/components/ui/skeleton';
import { SITUACION_PUBLICACION } from '@/lib/admin/request-status';
import { formatInstanteGuatemala } from '@/lib/admin/sprint-calendar';
import { getAdminReviewInbox } from '@/lib/services/projects';

/**
 * Solicitudes de cierre de los proyectos del alcance del coordinador. Salen de la misma bandeja que las
 * revisiones (el servidor ya la filtra a su alcance); la revisión del cierre es la misma pantalla del admin.
 */
export default function CoordinadorCierresPage() {
  const { data: inbox, isLoading, error } = useQuery({ queryKey: ['adminReviewInbox'], queryFn: getAdminReviewInbox });
  const cierres = inbox?.cierresPendientes ?? [];

  return (
    <div className={ADMIN_PAGE}>
      <AdminBreadcrumb seccion="Coordinación" pagina="Solicitudes de cierre" />
      <section className="mb-8">
        <PageTitle className={ADMIN_PAGE_TITLE}>Solicitudes de cierre</PageTitle>
        <p className={ADMIN_PAGE_LEAD}>
          Proyectos de tus carreras que piden cerrarse. Al aprobar un cierre se acreditan las horas de sus integrantes.
        </p>
      </section>

      {error && (
        <div role="alert" className="mb-6 rounded-card border border-error/30 bg-error/10 px-5 py-4 text-sm font-medium text-error">
          No se pudo cargar la bandeja de cierres.
        </div>
      )}

      {isLoading && !inbox && (
        <SkeletonRegion label="Cargando solicitudes de cierre" className="space-y-10">
          <SkeletonCard count={1} lines={1} className="md:grid-cols-3 lg:grid-cols-3" />
          <SkeletonList count={3} lines={2} trailing={1} layout="rows" />
        </SkeletonRegion>
      )}

      {inbox && (
        <div className="space-y-10">
          <RequestInboxKpis columns={3}>
            <ResumenKpi label="Pendientes de evaluación" valor={cierres.length} punto={SITUACION_PUBLICACION.PENDIENTE_DE_REVISION.punto} />
          </RequestInboxKpis>
          <RequestInboxSection
            title="Pendientes de evaluación"
            empty="No hay solicitudes de cierre en tu alcance"
            isEmpty={cierres.length === 0}
          >
            {cierres.map((c) => (
              <RequestInboxCard
                key={c.idProyecto}
                actions={
                  <Button asChild size="sm" className={`${REQUEST_INBOX_BUTTON} ${BOTON_CERRADO}`}>
                    <Link href={`/dashboard/admin/proyectos/${c.idProyecto}/cierre`} aria-label={`Revisar cierre: ${c.tituloProyecto}`}>
                      Revisar cierre
                    </Link>
                  </Button>
                }
              >
                <RequestInboxTitle>{c.tituloProyecto}</RequestInboxTitle>
                {c.fechaActualizacion && <RequestInboxMeta>Actualizada el {formatInstanteGuatemala(c.fechaActualizacion)}</RequestInboxMeta>}
              </RequestInboxCard>
            ))}
          </RequestInboxSection>
        </div>
      )}
    </div>
  );
}
