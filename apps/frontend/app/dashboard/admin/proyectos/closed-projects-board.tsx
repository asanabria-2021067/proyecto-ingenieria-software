'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Archive, ChevronRight, SearchX } from 'lucide-react';
import { useAllAdminProjects } from '@/hooks/use-admin-projects';
import { getApiErrorMessage } from '@/components/projects/api-error';
import {
  estadoBadgeLabel,
  estadoBadgeStyle,
} from '@/components/projects/available-project-card';
import { DASHBOARD_FILTER_TRIGGER_CLASS, DashboardSearchField } from '@/components/dashboard/dashboard-search-field';
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
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import {
  FILTRO_TODOS,
  OPCIONES_ORDEN_CERRADOS,
  filterClosedByTipo,
  searchClosedProjects,
  sortClosedProjects,
  type OrdenCerrados,
} from '@/lib/admin/closed-projects';
import type { AdminProjectListItem } from '@/lib/types/admin-projects';
import { TIPO_LABEL } from '@/types';
import { TipoBadge } from '@/components/projects/tipo-badge';

/**
 * Bandeja de proyectos CERRADOS (`?grupo=cerrados`): consulta histórica.
 *
 * No hay nada que operar en un proyecto cerrado, así que la tabla deja fuera
 * las columnas de supervisión (usuarios activos, Sprint operable, acción
 * sugerida) y la única acción es abrir su vista histórica. Carga el grupo
 * completo para que la búsqueda, el filtro y el orden cubran todos los
 * proyectos y no solo una página; la paginación es sobre el resultado.
 */

const TAMANIO_PAGINA = 20;

// Mismo patrón de barra que Proyectos Activos: buscador ancho y selects al lado.
const BARRA_FILTROS = 'grid grid-cols-1 gap-stack @xl/bandeja:grid-cols-2 @4xl/bandeja:flex @4xl/bandeja:items-center';
const FILTRO_TRIGGER = `w-full ${DASHBOARD_FILTER_TRIGGER_CLASS}`;

// La columna Líder aparece desde 42rem de tarjeta; antes va como metadata bajo el proyecto.
const COL_LIDER = '@2xl/bandeja:table-cell';
const META_LIDER = '@2xl/bandeja:hidden';

const TH = `h-auto whitespace-normal px-stack py-tight ${DATA_TABLE_HEAD_TEXT}`;
const TD_BASE = 'whitespace-normal py-inline align-middle';
const TD = `${TD_BASE} px-stack`;

function iniciales(nombre: string, apellido: string): string {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
}

function nombreLider(item: AdminProjectListItem): string {
  return `${item.lider.nombre} ${item.lider.apellido}`.trim();
}

function FilaProyecto({ item }: { item: AdminProjectListItem }) {
  const href = `/dashboard/admin/proyectos/${item.idProyecto}`;
  return (
    <TableRow className={`${DATA_TABLE_ROW_BORDER} ${DATA_TABLE_ROW_HOVER}`}>
      <TableCell className={`${TD} min-w-0`}>
        <p className="type-body break-words font-semibold text-text-primary">{item.tituloProyecto}</p>
        <div className="mt-micro flex flex-wrap items-center gap-x-tight gap-y-micro">
          <span className={`pill ${estadoBadgeStyle(item.estadoProyecto)}`}>{estadoBadgeLabel(item.estadoProyecto)}</span>
          <TipoBadge tipo={item.tipoProyecto} />
          <span className={`type-meta ${META_LIDER}`}>{nombreLider(item)}</span>
        </div>
      </TableCell>
      <TableCell className={`${TD} hidden ${COL_LIDER}`}>
        <span className="inline-flex min-w-0 items-center gap-tight">
          <Avatar className="size-7 shrink-0">
            <AvatarFallback className="bg-primary/10 type-micro font-bold text-primary">
              {iniciales(item.lider.nombre, item.lider.apellido)}
            </AvatarFallback>
          </Avatar>
          <span className="type-body text-text-primary">{nombreLider(item)}</span>
        </span>
      </TableCell>
      <TableCell className={`${TD_BASE} px-micro text-right @2xl/bandeja:px-stack`}>
        <Link
          href={href}
          aria-label={`Ver histórico de ${item.tituloProyecto}`}
          className="ml-auto flex min-h-11 w-fit min-w-11 items-center justify-center gap-micro whitespace-nowrap rounded-control px-tight type-meta font-semibold text-primary hover:underline"
        >
          <span className="hidden @2xl/bandeja:inline">Ver histórico</span>
          <ChevronRight className="size-4 @2xl/bandeja:size-3.5" aria-hidden="true" />
        </Link>
      </TableCell>
    </TableRow>
  );
}

function TablaSkeleton() {
  return (
    <SkeletonRegion className={DATA_TABLE_CARD} label="Cargando proyectos cerrados">
      <div className={`${DATA_TABLE_HEAD_ROW} px-stack py-tight`}>
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="divide-y divide-outline-variant/50">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-stack px-stack py-inline">
            <div className="min-w-0 flex-1 space-y-tight">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-5 w-32 rounded-pill" />
            </div>
            <Skeleton className="hidden h-4 w-32 @2xl/bandeja:block" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}

export function ClosedProjectsBoard() {
  const proyectos = useAllAdminProjects('cerrados');

  const [busqueda, setBusqueda] = useState('');
  const [tipo, setTipo] = useState<string>(FILTRO_TODOS);
  const [orden, setOrden] = useState<OrdenCerrados>('PREDETERMINADO');
  const [page, setPage] = useState(1);

  // Cualquier cambio de búsqueda, filtro u orden vuelve a la primera página.
  const cambiar = <T,>(setter: (valor: T) => void) => (valor: T) => {
    setter(valor);
    setPage(1);
  };

  const filtrados = useMemo(() => {
    const items = proyectos.data?.items ?? [];
    return sortClosedProjects(filterClosedByTipo(searchClosedProjects(items, busqueda), tipo), orden);
  }, [proyectos.data, busqueda, tipo, orden]);

  const total = proyectos.data?.total ?? 0;
  const hayFiltros = busqueda.trim() !== '' || tipo !== FILTRO_TODOS;
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / TAMANIO_PAGINA));
  // Un refetch puede dejar la página fuera de rango: se acota al pintar.
  const pagina = Math.min(page, totalPaginas);
  const visibles = filtrados.slice((pagina - 1) * TAMANIO_PAGINA, pagina * TAMANIO_PAGINA);

  function limpiarFiltros() {
    setBusqueda('');
    setTipo(FILTRO_TODOS);
    setPage(1);
  }

  return (
    <div className="@container/bandeja flex flex-col gap-stack">
      <section aria-label="Filtros de proyectos cerrados" className={BARRA_FILTROS}>
        <DashboardSearchField
          containerClassName="@xl/bandeja:col-span-2 @4xl/bandeja:flex-1"
          name="busqueda"
          autoComplete="off"
          spellCheck={false}
          value={busqueda}
          onChange={(e) => cambiar(setBusqueda)(e.target.value)}
          placeholder="Buscar proyecto o líder…"
          aria-label="Buscar proyectos cerrados por nombre o líder"
        />

        <Select value={tipo} onValueChange={cambiar(setTipo)}>
          <SelectTrigger aria-label="Filtrar por tipo de proyecto" className={`${FILTRO_TRIGGER} @4xl/bandeja:w-52`}>
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={FILTRO_TODOS}>Todos los tipos</SelectItem>
            {Object.entries(TIPO_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={orden} onValueChange={(valor) => cambiar(setOrden)(valor as OrdenCerrados)}>
          <SelectTrigger aria-label="Ordenar proyectos cerrados" className={`${FILTRO_TRIGGER} @4xl/bandeja:w-56`}>
            <SelectValue placeholder="Ordenar" />
          </SelectTrigger>
          <SelectContent>
            {OPCIONES_ORDEN_CERRADOS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      {proyectos.isSuccess && (
        <div className="flex min-h-8 flex-wrap items-center justify-between gap-inline">
          {/* `total` es el grupo completo; con filtros se antepone cuántos los cumplen. */}
          <p className="type-body text-text-secondary" role="status" aria-live="polite">
            Total de proyectos cerrados:{' '}
            {hayFiltros && (
              <>
                <span className="font-semibold tabular-nums text-text-primary">{filtrados.length}</span> de{' '}
              </>
            )}
            <span className="font-semibold tabular-nums text-text-primary">{total}</span>
          </p>
          {hayFiltros && (
            <Button type="button" variant="ghost" size="sm" onClick={limpiarFiltros} className="font-medium text-primary">
              Limpiar filtros
            </Button>
          )}
        </div>
      )}

      {proyectos.isError ? (
        <Empty tone="danger" role="alert">
          <EmptyMedia variant="icon">
            <AlertCircle aria-hidden="true" className="size-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{getApiErrorMessage(proyectos.error, 'admin')}</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" variant="outline" size="sm" onClick={() => void proyectos.refetch()}>
              Reintentar
            </Button>
          </EmptyContent>
        </Empty>
      ) : proyectos.isPending ? (
        <TablaSkeleton />
      ) : total === 0 ? (
        <Empty tone="muted" role="status">
          <EmptyMedia variant="icon">
            <Archive aria-hidden="true" className="size-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No hay proyectos cerrados.</EmptyTitle>
            <EmptyDescription>Cuando un proyecto entre en este grupo, aparecerá aquí.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : filtrados.length === 0 ? (
        <Empty role="status">
          <EmptyMedia variant="icon">
            <SearchX aria-hidden="true" className="size-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>
              {busqueda.trim() !== ''
                ? `No encontramos proyectos cerrados o líderes que coincidan con “${busqueda.trim()}”.`
                : 'No se encontraron proyectos cerrados con estos filtros.'}
            </EmptyTitle>
            <EmptyDescription>Prueba con otro texto o quita el filtro de tipo.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" variant="outline" size="sm" onClick={limpiarFiltros}>
              Limpiar filtros
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <div className={DATA_TABLE_CARD}>
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className={`${DATA_TABLE_HEAD_ROW} hover:bg-surface-container-low`}>
                  <TableHead scope="col" className={TH}>
                    Proyecto
                  </TableHead>
                  <TableHead scope="col" className={`${TH} hidden w-[30%] ${COL_LIDER}`}>
                    Líder
                  </TableHead>
                  <TableHead scope="col" className={`${TH} w-14 text-right @2xl/bandeja:w-40`}>
                    <span className="sr-only">Acción</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((item) => (
                  <FilaProyecto key={item.idProyecto} item={item} />
                ))}
              </TableBody>
            </Table>
          </div>
          {totalPaginas > 1 && (
            <DataTablePager
              label="Paginación de proyectos cerrados"
              pagina={pagina}
              totalPaginas={totalPaginas}
              onPagina={setPage}
            />
          )}
        </>
      )}
    </div>
  );
}
