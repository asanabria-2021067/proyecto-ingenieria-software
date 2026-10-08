'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowRight, CalendarRange, SearchX } from 'lucide-react';
import { SprintListView } from '@/components/admin/sprints/sprint-list-view';
import { SprintMonthView } from '@/components/admin/sprints/sprint-month-view';
import { DASHBOARD_FILTER_TRIGGER_CLASS, DashboardSearchField } from '@/components/dashboard/dashboard-search-field';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminSprintCalendar } from '@/hooks/use-admin-sprint-calendar';
import {
  SITUACION_SPRINT_LABEL_CORTA,
  filterSprintsBySituacion,
  groupSprintsByPlannedDay,
  searchSprints,
  sortSprintsForSupervision,
} from '@/lib/admin/sprint-calendar';
import type { AdminSprintSituacion } from '@/lib/types/admin-sprints';

/**
 * Calendario administrativo de Sprints: supervisión temporal de los Sprints
 * operables de los proyectos activos.
 *
 * Todo sale de UNA consulta (`useAdminSprintCalendar`, la misma del widget
 * del panel): la búsqueda, el filtro, el cambio de mes y el cambio de vista
 * trabajan sobre ese payload, sin pedir nada más. Qué Sprint venció, vence
 * hoy o sigue en curso lo dice el backend (`situacion`). El administrador
 * supervisa: la única acción es abrir el detalle administrativo del proyecto.
 *
 * La vista vive en la URL (`?vista=mes|lista`, Mes por defecto); la búsqueda y
 * el filtro son estado local y se conservan al cambiar de vista.
 */

type Vista = 'mes' | 'lista';
const FILTRO_TODAS = 'TODAS';
const RUTA = '/dashboard/admin/sprints';
const hrefVista = (vista: Vista) => `${RUTA}?vista=${vista}`;

/**
 * Selector Mes | Lista, con el mismo grupo de botones del calendario del
 * estudiante. Son enlaces: la vista es navegable, compartible y sobrevive a
 * la recarga.
 */
function SelectorVista({ vista }: { vista: Vista }) {
  return (
    <nav aria-label="Vista del calendario">
      <ButtonGroup>
        {(['mes', 'lista'] as const).map((opcion) => (
          <Button
            key={opcion}
            asChild
            variant={opcion === vista ? 'default' : 'outline'}
            className="h-9 rounded-md text-xs font-bold"
          >
            <Link href={hrefVista(opcion)} aria-current={opcion === vista ? 'page' : undefined}>
              {opcion === 'mes' ? 'Mes' : 'Lista'}
            </Link>
          </Button>
        ))}
      </ButtonGroup>
    </nav>
  );
}

function MesSkeleton() {
  return (
    <div>
      <Skeleton className="mb-4 h-8 w-56 max-w-full" />
      <div className="grid grid-cols-1 gap-grid lg:grid-cols-[1fr_320px]">
        <div className="card-base">
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 42 }, (_, i) => (
              <Skeleton key={i} className="h-[92px] rounded-control" />
            ))}
          </div>
        </div>
        <Skeleton className="h-40 rounded-card" />
      </div>
    </div>
  );
}

function ListaSkeleton() {
  return (
    <div className="card-base overflow-hidden p-0">
      <div className="border-b border-outline-variant/50 bg-surface-container-low px-stack py-tight">
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="divide-y divide-outline-variant/50">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-stack px-stack py-inline">
            <div className="min-w-0 flex-1 space-y-tight">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-6 w-24 shrink-0 rounded-pill" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminSprintsClient() {
  const searchParams = useSearchParams();
  const vista: Vista = searchParams.get('vista') === 'lista' ? 'lista' : 'mes';
  const { data, isPending, isError, isFetching, refetch } = useAdminSprintCalendar();

  const [busqueda, setBusqueda] = useState('');
  const [situacion, setSituacion] = useState<AdminSprintSituacion | null>(null);

  const filtrados = useMemo(
    () => filterSprintsBySituacion(searchSprints(data?.items ?? [], busqueda), situacion),
    [data, busqueda, situacion],
  );
  const itemsByDay = useMemo(() => groupSprintsByPlannedDay(filtrados), [filtrados]);
  const ordenados = useMemo(() => sortSprintsForSupervision(filtrados), [filtrados]);
  const sinFecha = useMemo(() => filtrados.filter((item) => item.fechaFinPlaneada === null).length, [filtrados]);

  const total = data?.items.length ?? 0;
  const hayFiltros = busqueda.trim() !== '' || situacion !== null;
  const limpiarFiltros = () => {
    setBusqueda('');
    setSituacion(null);
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pb-12 pt-8 md:px-8">
      <Breadcrumb className="mb-4">
        <BreadcrumbList className="text-sm">
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/dashboard/admin" className="text-tertiary hover:text-on-surface">
                Proyectos
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-medium text-on-surface">Calendario de Sprints</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="mb-6 flex flex-wrap items-end justify-between gap-x-section gap-y-stack">
        <div className="min-w-0">
          <h1 className="type-display text-balance">
            Calendario de Sprints
          </h1>
          <p className="mt-tight max-w-2xl text-base text-tertiary">
            Supervisa las fechas planificadas de finalización de los Sprints activos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-gap">
          {/* Leyenda junto al selector, como en el calendario del estudiante. */}
          {vista === 'mes' && (
            <div className="flex items-center gap-tight">
              <span className="flex items-center gap-1 type-meta">
                <span className="h-1.5 w-1.5 rounded-pill bg-primary" aria-hidden="true" />
                Finalización
              </span>
              <span className="flex items-center gap-1 type-meta">
                <span className="h-1.5 w-1.5 rounded-pill bg-attention" aria-hidden="true" />
                Con plan vencido
              </span>
            </div>
          )}
          <SelectorVista vista={vista} />
        </div>
      </header>

      <div className="@container/sprints flex flex-col gap-stack">
        <section aria-label="Filtros de Sprints" className="grid grid-cols-1 gap-stack @2xl/sprints:flex">
          <DashboardSearchField
            containerClassName="@2xl/sprints:flex-1"
            name="busqueda"
            autoComplete="off"
            spellCheck={false}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar proyecto…"
            aria-label="Buscar Sprints por proyecto o líder"
          />
          <Select
            value={situacion ?? FILTRO_TODAS}
            onValueChange={(valor) => setSituacion(valor === FILTRO_TODAS ? null : (valor as AdminSprintSituacion))}
          >
            <SelectTrigger
              aria-label="Filtrar por situación temporal"
              className={`w-full ${DASHBOARD_FILTER_TRIGGER_CLASS} @2xl/sprints:w-60`}
            >
              <SelectValue placeholder="Situación" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTRO_TODAS}>Todas las situaciones</SelectItem>
              {(['EN_CURSO', 'VENCE_HOY', 'PLAN_VENCIDO', 'EN_FINALIZACION', 'SIN_FECHA'] as const).map((valor) => (
                <SelectItem key={valor} value={valor}>
                  {SITUACION_SPRINT_LABEL_CORTA[valor]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>

        {data && total > 0 && (
          <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-inline gap-y-micro">
            <p className="type-body text-text-secondary" role="status" aria-live="polite">
              {hayFiltros ? (
                <>
                  <span className="font-semibold tabular-nums text-text-primary">{filtrados.length}</span> de{' '}
                  <span className="tabular-nums">{total}</span> Sprints
                </>
              ) : (
                <>
                  <span className="font-semibold tabular-nums text-text-primary">{total}</span>{' '}
                  {total === 1 ? 'Sprint operable' : 'Sprints operables'}
                </>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-x-inline gap-y-micro">
              {/* Un Sprint sin fecha no cae en ningún día: en Mes se avisa y se lleva a la Lista. */}
              {vista === 'mes' && sinFecha > 0 && (
                <Link
                  href={hrefVista('lista')}
                  onClick={() => setSituacion('SIN_FECHA')}
                  className="type-meta inline-flex min-h-8 items-center gap-micro rounded-control font-semibold text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  {sinFecha === 1 ? '1 Sprint sin fecha planificada' : `${sinFecha} Sprints sin fecha planificada`}
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              )}
              {hayFiltros && (
                <Button type="button" variant="ghost" size="sm" onClick={limpiarFiltros} className="font-medium text-primary">
                  Limpiar filtros
                </Button>
              )}
            </div>
          </div>
        )}

        {isError ? (
          <Empty tone="danger" role="alert">
            <EmptyMedia variant="icon">
              <AlertCircle aria-hidden="true" className="size-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No se pudo cargar el calendario de Sprints.</EmptyTitle>
              <EmptyDescription>Verifica que tu sesión siga activa o vuelve a intentarlo.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button type="button" variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
                Reintentar
              </Button>
            </EmptyContent>
          </Empty>
        ) : isPending ? (
          <div role="status" aria-label="Cargando el calendario de Sprints">
            {vista === 'mes' ? <MesSkeleton /> : <ListaSkeleton />}
          </div>
        ) : total === 0 ? (
          <Empty tone="muted" role="status">
            <EmptyMedia variant="icon">
              <CalendarRange aria-hidden="true" className="size-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No hay Sprints operables para supervisar.</EmptyTitle>
              <EmptyDescription>
                Cuando un proyecto activo inicie un Sprint, su finalización esperada aparecerá aquí.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : filtrados.length === 0 ? (
          <Empty role="status">
            <EmptyMedia variant="icon">
              <SearchX aria-hidden="true" className="size-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No se encontraron Sprints con estos filtros.</EmptyTitle>
              <EmptyDescription>Prueba con otro texto o con otra situación.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button type="button" variant="outline" size="sm" onClick={limpiarFiltros}>
                Limpiar filtros
              </Button>
            </EmptyContent>
          </Empty>
        ) : vista === 'mes' ? (
          <SprintMonthView hoy={data.hoy} itemsByDay={itemsByDay} />
        ) : (
          <SprintListView items={ordenados} />
        )}
      </div>
    </div>
  );
}
