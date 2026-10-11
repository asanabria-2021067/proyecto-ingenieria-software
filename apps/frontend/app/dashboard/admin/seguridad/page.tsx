'use client';

import { useState } from 'react';
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb';
import { SecurityEventsTable } from '@/components/admin/security/security-events-table';
import { DataTablePager } from '@/components/dashboard/data-table';
import { useAdminSecurityEvents } from '@/hooks/use-admin-security-events';

/**
 * T-310 — visor administrativo de eventos de seguridad. Solo lectura: consulta
 * `GET /admin/eventos-seguridad`, que ya entrega cada evento saneado.
 */
export default function AdminSeguridadPage() {
  const [page, setPage] = useState(1);
  const { data } = useAdminSecurityEvents({ page });

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pb-12 pt-8 md:px-8">
      <AdminBreadcrumb seccion="Administración" pagina="Eventos de seguridad" />
      <section className="mb-8">
        <h1 className="type-display text-balance">Eventos de seguridad</h1>
        <p className="mt-2 max-w-2xl text-base text-tertiary">
          Inicios de sesión, bloqueos, recuperaciones de contraseña y cambios de estado de cuenta que la plataforma ya
          registra. Solo consulta: desde aquí no se modifica ningún registro.
        </p>
      </section>

      <div className="@container/bandeja flex flex-col gap-stack">
        {data && data.data.length > 0 && (
          <>
            <p className="type-body text-text-secondary" role="status" aria-live="polite">
              Eventos encontrados: <span className="font-semibold tabular-nums text-text-primary">{data.total}</span>
            </p>
            <SecurityEventsTable events={data.data} />
            {data.totalPages > 1 && (
              <DataTablePager
                pagina={data.page}
                totalPaginas={data.totalPages}
                onPagina={setPage}
                label="Paginación de eventos de seguridad"
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
