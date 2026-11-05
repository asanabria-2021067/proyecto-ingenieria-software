'use client';

import { useState } from 'react';
import { AlertCircle, Flag } from 'lucide-react';
import { ADMIN_TAB_LIST, ADMIN_TAB_TRIGGER } from '@/components/admin/admin-tabs';
import { DATA_TABLE_CARD, DATA_TABLE_ROWS } from '@/components/dashboard/data-table';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tag } from '@/components/ui/tag';
import { useReportesPerfil, useResolverReportePerfil } from '@/hooks/use-perfil-portafolio';
import { aviso } from '@/lib/mensajes';
import { MOTIVOS_REPORTE, type EstadoReportePerfil } from '@/lib/services/perfil-portafolio';

const fecha = (valor: string) =>
  new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(valor));

const ESTADOS: { valor: EstadoReportePerfil; etiqueta: string }[] = [
  { valor: 'PENDIENTE', etiqueta: 'Pendientes' },
  { valor: 'ATENDIDO', etiqueta: 'Atendidos' },
  { valor: 'DESCARTADO', etiqueta: 'Descartados' },
];

/** MEJ-154: bandeja de reportes de perfiles y mensajes; el administrador los descarta o marca que actuó. */
export function ReportesPerfilLista() {
  const [estado, setEstado] = useState<EstadoReportePerfil>('PENDIENTE');
  const { data, isLoading, isError, refetch } = useReportesPerfil(estado);
  const resolver = useResolverReportePerfil();

  const resolverReporte = (idReporte: number, accion: 'descartar' | 'actuar') =>
    resolver.mutate(
      { idReporte, accion },
      {
        onSuccess: () => aviso.exito(accion === 'descartar' ? 'Reporte descartado' : 'Reporte marcado como atendido'),
        onError: (error) => aviso.error('No se pudo resolver el reporte', getApiErrorMessage(error, 'admin')),
      },
    );

  return (
    <div className="space-y-stack">
      <Tabs value={estado} onValueChange={(v) => setEstado(v as EstadoReportePerfil)}>
        <TabsList className={ADMIN_TAB_LIST}>
          {ESTADOS.map((e) => (
            <TabsTrigger key={e.valor} value={e.valor} className={ADMIN_TAB_TRIGGER}>
              {e.etiqueta}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isError ? (
        <Empty tone="danger" role="alert">
          <EmptyMedia variant="icon">
            <AlertCircle aria-hidden="true" className="size-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No pudimos cargar los reportes</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              Reintentar
            </Button>
          </EmptyContent>
        </Empty>
      ) : isLoading || !data ? (
        <SkeletonRegion className={DATA_TABLE_CARD} label="Cargando reportes">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="m-stack h-16" />
          ))}
        </SkeletonRegion>
      ) : data.length === 0 ? (
        <Empty tone="muted" role="status">
          <EmptyMedia variant="icon">
            <Flag aria-hidden="true" className="size-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No hay reportes {ESTADOS.find((e) => e.valor === estado)?.etiqueta.toLowerCase()}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className={`${DATA_TABLE_CARD} ${DATA_TABLE_ROWS}`} aria-label="Reportes de perfiles y mensajes">
          {data.map((r) => {
            const reportado = `${r.reportado.nombre} ${r.reportado.apellido}`;
            return (
              <li key={r.idReporte} className="flex flex-col gap-tight px-card py-stack sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-tight">
                  <p className="type-body break-words font-semibold text-text-primary">
                    {r.idMensaje !== null ? 'Mensaje de ' : 'Perfil de '}
                    {reportado}
                  </p>
                  <p className="flex flex-wrap items-center gap-tight">
                    <Tag tone="amber" size="sm">{MOTIVOS_REPORTE.find((m) => m.valor === r.motivo)?.etiqueta ?? r.motivo}</Tag>
                    <span className="type-meta">
                      Reportado por {r.reportante.nombre} {r.reportante.apellido} - {fecha(r.creadoEn)}
                    </span>
                  </p>
                  {r.textoMensaje && (
                    <blockquote className="type-body whitespace-pre-line break-words border-l-2 border-outline-variant pl-tight text-text-secondary">
                      {r.textoMensaje}
                    </blockquote>
                  )}
                  {r.detalle && <p className="type-body whitespace-pre-line break-words text-text-secondary">{r.detalle}</p>}
                </div>
                {r.estado === 'PENDIENTE' ? (
                  <div className="flex shrink-0 gap-tight">
                    <Button type="button" size="sm" variant="outline" disabled={resolver.isPending} aria-label={`Descartar el reporte sobre ${reportado}`} onClick={() => resolverReporte(r.idReporte, 'descartar')}>
                      Descartar
                    </Button>
                    <Button type="button" size="sm" disabled={resolver.isPending} aria-label={`Marcar como atendido el reporte sobre ${reportado}`} onClick={() => resolverReporte(r.idReporte, 'actuar')}>
                      Actuar
                    </Button>
                  </div>
                ) : (
                  <Tag tone={r.estado === 'ATENDIDO' ? 'success' : 'neutral'} className="shrink-0">
                    {r.estado === 'ATENDIDO' ? 'Atendido' : 'Descartado'}
                  </Tag>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
