'use client';

import { PageTitle } from '@/components/ui/page-title';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Building2, Landmark } from 'lucide-react';
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb';
import { ADMIN_PAGE, ADMIN_PAGE_LEAD, ADMIN_PAGE_TITLE } from '@/components/admin/admin-page';
import {
  DATA_TABLE_CARD,
  DATA_TABLE_HEAD_ROW,
  DATA_TABLE_HEAD_TEXT,
  DATA_TABLE_ROW_BORDER,
} from '@/components/dashboard/data-table';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tag } from '@/components/ui/tag';
import { useResumenAsociaciones } from '@/hooks/use-admin-horas';
import { adminEntidadesQueryKey } from '@/lib/query-keys/admin-accounts';
import { getAdminMetricasEntidades } from '@/lib/services/admin';

const TH = `h-auto whitespace-normal px-stack py-tight ${DATA_TABLE_HEAD_TEXT}`;
const TD = 'px-stack py-inline align-top tabular-nums';

function Cargando({ etiqueta }: { etiqueta: string }) {
  return (
    <SkeletonRegion className={DATA_TABLE_CARD} label={etiqueta}>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="m-stack h-12" />
      ))}
    </SkeletonRegion>
  );
}

function ErrorCarga({ titulo, onRetry }: { titulo: string; onRetry: () => void }) {
  return (
    <Empty tone="danger" role="alert">
      <EmptyMedia variant="icon">
        <AlertCircle aria-hidden="true" className="size-7" />
      </EmptyMedia>
      <EmptyHeader>
        <EmptyTitle>{titulo}</EmptyTitle>
        <EmptyDescription>Revisa tu conexión y vuelve a intentarlo.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Reintentar
        </Button>
      </EmptyContent>
    </Empty>
  );
}

function Seccion({ id, titulo, children }: { id: string; titulo: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-inline">
      <h2 id={id} className="type-section">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function ResumenAsociaciones() {
  const { data, isLoading, isError, refetch } = useResumenAsociaciones();
  const lista = data?.asociaciones ?? [];
  return (
    <Seccion id="resumen-asociaciones" titulo="Resumen por asociación">
      {isError ? (
        <ErrorCarga titulo="No pudimos cargar el resumen por asociación" onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Cargando etiqueta="Cargando el resumen por asociación" />
      ) : lista.length === 0 ? (
        <Empty tone="muted" role="status">
          <EmptyMedia variant="icon">
            <Landmark aria-hidden="true" className="size-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Aún no hay asociaciones activas</EmptyTitle>
            <EmptyDescription>Crea una asociación y nombra su junta para ver su resumen aquí.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/admin/asociaciones">Ir a Asociaciones y juntas</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <p className="type-meta">
            Semestre {data!.semestre.periodo} de {data!.semestre.anio}. Las horas declaradas se muestran siempre aparte de las acreditadas en UVGenius.
          </p>
          <div className={DATA_TABLE_CARD}>
            <Table containerLabel="Resumen por asociación">
              <caption className="sr-only">Resumen de estudiantes, horas y proyectos por asociación</caption>
              <TableHeader>
                <TableRow className={`${DATA_TABLE_HEAD_ROW} hover:bg-surface-container-low`}>
                  <TableHead scope="col" className={TH}>Asociación</TableHead>
                  <TableHead scope="col" className={TH}>Estudiantes</TableHead>
                  <TableHead scope="col" className={TH}>En riesgo</TableHead>
                  <TableHead scope="col" className={TH}>Beca: declaradas</TableHead>
                  <TableHead scope="col" className={TH}>Beca: acreditadas</TableHead>
                  <TableHead scope="col" className={TH}>Beca: falta</TableHead>
                  <TableHead scope="col" className={TH}>Extensión: declaradas</TableHead>
                  <TableHead scope="col" className={TH}>Extensión: acreditadas</TableHead>
                  <TableHead scope="col" className={TH}>Extensión: falta</TableHead>
                  <TableHead scope="col" className={TH}>Proyectos activos</TableHead>
                  <TableHead scope="col" className={TH}>Junta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((a) => (
                  <TableRow key={a.idAsociacion} className={DATA_TABLE_ROW_BORDER}>
                    <TableCell className={`${TD} min-w-40`}>
                      <span className="font-semibold">{a.nombre}</span>
                      <span className="type-meta block">{a.carreras.join(', ')}</span>
                    </TableCell>
                    <TableCell className={TD}>{a.estudiantes}</TableCell>
                    <TableCell className={TD}>
                      {a.enRiesgo > 0 ? <Tag tone="amber" size="sm">{a.enRiesgo}</Tag> : 0}
                    </TableCell>
                    <TableCell className={TD}>{a.becaDeclarada} h</TableCell>
                    <TableCell className={TD}>{a.becaAcreditada} h</TableCell>
                    <TableCell className={TD}>{a.faltaBeca} h</TableCell>
                    <TableCell className={TD}>{a.extensionDeclarada} h</TableCell>
                    <TableCell className={TD}>{a.extensionAcreditada} h</TableCell>
                    <TableCell className={TD}>{a.faltaExtension} h</TableCell>
                    <TableCell className={TD}>{a.proyectosActivos}</TableCell>
                    <TableCell className={TD}>{a.integrantesJunta}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </Seccion>
  );
}

function ActividadEntidades() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: adminEntidadesQueryKey,
    queryFn: getAdminMetricasEntidades,
  });
  if (isError) return <ErrorCarga titulo="No pudimos cargar las métricas" onRetry={() => void refetch()} />;
  if (isLoading || !data) return <Cargando etiqueta="Cargando las métricas de asociaciones y organizaciones" />;
  return (
    <>
      <Seccion id="proyectos-asociaciones" titulo="Proyectos por asociación">
        <div className={DATA_TABLE_CARD}>
          <Table containerLabel="Proyectos por asociación">
            <caption className="sr-only">Proyectos publicados a nombre de cada asociación</caption>
            <TableHeader>
              <TableRow className={`${DATA_TABLE_HEAD_ROW} hover:bg-surface-container-low`}>
                <TableHead scope="col" className={TH}>Asociación</TableHead>
                <TableHead scope="col" className={TH}>Carreras</TableHead>
                <TableHead scope="col" className={TH}>Junta</TableHead>
                <TableHead scope="col" className={TH}>Proyectos</TableHead>
                <TableHead scope="col" className={TH}>Activos</TableHead>
                <TableHead scope="col" className={TH}>Cerrados</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.asociaciones.map((a) => (
                <TableRow key={a.idAsociacion} className={DATA_TABLE_ROW_BORDER}>
                  <TableCell className={`${TD} min-w-40 font-semibold`}>
                    {a.nombre} {a.archivada && <Tag tone="slate" size="sm">Archivada</Tag>}
                  </TableCell>
                  <TableCell className={TD}>{a.carreras}</TableCell>
                  <TableCell className={TD}>{a.integrantesJunta}</TableCell>
                  <TableCell className={TD}>{a.proyectosTotales}</TableCell>
                  <TableCell className={TD}>{a.proyectosActivos}</TableCell>
                  <TableCell className={TD}>{a.proyectosCerrados}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Seccion>

      <Seccion id="organizaciones" titulo="Organizaciones">
        {data.organizaciones.length === 0 ? (
          <Empty tone="muted" role="status">
            <EmptyMedia variant="icon">
              <Building2 aria-hidden="true" className="size-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>Todavía no hay organizaciones</EmptyTitle>
              <EmptyDescription>Aparecerán aquí cuando los usuarios las creen.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className={DATA_TABLE_CARD}>
            <Table containerLabel="Organizaciones">
              <caption className="sr-only">Miembros y proyectos de cada organización</caption>
              <TableHeader>
                <TableRow className={`${DATA_TABLE_HEAD_ROW} hover:bg-surface-container-low`}>
                  <TableHead scope="col" className={TH}>Organización</TableHead>
                  <TableHead scope="col" className={TH}>Visibilidad</TableHead>
                  <TableHead scope="col" className={TH}>Miembros</TableHead>
                  <TableHead scope="col" className={TH}>Proyectos</TableHead>
                  <TableHead scope="col" className={TH}>Activos</TableHead>
                  <TableHead scope="col" className={TH}>Cerrados</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.organizaciones.map((o) => (
                  <TableRow key={o.idOrganizacion} className={DATA_TABLE_ROW_BORDER}>
                    <TableCell className={`${TD} min-w-40 font-semibold`}>
                      {o.nombre} {o.archivada && <Tag tone="slate" size="sm">Archivada</Tag>}
                    </TableCell>
                    <TableCell className={TD}>{o.visibilidad === 'PUBLICA' ? 'Pública' : 'Privada'}</TableCell>
                    <TableCell className={TD}>{o.miembros}</TableCell>
                    <TableCell className={TD}>{o.proyectosTotales}</TableCell>
                    <TableCell className={TD}>{o.proyectosActivos}</TableCell>
                    <TableCell className={TD}>{o.proyectosCerrados}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Seccion>
    </>
  );
}

/** MEJ-36 y MEJ-68: actividad de asociaciones y organizaciones, y resumen de horas por asociación para la autoridad. */
export default function AdminEntidadesPage() {
  return (
    <div className={ADMIN_PAGE}>
      <AdminBreadcrumb seccion="Métricas" pagina="Asociaciones y organizaciones" />
      <section className="mb-8">
        <PageTitle className={ADMIN_PAGE_TITLE}>Asociaciones y organizaciones</PageTitle>
        <p className={ADMIN_PAGE_LEAD}>
          Cuántos estudiantes, horas, proyectos y miembros tiene cada asociación y organización. Solo consulta.
        </p>
      </section>
      <div className="flex flex-col gap-section">
        <ResumenAsociaciones />
        <ActividadEntidades />
      </div>
    </div>
  );
}
