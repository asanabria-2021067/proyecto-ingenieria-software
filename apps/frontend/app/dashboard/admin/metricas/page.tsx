'use client';

import dynamic from 'next/dynamic';
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb';
import { ADMIN_PAGE, ADMIN_PAGE_LEAD, ADMIN_PAGE_TITLE } from '@/components/admin/admin-page';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';

// T-293: la sección trae recharts; se carga aparte, igual que cuando vivía en el Panel Admin.
const AdminMetricsSection = dynamic(
  () => import('@/components/admin/AdminMetricsSection').then((m) => m.AdminMetricsSection),
  {
    ssr: false,
    loading: () => (
      <SkeletonRegion className="grid grid-cols-1 gap-grid lg:grid-cols-2" label="Cargando las tendencias de uso">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-96 rounded-card" />
        ))}
      </SkeletonRegion>
    ),
  },
);

/**
 * HU-178 — Tendencias de uso de la plataforma, en su propia página. Solo
 * consulta: lee `GET /admin/metricas`, el mismo endpoint y la misma consulta
 * que usa el resumen del Panel Admin.
 */
export default function AdminMetricasPage() {
  return (
    <div className={ADMIN_PAGE}>
      <AdminBreadcrumb seccion="Métricas" pagina="Tendencias de uso" />
      <section className="mb-8">
        <h1 className={ADMIN_PAGE_TITLE}>Tendencias de uso</h1>
        <p className={ADMIN_PAGE_LEAD}>
          Evolución de usuarios, proyectos, tareas y horas confirmadas en la plataforma, por semana o por mes.
        </p>
      </section>

      <AdminMetricsSection amplia />
    </div>
  );
}
