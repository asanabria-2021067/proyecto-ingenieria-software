'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, ChevronRight, Gavel, SearchX } from 'lucide-react';
import { useAdminAppeals, useAdminAppealsSummary } from '@/hooks/use-leadership';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb';
import { DashboardSearchField } from '@/components/dashboard/dashboard-search-field';
import {
  DATA_TABLE_CARD,
  DATA_TABLE_HEAD_ROW,
  DATA_TABLE_HEAD_TEXT,
  DATA_TABLE_ROW_BORDER,
  DATA_TABLE_ROW_HOVER,
  DataTablePager,
} from '@/components/dashboard/data-table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import {
  ESTADO_APELACION_BADGE,
  FILTROS_APELACION,
  appealDetailHref,
  appealsInboxHref,
  coincideApelacion,
  formatearFechaApelacion,
  nombreCompleto,
  parseFiltroApelacion,
  type FiltroApelacion,
} from '@/lib/admin/appeals';
import type { ApelacionItemDto } from '@/lib/types/leadership';

// Mismas clases de tabla que las bandejas de Proyectos (closed-projects-board).
const TH = `h-auto whitespace-normal px-stack py-tight ${DATA_TABLE_HEAD_TEXT}`;
const TD = 'whitespace-normal px-stack py-inline align-middle';
// Columnas que solo caben desde cierto ancho de la tarjeta; antes van como metadata bajo el asunto.
const COL_PROYECTO = '@4xl/bandeja:table-cell';
const META_PROYECTO = '@4xl/bandeja:hidden';
const COL_PERSONAS = '@2xl/bandeja:table-cell';
const META_PERSONAS = '@2xl/bandeja:hidden';
const COL_FECHA = '@3xl/bandeja:table-cell';
const META_FECHA = '@3xl/bandeja:hidden';
const COL_ESTADO = '@xl/bandeja:table-cell';
const META_ESTADO = '@xl/bandeja:hidden';

const VACIO_POR_FILTRO: Record<FiltroApelacion, string> = {
  PENDIENTE: 'No hay apelaciones pendientes.',
  ACEPTADA: 'No hay apelaciones aceptadas.',
  DENEGADA: 'No hay apelaciones denegadas.',
  CANCELADA: 'No hay apelaciones canceladas.',
  TODAS: 'No hay apelaciones.',
};

function Persona({ persona }: { persona: { nombre: string; apellido: string } }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-tight">
      <Avatar className="size-7 shrink-0">
        <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">
          {`${persona.nombre.charAt(0)}${persona.apellido.charAt(0)}`.toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="type-body truncate text-text-primary">{nombreCompleto(persona)}</span>
    </span>
  );
}

function EstadoPill({ estado }: { estado: string }) {
  const badge = ESTADO_APELACION_BADGE[estado] ?? { label: estado, className: 'pill-neutral' };
  return <span className={`pill pill-sm ${badge.className}`}>{badge.label}</span>;
}

/** Una resuelta se fecha por su resolución (o cancelación); una pendiente, por su solicitud. */
function fechaRelevante(a: ApelacionItemDto): string {
  return formatearFechaApelacion(a.estadoApelacion !== 'PENDIENTE' && a.resueltaEn ? a.resueltaEn : a.creadaEn);
}

function tituloProyecto(a: ApelacionItemDto): string {
  return a.proyecto?.tituloProyecto ?? `Proyecto #${a.idProyecto}`;
}

function TablaSkeleton() {
  return (
    <div className={DATA_TABLE_CARD} role="status" aria-label="Cargando apelaciones">
      <div className={`${DATA_TABLE_HEAD_ROW} px-stack py-tight`}>
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="divide-y divide-outline-variant/50">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-stack px-stack py-inline">
            <div className="min-w-0 flex-1 space-y-tight">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="hidden h-4 w-32 @2xl/bandeja:block" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

function FilaApelacion({ apelacion: a, filtro, page }: { apelacion: ApelacionItemDto; filtro: FiltroApelacion; page: number }) {
  const pendiente = a.estadoApelacion === 'PENDIENTE';
  const accion = pendiente ? 'Revisar' : 'Ver resolución';

  return (
    <TableRow className={`${DATA_TABLE_ROW_BORDER} ${DATA_TABLE_ROW_HOVER}`}>
      <TableCell className={`${TD} min-w-0`}>
        <p className="type-body break-words font-semibold text-text-primary">{a.asunto}</p>
        <div className="mt-micro flex flex-wrap items-center gap-x-tight gap-y-micro">
          <span className={META_ESTADO}>
            <EstadoPill estado={a.estadoApelacion} />
          </span>
          <span className={`type-meta ${META_PROYECTO}`}>{tituloProyecto(a)}</span>
          <span className={`type-meta tabular-nums ${META_FECHA}`}>· {fechaRelevante(a)}</span>
          <span className={`type-meta ${META_PERSONAS}`}>
            · {nombreCompleto(a.liderSolicitante)} → {nombreCompleto(a.candidatoPropuesto)}
          </span>
        </div>
      </TableCell>
      <TableCell className={`${TD} hidden ${COL_PROYECTO}`}>
        <Link href={`/dashboard/admin/proyectos/${a.idProyecto}`} className="type-body font-medium text-primary hover:underline">
          {tituloProyecto(a)}
        </Link>
      </TableCell>
      <TableCell className={`${TD} hidden ${COL_PERSONAS}`}>
        <Persona persona={a.liderSolicitante} />
      </TableCell>
      <TableCell className={`${TD} hidden ${COL_PERSONAS}`}>
        <Persona persona={a.candidatoPropuesto} />
      </TableCell>
      <TableCell className={`${TD} hidden ${COL_FECHA}`}>
        <span className="type-body whitespace-nowrap tabular-nums text-text-secondary">{fechaRelevante(a)}</span>
      </TableCell>
      <TableCell className={`${TD} hidden ${COL_ESTADO}`}>
        <EstadoPill estado={a.estadoApelacion} />
      </TableCell>
      <TableCell className="whitespace-normal px-micro py-inline text-right align-middle @2xl/bandeja:px-stack">
        <Link
          href={appealDetailHref(a.idApelacion, filtro, page)}
          aria-label={`${accion}: apelación #${a.idApelacion}, ${a.asunto}`}
          className="ml-auto flex min-h-11 w-fit min-w-11 items-center justify-center gap-micro whitespace-nowrap rounded-control px-tight type-meta font-semibold text-primary hover:underline"
        >
          <span className="hidden @2xl/bandeja:inline">{accion}</span>
          <ChevronRight className="size-4 @2xl/bandeja:size-3.5" aria-hidden="true" />
        </Link>
      </TableCell>
    </TableRow>
  );
}

/**
 * VIEW-18 (F015) — bandeja administrativa de apelaciones de liderazgo.
 *
 * Solo lista: revisar y resolver ocurre en `/dashboard/admin/apelaciones/[apelacionId]`.
 * Las pestañas separan la bandeja de trabajo (Pendientes, la predeterminada)
 * del historial (Aceptadas, Denegadas, Canceladas) y de «Todas»; el orden y la
 * paginación son del backend (las resueltas, por fecha de resolución). La
 * pestaña y la página viven en la URL; la búsqueda es local a la página cargada.
 */
export default function AppealsInboxClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filtro = parseFiltroApelacion(searchParams.get('estado'));
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const estado = filtro === 'TODAS' ? undefined : filtro;

  const { data, isPending, isError, error, refetch } = useAdminAppeals(estado, page);
  const resumen = useAdminAppealsSummary();
  const [busqueda, setBusqueda] = useState('');

  const items = useMemo(() => data?.items ?? [], [data]);
  const visibles = useMemo(() => items.filter((a) => coincideApelacion(a, busqueda)), [items, busqueda]);
  const total = data?.total ?? 0;
  const limit = data?.limit ?? 20;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const hayBusqueda = busqueda.trim() !== '';

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pb-12 pt-8 md:px-8">
      <AdminBreadcrumb seccion="Gobernanza" seccionHref="/dashboard/admin" pagina="Apelaciones" />

      <section className="mb-6">
        <h1 className="type-display text-balance">Apelaciones de liderazgo</h1>
        <p className="mt-tight max-w-2xl text-base text-tertiary">
          Solicitudes de los líderes para transferir su liderazgo. La apelación es una solicitud, no una designación.
        </p>
      </section>

      <div className="@container/bandeja flex flex-col gap-stack">
        {/* La barra se desplaza en horizontal dentro de sí misma; la página nunca desborda.
            `relative`: los textos `sr-only` (absolutos) quedan dentro del área desplazable. */}
        <nav aria-label="Filtrar por estado" className="relative -mx-1 overflow-x-auto px-1 pb-1">
          <ul className="flex min-w-max items-center gap-1 border-b border-outline-variant/50">
            {FILTROS_APELACION.map((f) => {
              const activo = f.value === filtro;
              const cantidad = resumen.data?.[f.value];
              return (
                <li key={f.value}>
                  <Link
                    href={appealsInboxHref(f.value)}
                    aria-current={activo ? 'page' : undefined}
                    className={`-mb-px inline-flex items-center gap-tight border-b-2 px-3 py-2 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 ${
                      activo
                        ? 'border-primary text-primary'
                        : 'border-transparent text-text-secondary hover:border-outline-variant hover:text-text-primary'
                    }`}
                  >
                    {f.label}
                    {cantidad != null && (
                      <span className={`pill pill-sm tabular-nums ${activo ? 'pill-green' : 'pill-neutral'}`}>
                        <span className="sr-only">: </span>
                        {cantidad}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <section aria-label="Buscar apelaciones" className="flex flex-col gap-inline @2xl/bandeja:flex-row @2xl/bandeja:items-center @2xl/bandeja:justify-between">
          <DashboardSearchField
            containerClassName="w-full @2xl/bandeja:max-w-md"
            name="busqueda"
            autoComplete="off"
            spellCheck={false}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por proyecto, asunto, solicitante o candidato…"
            aria-label="Buscar apelaciones por proyecto, asunto, solicitante o candidato"
          />
          {!isPending && !isError && (
            <p className="type-body text-text-secondary" role="status" aria-live="polite">
              {hayBusqueda && (
                <>
                  <span className="font-semibold tabular-nums text-text-primary">{visibles.length}</span> de{' '}
                </>
              )}
              <span className="font-semibold tabular-nums text-text-primary">{total}</span>{' '}
              {total === 1 ? 'apelación' : 'apelaciones'}
              {totalPages > 1 && <> · página {page} de {totalPages}</>}
            </p>
          )}
        </section>

        {isError ? (
          <Empty tone="danger" role="alert">
            <EmptyMedia variant="icon">
              <AlertCircle aria-hidden="true" className="size-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>{getApiErrorMessage(error, 'admin')}</EmptyTitle>
            </EmptyHeader>
            <EmptyContent>
              <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
                Reintentar
              </Button>
            </EmptyContent>
          </Empty>
        ) : isPending ? (
          <TablaSkeleton />
        ) : items.length === 0 ? (
          <Empty role="status">
            <EmptyMedia variant="icon">
              <Gavel aria-hidden="true" className="size-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>{VACIO_POR_FILTRO[filtro]}</EmptyTitle>
              <EmptyDescription>
                {filtro === 'PENDIENTE'
                  ? 'Cuando un líder apele su liderazgo, aparecerá aquí. Las ya resueltas están en las demás pestañas.'
                  : 'Cuando haya apelaciones en este estado, aparecerán aquí.'}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : visibles.length === 0 ? (
          <Empty role="status">
            <EmptyMedia variant="icon">
              <SearchX aria-hidden="true" className="size-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No encontramos apelaciones que coincidan con “{busqueda.trim()}”.</EmptyTitle>
              <EmptyDescription>La búsqueda cubre la página cargada: prueba con otro texto o cambia de página.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button type="button" variant="outline" size="sm" onClick={() => setBusqueda('')}>
                Limpiar búsqueda
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <>
            <div className={DATA_TABLE_CARD}>
              <Table>
                <TableHeader>
                  <TableRow className={`${DATA_TABLE_HEAD_ROW} hover:bg-surface-container-low`}>
                    <TableHead scope="col" className={TH}>
                      Asunto
                    </TableHead>
                    <TableHead scope="col" className={`${TH} hidden ${COL_PROYECTO}`}>
                      Proyecto
                    </TableHead>
                    <TableHead scope="col" className={`${TH} hidden ${COL_PERSONAS}`}>
                      Solicitante
                    </TableHead>
                    <TableHead scope="col" className={`${TH} hidden ${COL_PERSONAS}`}>
                      Candidato
                    </TableHead>
                    <TableHead scope="col" className={`${TH} hidden ${COL_FECHA}`}>
                      {filtro === 'PENDIENTE' || filtro === 'TODAS' ? 'Fecha' : 'Resuelta'}
                    </TableHead>
                    <TableHead scope="col" className={`${TH} hidden ${COL_ESTADO}`}>
                      Estado
                    </TableHead>
                    <TableHead scope="col" className={`${TH} w-14 text-right @2xl/bandeja:w-40`}>
                      <span className="sr-only">Acción</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibles.map((a) => (
                    <FilaApelacion key={a.idApelacion} apelacion={a} filtro={filtro} page={page} />
                  ))}
                </TableBody>
              </Table>
            </div>
            {totalPages > 1 && (
              <DataTablePager
                label="Paginación de apelaciones"
                pagina={page}
                totalPaginas={totalPages}
                onPagina={(p) => router.push(appealsInboxHref(filtro, p))}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
