'use client';

import { useRef, useState } from 'react';
import { AlertCircle, ShieldAlert, ShieldCheck } from 'lucide-react';
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb';
import { SecurityEventDetail } from '@/components/admin/security/security-event-detail';
import { SecurityEventsFilters } from '@/components/admin/security/security-events-filters';
import { SecurityEventsTable } from '@/components/admin/security/security-events-table';
import { DATA_TABLE_CARD, DATA_TABLE_HEAD_ROW, DataTablePager } from '@/components/dashboard/data-table';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { useAdminSecurityEvents } from '@/hooks/use-admin-security-events';
import type { SecurityEvent } from '@/lib/types/admin-security';
import {
  SECURITY_EVENTS_NO_FILTERS,
  hasSecurityEventsFilters,
  securityEventsFilterErrors,
  securityEventsQueryFromFilters,
  type SecurityEventsFilterValue,
} from '@/lib/admin/security-events';
import { ADMIN_PAGE, ADMIN_PAGE_LEAD, ADMIN_PAGE_TITLE } from '@/components/admin/admin-page';

function TablaSkeleton() {
  return (
    <SkeletonRegion className={DATA_TABLE_CARD} label="Cargando eventos de seguridad">
      <div className={`${DATA_TABLE_HEAD_ROW} px-stack py-tight`}>
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="divide-y divide-outline-variant/50">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-stack px-stack py-inline">
            <Skeleton className="hidden h-4 w-28 shrink-0 @lg/bandeja:block" />
            <div className="min-w-0 flex-1 space-y-tight">
              <Skeleton className="h-5 w-40 rounded-tag" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-8 w-10 rounded-control @3xl/bandeja:w-28" />
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}

type Fallo = { titulo: string; descripcion: string; accion: 'reintentar' | 'limpiar' | null; permiso?: boolean };

/** Cada respuesta fallida dice qué pasó y ofrece solo la salida que puede servir. */
function describirFallo(error: unknown): Fallo {
  const status = (error as { statusCode?: number } | null)?.statusCode;
  if (status === 403) {
    return {
      titulo: 'No tienes permiso para consultar los eventos de seguridad.',
      descripcion: 'Esta vista es exclusiva de los administradores activos.',
      accion: null,
      permiso: true,
    };
  }
  if (status === 401) {
    return { titulo: 'Tu sesión expiró.', descripcion: 'Inicia sesión de nuevo para consultar los eventos.', accion: null };
  }
  if (status === 400) {
    return {
      titulo: 'El servidor no aceptó estos filtros.',
      descripcion: 'Quita los filtros y vuelve a aplicarlos.',
      accion: 'limpiar',
    };
  }
  if (status === 429) {
    return {
      titulo: 'Demasiadas consultas seguidas.',
      descripcion: 'Espera unos segundos antes de volver a intentarlo.',
      accion: 'reintentar',
    };
  }
  if (status !== undefined) {
    return {
      titulo: 'El servidor no pudo entregar los eventos de seguridad.',
      descripcion: 'El problema no está en tus filtros. Vuelve a intentarlo en un momento.',
      accion: 'reintentar',
    };
  }
  return {
    titulo: 'No se pudo conectar con el servidor.',
    descripcion: 'Revisa tu conexión y vuelve a intentarlo.',
    accion: 'reintentar',
  };
}

/**
 * T-310 — visor administrativo de eventos de seguridad. Solo lectura: consulta
 * `GET /admin/eventos-seguridad`, que ya entrega cada evento saneado.
 */
export default function AdminSeguridadPage() {
  const [page, setPage] = useState(1);
  // `filtros` es lo que el administrador ve en los controles; `aplicados`, los
  // últimos filtros válidos, que son los que consulta la tabla.
  const [filtros, setFiltros] = useState<SecurityEventsFilterValue>(SECURITY_EVENTS_NO_FILTERS);
  const [aplicados, setAplicados] = useState<SecurityEventsFilterValue>(SECURITY_EVENTS_NO_FILTERS);
  const errores = securityEventsFilterErrors(filtros);
  const [seleccionado, setSeleccionado] = useState<SecurityEvent | null>(null);
  const disparador = useRef<HTMLElement | null>(null);
  const { data, error, isError, isLoading, isFetching, isPlaceholderData, refetch } = useAdminSecurityEvents({
    ...securityEventsQueryFromFilters(aplicados),
    page,
  });
  const fallo = isError ? describirFallo(error) : null;
  const conFiltros = hasSecurityEventsFilters(aplicados);

  const cambiarFiltros = (siguientes: SecurityEventsFilterValue) => {
    setFiltros(siguientes);
    if (Object.keys(securityEventsFilterErrors(siguientes)).length > 0) return;
    setAplicados(siguientes);
    setPage(1);
  };

  return (
    <div className={ADMIN_PAGE}>
      <AdminBreadcrumb seccion="Verificación y seguridad" pagina="Eventos de seguridad" />
      {/* Sin botón «Actualizar» propio: el de la barra superior del shell vuelve a pedir esta consulta. */}
      <section className="mb-8">
        <h1 className={ADMIN_PAGE_TITLE}>Eventos de seguridad</h1>
        <p className={ADMIN_PAGE_LEAD}>
          Inicios de sesión, bloqueos, recuperaciones de contraseña y cambios de estado de cuenta que la plataforma ya
          registra. Solo consulta: desde aquí no se modifica ningún registro.
        </p>
      </section>

      <div className="@container/bandeja flex flex-col gap-stack">
        <SecurityEventsFilters value={filtros} errors={errores} onChange={cambiarFiltros} tipos={data?.tipos.length ? data.tipos : undefined} />
        {Object.keys(errores).length > 0 && (
          <p className="type-meta" role="status">
            Corrige los filtros marcados para actualizar los resultados.
          </p>
        )}
        {fallo ? (
          // Con un fallo no se muestra la última respuesta buena: ya no se sabe si sigue vigente.
          <Empty tone="danger" role="alert">
            <EmptyMedia variant="icon">
              {fallo.permiso ? <ShieldAlert aria-hidden="true" className="size-7" /> : <AlertCircle aria-hidden="true" className="size-7" />}
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>{fallo.titulo}</EmptyTitle>
              <EmptyDescription>{fallo.descripcion}</EmptyDescription>
            </EmptyHeader>
            {fallo.accion && (
              <EmptyContent>
                {fallo.accion === 'reintentar' ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
                    Reintentar
                  </Button>
                ) : (
                  <Button type="button" variant="outline" size="sm" onClick={() => cambiarFiltros(SECURITY_EVENTS_NO_FILTERS)}>
                    Quitar filtros
                  </Button>
                )}
              </EmptyContent>
            )}
          </Empty>
        ) : isLoading || !data ? (
          <TablaSkeleton />
        ) : data.data.length === 0 ? (
          <Empty tone="muted" role="status">
            <EmptyMedia variant="icon">
              <ShieldCheck aria-hidden="true" className="size-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>
                {data.total > 0
                  ? 'Esta página no tiene eventos.'
                  : conFiltros
                    ? 'Ningún evento coincide con estos filtros.'
                    : 'Todavía no hay eventos de seguridad registrados.'}
              </EmptyTitle>
              <EmptyDescription>
                {data.total > 0
                  ? 'La lista cambió mientras la consultabas.'
                  : conFiltros
                    ? 'Prueba con otro tipo, otro rango de fechas u otro usuario.'
                    : 'Los inicios de sesión, bloqueos y cambios de cuenta aparecerán aquí.'}
              </EmptyDescription>
            </EmptyHeader>
            {(data.total > 0 || conFiltros) && (
              <EmptyContent>
                {data.total > 0 ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => setPage(1)}>
                    Volver a la primera página
                  </Button>
                ) : (
                  <Button type="button" variant="outline" size="sm" onClick={() => cambiarFiltros(SECURITY_EVENTS_NO_FILTERS)}>
                    Quitar filtros
                  </Button>
                )}
              </EmptyContent>
            )}
          </Empty>
        ) : (
          <>
            <p className="type-body text-text-secondary" role="status" aria-live="polite">
              {isPlaceholderData ? (
                'Cargando la página solicitada…'
              ) : (
                <>
                  Eventos encontrados: <span className="font-semibold tabular-nums text-text-primary">{data.total}</span>
                </>
              )}
            </p>
            {/* Mientras llega otra página, la anterior queda atenuada y marcada como ocupada: no es la actual. */}
            <div aria-busy={isPlaceholderData || undefined} className={isPlaceholderData ? 'opacity-60' : undefined}>
              <SecurityEventsTable
                events={data.data}
                onSelect={(event, trigger) => {
                  disparador.current = trigger;
                  setSeleccionado(event);
                }}
              />
            </div>
            {data.totalPages > 1 && (
              <DataTablePager
                pagina={page}
                totalPaginas={data.totalPages}
                onPagina={setPage}
                label="Paginación de eventos de seguridad"
              />
            )}
          </>
        )}
      </div>

      <SecurityEventDetail event={seleccionado} onClose={() => setSeleccionado(null)} returnFocusRef={disparador} />
    </div>
  );
}
