'use client';

import { PageTitle } from '@/components/ui/page-title';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, FileDown, FileText, Users } from 'lucide-react';
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb';
import { ADMIN_PAGE, ADMIN_PAGE_LEAD, ADMIN_PAGE_TITLE } from '@/components/admin/admin-page';
import {
  HORAS_FILTROS_INICIALES,
  HorasCentralFiltros,
} from '@/components/admin/horas/horas-central-filtros';
import { HorasCentralTabla } from '@/components/admin/horas/horas-central-tabla';
import { HorasTotalesAsociacion } from '@/components/admin/horas/horas-totales-asociacion';
import { DATA_TABLE_CARD } from '@/components/dashboard/data-table';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { useAdminAsociaciones, useAdminHorasCentral, useAdminHorasTotales } from '@/hooks/use-admin-horas';
import { useHorasActual } from '@/hooks/use-horas-semestre';
import { downloadBlob } from '@/lib/download-file';
import { filtrosServidor, totalesPorAsociacion, type FiltrosUI } from '@/lib/hours/semestre';
import { getCarreras, type Carrera } from '@/lib/services/catalogs';
import { descargarHorasCentral } from '@/lib/services/horas-semestre';

/**
 * Vista central de horas: todos los estudiantes activos con sus horas del semestre
 * (meta, declaradas, acreditadas y lo que falta). Solo lectura; los reportes respetan los filtros.
 */
export default function AdminHorasPage() {
  const [ui, setUi] = useState<FiltrosUI>(HORAS_FILTROS_INICIALES);
  const [descargando, setDescargando] = useState<'csv' | 'pdf' | null>(null);
  const [errorDescarga, setErrorDescarga] = useState(false);

  const { data: carreras = [] } = useQuery<Carrera[]>({ queryKey: ['carreras'], queryFn: getCarreras });
  const { data: asociaciones = [] } = useAdminAsociaciones();
  const filtros = useMemo(() => filtrosServidor(ui), [ui]);

  const central = useAdminHorasCentral(filtros);
  const totales = useAdminHorasTotales(filtros);

  const semestre = central.data?.pages[0]?.semestre;
  const semestreActual = useHorasActual().data?.semestre;
  const filas = useMemo(() => central.data?.pages.flatMap((p) => p.filas) ?? [], [central.data]);

  const totalesAsociacion = useMemo(() => {
    const lista = totalesPorAsociacion(totales.data?.porCarrera ?? [], asociaciones);
    return ui.idAsociacion ? lista.filter((t) => t.clave === ui.idAsociacion) : lista;
  }, [totales.data, asociaciones, ui.idAsociacion]);

  async function descargar(formato: 'csv' | 'pdf') {
    setDescargando(formato);
    setErrorDescarga(false);
    try {
      const blob = await descargarHorasCentral(formato, filtros);
      const nombre = semestre ? `horas-${semestre.anio}-${semestre.periodo}` : 'horas';
      downloadBlob(blob, `${nombre}.${formato}`);
    } catch {
      setErrorDescarga(true);
    } finally {
      setDescargando(null);
    }
  }

  return (
    <div className={ADMIN_PAGE}>
      <AdminBreadcrumb seccion="Métricas" pagina="Horas por semestre" />
      <section className="mb-8">
        <PageTitle className={ADMIN_PAGE_TITLE}>Horas por semestre</PageTitle>
        <p className={ADMIN_PAGE_LEAD}>
          Horas beca y de extensión de todos los estudiantes activos. Las declaradas por el estudiante se muestran
          siempre aparte de las acreditadas en UVGenius. Solo consulta.
        </p>
      </section>

      <div className="flex flex-col gap-stack">
        <HorasCentralFiltros
          value={ui}
          onChange={setUi}
          carreras={carreras}
          asociaciones={asociaciones}
          semestreActual={semestreActual}
        />

        <div className="flex flex-wrap items-center gap-inline">
          <Button type="button" variant="outline" size="sm" disabled={descargando !== null} onClick={() => void descargar('csv')}>
            <FileDown aria-hidden="true" />
            {descargando === 'csv' ? 'Descargando...' : 'Descargar CSV'}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={descargando !== null} onClick={() => void descargar('pdf')}>
            <FileText aria-hidden="true" />
            {descargando === 'pdf' ? 'Descargando...' : 'Descargar PDF'}
          </Button>
          {errorDescarga && (
            <p role="alert" className="type-meta text-error">
              No pudimos generar el reporte. Inténtalo de nuevo.
            </p>
          )}
        </div>

        <HorasTotalesAsociacion totales={totalesAsociacion} />

        {central.isError ? (
          <Empty tone="danger" role="alert">
            <EmptyMedia variant="icon">
              <AlertCircle aria-hidden="true" className="size-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No pudimos cargar las horas</EmptyTitle>
              <EmptyDescription>Revisa tu conexión y vuelve a intentarlo.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button type="button" variant="outline" size="sm" onClick={() => void central.refetch()}>
                Reintentar
              </Button>
            </EmptyContent>
          </Empty>
        ) : central.isLoading ? (
          <SkeletonRegion className={DATA_TABLE_CARD} label="Cargando horas por estudiante">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="m-stack h-16" />
            ))}
          </SkeletonRegion>
        ) : filas.length === 0 && !central.hasNextPage ? (
          <Empty tone="muted" role="status">
            <EmptyMedia variant="icon">
              <Users aria-hidden="true" className="size-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>Ningún estudiante coincide con estos filtros</EmptyTitle>
              <EmptyDescription>Prueba con otro semestre, carrera o asociación.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button type="button" variant="outline" size="sm" onClick={() => setUi(HORAS_FILTROS_INICIALES)}>
                Quitar filtros
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <>
            <p className="type-body text-text-secondary" role="status" aria-live="polite">
              Mostrando {filas.length} {filas.length === 1 ? 'estudiante' : 'estudiantes'}
              {central.hasNextPage ? '. Hay más por cargar.' : '.'}
            </p>
            <HorasCentralTabla filas={filas} />
            {central.hasNextPage && (
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  disabled={central.isFetchingNextPage}
                  onClick={() => void central.fetchNextPage()}
                >
                  {central.isFetchingNextPage ? 'Cargando...' : 'Cargar más'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
