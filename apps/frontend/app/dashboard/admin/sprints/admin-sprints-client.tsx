'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowRight, CalendarPlus, CalendarRange, SearchX } from 'lucide-react';
import { SprintListView } from '@/components/admin/sprints/sprint-list-view';
import { AdminCalendarView } from '@/components/admin/sprints/admin-calendar-view';
import { MeetingListView } from '@/components/admin/sprints/meeting-list-view';
import { AdminMeetingFormDialog } from '@/components/admin/meetings/admin-meeting-form-dialog';
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
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { useAdminSprintCalendar } from '@/hooks/use-admin-sprint-calendar';
import {
  SITUACION_SPRINT_LABEL_CORTA,
  VISTAS_ADMIN_CALENDARIO,
  adminSprintsHref,
  filterSprintsBySituacion,
  groupSprintsByPlannedDay,
  parseFechaParam,
  parseVistaParam,
  searchSprints,
  sortSprintsForSupervision,
  type VistaAdminCalendario,
} from '@/lib/admin/sprint-calendar';
import { IconoTipoEvento } from '@/lib/calendar/paleta';
import type { AdminSprintSituacion } from '@/lib/types/admin-sprints';
import { ADMIN_PAGE, ADMIN_PAGE_LEAD, ADMIN_PAGE_TITLE } from '@/components/admin/admin-page';

/**
 * Calendario administrativo de Sprints: supervisión temporal de los Sprints
 * operables de los proyectos activos y de las reuniones de Administración.
 *
 * Los Sprints salen de UNA consulta (`useAdminSprintCalendar`, la misma del
 * widget del panel): la búsqueda, el filtro, el cambio de periodo y el cambio
 * de vista trabajan sobre ese payload. Qué Sprint venció, vence hoy o sigue en
 * curso lo dice el backend (`situacion`). Las reuniones se leen aparte, por el
 * rango visible (Día, Semana, Mes) o la agenda activa (Lista). El
 * administrador supervisa: las únicas acciones abren el detalle
 * administrativo de un proyecto; aquí no se agenda ni se gestiona nada.
 *
 * La vista y el día seleccionado viven en la URL (`?vista=dia|semana|mes|lista
 * &fecha=YYYY-MM-DD`; Mes y el «hoy» del servidor por defecto): el mini
 * calendario del panel enlaza a un día concreto. La búsqueda y el filtro son
 * estado local y se conservan al cambiar de vista.
 */

const FILTRO_TODAS = 'TODAS';
const ETIQUETA_VISTA: Record<VistaAdminCalendario, string> = { dia: 'Día', semana: 'Semana', mes: 'Mes', lista: 'Lista' };

/**
 * Selector Día | Semana | Mes | Lista con el control segmentado del
 * calendario del estudiante (mismas clases que su `RadioGroup`). Aquí son
 * enlaces: la vista es navegable, compartible y sobrevive a la recarga; todas
 * conservan el día elegido. Abre la barra que va justo encima del calendario.
 */
function SelectorVista({ vista, fecha }: { vista: VistaAdminCalendario; fecha: string | null }) {
  return (
    <nav aria-label="Vista del calendario" className="flex w-fit rounded-pill bg-surface-container p-1">
      {VISTAS_ADMIN_CALENDARIO.map((opcion) => (
        <Link
          key={opcion}
          href={adminSprintsHref(opcion, fecha)}
          aria-current={opcion === vista ? 'page' : undefined}
          className={`rounded-pill px-3 py-1 text-xs font-bold outline-none motion-select focus-visible:ring-2 focus-visible:ring-primary/60 ${
            opcion === vista
              ? 'bg-surface-container-lowest text-on-surface shadow-card'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          {ETIQUETA_VISTA[opcion]}
        </Link>
      ))}
    </nav>
  );
}

/** Leyenda de las marcas del calendario (Día, Semana y Mes). */
function LeyendaCalendario() {
  return (
    <div className="flex flex-wrap items-center gap-tight">
      <span className="flex items-center gap-1 type-meta">
        <span className="h-1.5 w-1.5 rounded-pill bg-primary" aria-hidden="true" />
        Finalización
      </span>
      <span className="flex items-center gap-1 type-meta">
        <span className="h-1.5 w-1.5 rounded-pill bg-attention" aria-hidden="true" />
        Con plan vencido
      </span>
      <span className="flex items-center gap-1 type-meta">
        <span aria-hidden="true">
          <IconoTipoEvento tipo="REUNION" tono={3} />
        </span>
        Reunión administrativa
      </span>
    </div>
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
  const vista = parseVistaParam(searchParams.get('vista'));
  const { data, isPending, isError, isFetching, refetch } = useAdminSprintCalendar();

  // Día elegido. Arranca en `?fecha=` (validada) y, si falta o no sirve, se
  // usa el «hoy» del servidor al pintar. Elegir otro día actualiza el estado y
  // reescribe la URL con la History API, que Next sincroniza sin pedir nada al
  // servidor; si la URL cambia desde fuera (otro enlace), el estado la sigue.
  const fechaParam = parseFechaParam(searchParams.get('fecha'));
  const [fecha, setFecha] = useState(fechaParam);
  const [fechaSeguida, setFechaSeguida] = useState(fechaParam);
  if (fechaSeguida !== fechaParam) {
    setFechaSeguida(fechaParam);
    setFecha(fechaParam);
  }
  const seleccionarDia = (dia: string) => {
    setFecha(dia);
    window.history.replaceState(null, '', adminSprintsHref(vista, dia));
  };
  // Semana → Día desde el «+N» de un horario cargado: es otra vista, así que queda en el historial.
  const verDia = (dia: string) => window.history.pushState(null, '', adminSprintsHref('dia', dia));

  // Diálogo de reunión: «Programar» desde el encabezado (sin día) o desde el día elegido (a las 09:00),
  // o «Editar» desde la tarjeta de una reunión. Al cerrarse, el foco vuelve al botón que lo abrió.
  const [dialogo, setDialogo] = useState<{ dia?: Date; idReunion?: number } | null>(null);
  const botonProgramarRef = useRef<HTMLButtonElement>(null);
  const focoAlCerrarRef = useRef<HTMLElement | null>(null);
  const programar = () => {
    focoAlCerrarRef.current = botonProgramarRef.current;
    setDialogo({});
  };
  const programarEnDia = (dia: string) => {
    const [y, m, d] = dia.split('-').map(Number);
    focoAlCerrarRef.current = null;
    setDialogo({ dia: new Date(y, m - 1, d, 9, 0) });
  };
  const editarReunion = (idReunion: number, boton: HTMLButtonElement) => {
    focoAlCerrarRef.current = boton;
    setDialogo({ idReunion });
  };

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
    <div className={ADMIN_PAGE}>
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

      <header className="mb-6 flex flex-wrap items-start justify-between gap-x-section gap-y-stack">
        <div className="min-w-0">
          <h1 className={ADMIN_PAGE_TITLE}>
            Calendario de Sprints
          </h1>
          <p className={ADMIN_PAGE_LEAD}>
            Supervisa las fechas planificadas de finalización de los Sprints activos y las reuniones administrativas.
          </p>
        </div>
        {/* Mismo botón que «Agendar actividad» del calendario del estudiante. */}
        <Button
          ref={botonProgramarRef}
          type="button"
          onClick={programar}
          className="h-9 gap-1.5 rounded-pill bg-primary px-4 text-xs font-bold text-on-primary hover:bg-primary/90"
        >
          <CalendarPlus className="size-4" aria-hidden="true" />
          Programar reunión
        </Button>
      </header>

      <AdminMeetingFormDialog
        open={dialogo !== null}
        onOpenChange={(abierto) => !abierto && setDialogo(null)}
        initialDate={dialogo?.dia}
        idReunion={dialogo?.idReunion ?? null}
        restaurarFocoEn={focoAlCerrarRef}
      />

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

        {/* Leyenda y métricas: separadas de la barra de navegación, que va justo encima del calendario. */}
        {((data && total > 0) || vista !== 'lista') && (
          <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-inline gap-y-micro">
            <div className="flex flex-wrap items-center gap-x-section gap-y-micro">
              {data && total > 0 && (
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
              )}
              {vista !== 'lista' && <LeyendaCalendario />}
            </div>
            <div className="flex flex-wrap items-center gap-x-inline gap-y-micro">
              {/* Un Sprint sin fecha no cae en ningún día: en el calendario se avisa y se lleva a la Lista. */}
              {data && vista !== 'lista' && sinFecha > 0 && (
                <Link
                  href={adminSprintsHref('lista', fecha)}
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

        {/* En Día, Semana y Mes el selector abre la barra del calendario junto a Hoy y las flechas;
            en Lista, mientras carga o si falla, va solo en ese mismo sitio. */}
        {(vista === 'lista' || isPending || isError) && <SelectorVista vista={vista} fecha={fecha} />}

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
          <SkeletonRegion label="Cargando el calendario de Sprints">
            {vista === 'lista' ? <ListaSkeleton /> : <MesSkeleton />}
          </SkeletonRegion>
        ) : vista !== 'lista' ? (
          // El calendario se pinta aunque no haya Sprints (o ninguno pase el filtro): las reuniones
          // también viven en él, y el resumen del periodo ya dice cuántas finalizaciones hay.
          <AdminCalendarView
            vista={vista}
            hoy={data.hoy}
            selectedKey={fecha ?? data.hoy}
            onSelectDay={seleccionarDia}
            onVerDia={verDia}
            itemsByDay={itemsByDay}
            busqueda={busqueda}
            selectorVista={<SelectorVista vista={vista} fecha={fecha} />}
            onProgramarReunion={programarEnDia}
            onEditarReunion={editarReunion}
          />
        ) : (
          <>
            {total === 0 ? (
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
            ) : (
              <SprintListView items={ordenados} />
            )}
            <MeetingListView busqueda={busqueda} />
          </>
        )}
      </div>
    </div>
  );
}
