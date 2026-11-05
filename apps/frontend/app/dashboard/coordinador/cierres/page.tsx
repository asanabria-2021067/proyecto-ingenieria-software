'use client';

import { PageTitle } from '@/components/ui/page-title';
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb';
import { ADMIN_PAGE, ADMIN_PAGE_LEAD, ADMIN_PAGE_TITLE } from '@/components/admin/admin-page';
import { SkeletonCard, SkeletonList, SkeletonRegion } from '@/components/ui/skeleton';
import { useAdminProjects } from '@/hooks/use-admin-projects';
import { ADMIN_PROJECTS_DEFAULT_LIMIT } from '@/lib/types/admin-projects';
import { ClosureRequestsInbox } from '../../admin/proyectos/closure-requests-inbox';

/**
 * Solicitudes de cierre de los proyectos del alcance del coordinador. Es la misma bandeja por etapas del admin
 * (`GET /admin/proyectos?grupo=cierres`), que el servidor acota a su alcance; la revisión es la misma pantalla.
 */
export default function CoordinadorCierresPage() {
  const { data, isLoading, error } = useAdminProjects('cierres', 1, ADMIN_PROJECTS_DEFAULT_LIMIT);

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

      {isLoading && !data && (
        <SkeletonRegion label="Cargando solicitudes de cierre" className="space-y-10">
          <SkeletonCard count={1} lines={1} className="md:grid-cols-3 lg:grid-cols-3" />
          <SkeletonList count={3} lines={2} trailing={1} layout="rows" />
        </SkeletonRegion>
      )}

      {data && <ClosureRequestsInbox data={data} />}
    </div>
  );
}
