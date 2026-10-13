'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ChevronRight, FolderKanban, SearchX } from 'lucide-react';
import { useAllActiveAdminProjects } from '@/hooks/use-admin-projects';
import { useAdminSprintCalendar } from '@/hooks/use-admin-sprint-calendar';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { estadoBadgeLabel, estadoBadgeStyle } from '@/components/projects/available-project-card';
import { DASHBOARD_FILTER_TRIGGER_CLASS, DashboardSearchField } from '@/components/dashboard/dashboard-search-field';
import {
  DATA_TABLE_CARD,
  DATA_TABLE_HEAD_ROW,
  DATA_TABLE_HEAD_TEXT,
  DATA_TABLE_ROW_BORDER,
  DATA_TABLE_ROW_HOVER,
} from '@/components/dashboard/data-table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import {
  FILTRO_TODOS,
  OPCIONES_ORDEN,
  filterByEstado,
  filterBySituacion,
  filterBySprint,
  indexSprintsByProject,
  joinProjectsWithSprints,
  searchActiveProjects,
  sortActiveProjects,
  type ActiveProjectRow,
  type FiltroSituacion,
  type FiltroSprint,
  type OrdenActivos,
} from '@/lib/admin/active-projects';
import { SITUACION_SPRINT_LABEL, SITUACION_SPRINT_TONE, formatDiasRestantes } from '@/lib/admin/sprint-calendar';
import { parseFechaSolo } from '@/lib/calendar/utils';
import type { AdminProjectListItem } from '@/lib/types/admin-projects';
import type { AdminSprintCalendarItem, AdminSprintSituacion } from '@/lib/types/admin-sprints';

/**
 * Bandeja de supervisión de proyectos ACTIVOS (`?grupo=activos`).
 *
 * Une dos lecturas administrativas ya existentes: la lista completa de
 * proyectos activos y el calendario de Sprints (`/admin/sprints/calendario`),
 * indexado por proyecto. Qué Sprint venció, vence hoy o sigue en curso lo
 * dice el backend (`situacion`, `diasRestantes`); aquí solo se busca, filtra,
 * ordena y presenta. El administrador supervisa: la única acción es abrir el
 * detalle administrativo del proyecto.
 */

const ESTADO_PROYECTO_OPCIONES = [
  { value: 'PUBLICADO', label: 'Publicado' },
  { value: 'EN_PROGRESO', label: 'En progreso' },
];

const SPRINT_OPCIONES: { value: FiltroSprint; label: string }[] = [
  { value: 'ACTIVO', label: 'Activo' },
  { value: 'EN_FINALIZACION', label: 'En finalización' },
  { value: 'SIN_SPRINT', label: 'Sin Sprint' },
];

const SITUACION_OPCIONES: { value: AdminSprintSituacion; label: string }[] = [
  { value: 'EN_CURSO', label: 'En curso' },
  { value: 'VENCE_HOY', label: 'Vence hoy' },
  { value: 'PLAN_VENCIDO', label: 'Plan vencido' },
  { value: 'EN_FINALIZACION', label: 'En finalización' },
  { value: 'SIN_FECHA', label: 'Sin fecha' },
];

const SPRINT_ESTADO_LABEL: Record<string, string> = {
  ACTIVO: 'Activo',
  EN_FINALIZACION: 'En finalización',
};

/**
 * Barra de filtros con el patrón de Mis Tareas: buscador ancho y selects
 * sobre el fondo de la página. Con cuatro selects cabe en una sola fila solo
 * desde 80rem de contenido; antes, el buscador ocupa su fila y los selects
 * van debajo (2 × 2 y luego 4 en línea).
 */
const BARRA_FILTROS = 'grid grid-cols-1 gap-stack @xl/bandeja:grid-cols-2 @4xl/bandeja:grid-cols-4 @7xl/bandeja:flex';
const FILTRO_TRIGGER = `w-full ${DASHBOARD_FILTER_TRIGGER_CLASS}`;

/**
 * Columnas por ancho de la tarjeta (no del viewport: con la sidebar abierta
 * una tablet deja ~28rem de contenido). Siempre: Proyecto, Finalización
 * esperada y Abrir. Desde 36rem aparece Sprint actual, desde 48rem Usuarios
 * activos y desde 64rem Líder. Lo que se oculta como columna reaparece como
 * metadata bajo el nombre del proyecto, así ninguna fila pierde información.
 */
const COL_SPRINT = '@xl/bandeja:table-cell';
const COL_USUARIOS = '@3xl/bandeja:table-cell';
const COL_LIDER = '@5xl/bandeja:table-cell';
// Metadata bajo el nombre: visible exactamente mientras su columna no lo es.
const META_SPRINT = '@xl/bandeja:hidden';
const META_USUARIOS = '@3xl/bandeja:hidden';
const META_LIDER = '@5xl/bandeja:hidden';

// Rótulos con el estilo común de tablas (el de Mis Tareas): pequeños, semibold
// y en su caja normal. El relleno y los anchos son de esta tabla.
const TH = `h-auto whitespace-normal px-stack py-tight ${DATA_TABLE_HEAD_TEXT}`;
// Anchos fijos (la tabla es `table-fixed`): la columna Proyecto absorbe el
// resto y los títulos largos se parten en vez de empujar las demás columnas
// fuera de la tarjeta. En móvil Finalización y Abrir se estrechan.
const W_LIDER = 'w-[22%]';
const W_USUARIOS = 'w-24';
const W_SPRINT = 'w-36';
const W_FIN = 'w-32 @xl/bandeja:w-40';
const W_ABRIR = 'w-14 @xl/bandeja:w-24';
// `whitespace-normal` anula el `nowrap` por defecto de la celda shadcn: aquí
// los títulos y nombres largos se parten en lugar de invadir la columna vecina.
const TD_BASE = 'whitespace-normal py-tight align-top';
const TD = `${TD_BASE} px-stack`;
// La celda de Abrir cede su relleno en móvil para que el objetivo táctil de 44 px quepa en 56 px.
const TD_ABRIR = `${TD_BASE} px-micro @xl/bandeja:px-stack`;

function getInitials(nombre: string, apellido: string): string {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
}

/** «12 oct 2026» para un día `YYYY-MM-DD`, sin correrlo por zona horaria. */
function formatFecha(dia: string): string {
  return parseFechaSolo(dia).toLocaleDateString('es-GT', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function nombreLider(project: AdminProjectListItem): string {
  return `${project.lider.nombre} ${project.lider.apellido}`.trim();
}

function EstadoProyectoPill({ estado }: { estado: string }) {
  return <span className={`pill ${estadoBadgeStyle(estado)}`}>{estadoBadgeLabel(estado)}</span>;
}

/** Celda «Sprint actual»: número y estado del Sprint operable, o la razón de que no haya. */
function SprintActual({ project }: { project: AdminProjectListItem }) {
  const sprint = project.sprintAmbiente;
  if (!sprint) {
    return (
      <span className="flex flex-col gap-micro">
        <span aria-hidden="true" className="type-body text-text-secondary">
          —
        </span>
        <span className="type-meta">Sin Sprint</span>
      </span>
    );
  }
  return (
    <span className="flex flex-col items-start gap-micro">
      <span className="type-body font-medium text-text-primary">Sprint {sprint.numero}</span>
      <span className="pill pill-neutral whitespace-nowrap">{SPRINT_ESTADO_LABEL[sprint.estado] ?? sprint.estado}</span>
    </span>
  );
}

/**
 * Celda «Finalización esperada». Distingue tres ausencias: proyecto sin
 * Sprint operable («Sin Sprint»), Sprint sin fecha planificada («Sin fecha»)
 * y calendario no disponible («No disponible»). La situación es la del
 * backend; aquí solo se da formato.
 */
function FinalizacionEsperada({
  row,
  calendarioCargando,
  calendarioFallido,
}: {
  row: ActiveProjectRow;
  calendarioCargando: boolean;
  calendarioFallido: boolean;
}) {
  if (!row.project.sprintAmbiente) {
    return (
      <span className="flex flex-col gap-micro">
        <span aria-hidden="true" className="type-body text-text-secondary">
          —
        </span>
        <span className="type-meta">Sin Sprint</span>
      </span>
    );
  }
  if (calendarioCargando) {
    return (
      <span className="flex flex-col gap-micro" aria-label="Cargando finalización esperada">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-16" />
      </span>
    );
  }
  const sprint: AdminSprintCalendarItem | null | undefined = row.sprint;
  if (calendarioFallido || !sprint) {
    return (
      <span className="flex flex-col gap-micro">
        <span aria-hidden="true" className="type-body text-text-secondary">
          —
        </span>
        <span className="type-meta">No disponible</span>
      </span>
    );
  }
  if (sprint.situacion === 'SIN_FECHA' || sprint.fechaFinPlaneada === null) {
    return (
      <span className="flex flex-col gap-micro">
        <span aria-hidden="true" className="type-body text-text-secondary">
          —
        </span>
        <span className="type-meta">Sin fecha</span>
      </span>
    );
  }
  const fecha = (
    <span className="type-body whitespace-nowrap tabular-nums text-text-primary">
      {formatFecha(sprint.fechaFinPlaneada)}
    </span>
  );
  if (sprint.situacion === 'EN_CURSO') {
    return (
      <span className="flex flex-col gap-micro">
        {fecha}
        {sprint.diasRestantes !== null && (
          <span className="type-meta">{capitalizar(formatDiasRestantes(sprint.diasRestantes))}</span>
        )}
      </span>
    );
  }
  return (
    <span className="flex flex-col items-start gap-micro">
      {fecha}
      <span className={`pill whitespace-nowrap ${SITUACION_SPRINT_TONE[sprint.situacion]}`}>
        {SITUACION_SPRINT_LABEL[sprint.situacion]}
      </span>
      {sprint.situacion === 'PLAN_VENCIDO' && sprint.diasRestantes !== null && (
        <span className="type-meta">{capitalizar(formatDiasRestantes(sprint.diasRestantes))}</span>
      )}
    </span>
  );
}

function FilaProyecto({
  row,
  calendarioCargando,
  calendarioFallido,
}: {
  row: ActiveProjectRow;
  calendarioCargando: boolean;
  calendarioFallido: boolean;
}) {
  const { project } = row;
  const href = `/dashboard/admin/proyectos/${project.idProyecto}`;
  const sprint = project.sprintAmbiente;
  return (
    <TableRow className={`${DATA_TABLE_ROW_BORDER} ${DATA_TABLE_ROW_HOVER}`}>
      <TableCell className={`${TD} min-w-0`}>
        <Link
          href={href}
          className="type-body break-words font-semibold text-text-primary hover:text-primary hover:underline"
        >
          {project.tituloProyecto}
        </Link>
        <div className="mt-micro flex flex-wrap items-center gap-x-tight gap-y-micro">
          <EstadoProyectoPill estado={project.estadoProyecto} />
          <span className={`type-meta ${META_LIDER}`}>{nombreLider(project)}</span>
          <span className={`type-meta tabular-nums ${META_USUARIOS}`}>
            {project.usuariosActivos} {project.usuariosActivos === 1 ? 'usuario' : 'usuarios'}
          </span>
          <span className={`type-meta ${META_SPRINT}`}>
            {sprint ? `Sprint ${sprint.numero} · ${SPRINT_ESTADO_LABEL[sprint.estado] ?? sprint.estado}` : 'Sin Sprint'}
          </span>
        </div>
      </TableCell>
      <TableCell className={`${TD} hidden ${COL_LIDER}`}>
        <span className="inline-flex min-w-0 items-center gap-tight">
          <Avatar className="size-7 shrink-0">
            <AvatarFallback className="bg-primary/10 type-micro font-bold text-primary">
              {getInitials(project.lider.nombre, project.lider.apellido)}
            </AvatarFallback>
          </Avatar>
          <span className="type-body text-text-primary">{nombreLider(project)}</span>
        </span>
      </TableCell>
      <TableCell className={`${TD} hidden text-right ${COL_USUARIOS}`}>
        <span className="type-body tabular-nums text-text-primary">{project.usuariosActivos}</span>
      </TableCell>
      <TableCell className={`${TD} hidden ${COL_SPRINT}`}>
        <SprintActual project={project} />
      </TableCell>
      <TableCell className={TD}>
        <FinalizacionEsperada row={row} calendarioCargando={calendarioCargando} calendarioFallido={calendarioFallido} />
      </TableCell>
      <TableCell className={`${TD_ABRIR} text-right`}>
        <Link
          href={href}
          aria-label={`Abrir ${project.tituloProyecto}`}
          className="ml-auto flex min-h-11 w-fit min-w-11 items-center justify-center gap-micro whitespace-nowrap rounded-control px-tight type-meta font-semibold text-primary hover:underline"
        >
          <span className="hidden @xl/bandeja:inline">Abrir</span>
          <ChevronRight className="size-4 @xl/bandeja:size-3.5" aria-hidden="true" />
        </Link>
      </TableCell>
    </TableRow>
  );
}

function TablaSkeleton() {
  return (
    <div className={DATA_TABLE_CARD} role="status" aria-label="Cargando proyectos activos">
      <div className="border-b border-outline-variant/50 bg-surface-container-low px-stack py-tight">
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="divide-y divide-outline-variant/50">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-stack px-stack py-inline">
            <div className="min-w-0 flex-1 space-y-tight">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-5 w-24 rounded-pill" />
            </div>
            <Skeleton className="hidden h-4 w-32 @5xl/bandeja:block" />
            <Skeleton className="hidden h-4 w-8 @3xl/bandeja:block" />
            <Skeleton className="hidden h-4 w-20 @xl/bandeja:block" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ActiveProjectsBoard() {
  const proyectos = useAllActiveAdminProjects();
  const calendario = useAdminSprintCalendar();

  const [busqueda, setBusqueda] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<string>(FILTRO_TODOS);
  const [sprintFiltro, setSprintFiltro] = useState<FiltroSprint>(FILTRO_TODOS);
  const [situacionFiltro, setSituacionFiltro] = useState<FiltroSituacion>(FILTRO_TODOS);
  const [orden, setOrden] = useState<OrdenActivos>('PREDETERMINADO');

  const sprintByProject = useMemo(() => indexSprintsByProject(calendario.data?.items), [calendario.data]);
  const filas = useMemo(
    () => joinProjectsWithSprints(proyectos.data?.items ?? [], sprintByProject),
    [proyectos.data, sprintByProject],
  );

  const filasVisibles = useMemo(() => {
    const porTexto = searchActiveProjects(filas, busqueda);
    const porEstado = filterByEstado(porTexto, estadoFiltro);
    const porSprint = filterBySprint(porEstado, sprintFiltro);
    const porSituacion = filterBySituacion(porSprint, situacionFiltro);
    return sortActiveProjects(porSituacion, orden);
  }, [filas, busqueda, estadoFiltro, sprintFiltro, situacionFiltro, orden]);

  const hayFiltrosActivos =
    busqueda.trim() !== '' ||
    estadoFiltro !== FILTRO_TODOS ||
    sprintFiltro !== FILTRO_TODOS ||
    situacionFiltro !== FILTRO_TODOS;

  function limpiarFiltros() {
    setBusqueda('');
    setEstadoFiltro(FILTRO_TODOS);
    setSprintFiltro(FILTRO_TODOS);
    setSituacionFiltro(FILTRO_TODOS);
  }

  const total = proyectos.data?.total ?? 0;
  const calendarioCargando = calendario.isPending;
  const calendarioFallido = calendario.isError;

  return (
    <div className="@container/bandeja flex flex-col gap-stack">
      <section aria-label="Filtros de proyectos activos" className={BARRA_FILTROS}>
        <DashboardSearchField
          containerClassName="@xl/bandeja:col-span-2 @4xl/bandeja:col-span-4 @7xl/bandeja:flex-1"
          name="busqueda"
          autoComplete="off"
          spellCheck={false}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar proyecto o líder…"
          aria-label="Buscar proyectos por nombre o líder"
        />

        <Select value={estadoFiltro} onValueChange={setEstadoFiltro}>
          <SelectTrigger aria-label="Filtrar por estado del proyecto" className={`${FILTRO_TRIGGER} @7xl/bandeja:w-44`}>
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={FILTRO_TODOS}>Todos los estados</SelectItem>
            {ESTADO_PROYECTO_OPCIONES.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sprintFiltro} onValueChange={(v) => setSprintFiltro(v as FiltroSprint)}>
          <SelectTrigger aria-label="Filtrar por estado del Sprint" className={`${FILTRO_TRIGGER} @7xl/bandeja:w-44`}>
            <SelectValue placeholder="Sprint" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={FILTRO_TODOS}>Todos los Sprints</SelectItem>
            {SPRINT_OPCIONES.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={situacionFiltro} onValueChange={(v) => setSituacionFiltro(v as FiltroSituacion)}>
          <SelectTrigger aria-label="Filtrar por situación temporal" className={`${FILTRO_TRIGGER} @7xl/bandeja:w-48`}>
            <SelectValue placeholder="Situación" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={FILTRO_TODOS}>Todas las situaciones</SelectItem>
            {SITUACION_OPCIONES.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={orden} onValueChange={(v) => setOrden(v as OrdenActivos)}>
          <SelectTrigger aria-label="Ordenar proyectos" className={`${FILTRO_TRIGGER} @7xl/bandeja:w-56`}>
            <SelectValue placeholder="Ordenar" />
          </SelectTrigger>
          <SelectContent>
            {OPCIONES_ORDEN.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      {proyectos.isSuccess && (
        <div className="flex min-h-8 flex-wrap items-center justify-between gap-inline">
          <p className="type-body text-text-secondary" role="status" aria-live="polite">
            {/* `total` es la población activa completa; `filasVisibles` lo que pasa la búsqueda y los filtros. */}
            {hayFiltrosActivos ? (
              <>
                Proyectos encontrados:{' '}
                <span className="font-semibold tabular-nums text-text-primary">{filasVisibles.length}</span> de{' '}
                <span className="font-semibold tabular-nums text-text-primary">{total}</span>{' '}
                {total === 1 ? 'activo' : 'activos'}
              </>
            ) : (
              <>
                Total de proyectos activos:{' '}
                <span className="font-semibold tabular-nums text-text-primary">{total}</span>
              </>
            )}
          </p>
          {hayFiltrosActivos && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={limpiarFiltros}
              className="font-medium text-primary"
            >
              Limpiar filtros
            </Button>
          )}
        </div>
      )}

      {proyectos.isSuccess && calendarioFallido && (
        <p
          role="status"
          className="flex flex-wrap items-center gap-x-inline gap-y-micro rounded-control bg-surface-container-low px-stack py-tight type-meta"
        >
          <AlertCircle className="size-4 shrink-0 text-attention-strong dark:text-attention" aria-hidden="true" />
          <span>No se pudo cargar la planificación de Sprints. El resto de la bandeja sigue disponible.</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void calendario.refetch()}
            disabled={calendario.isFetching}
            className="h-7 px-tight font-medium text-primary"
          >
            Reintentar
          </Button>
        </p>
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
      ) : filas.length === 0 ? (
        <Empty tone="muted" role="status">
          <EmptyMedia variant="icon">
            <FolderKanban aria-hidden="true" className="size-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No hay proyectos activos.</EmptyTitle>
            <EmptyDescription>Cuando un proyecto entre en este grupo, aparecerá aquí.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : filasVisibles.length === 0 ? (
        <Empty role="status">
          <EmptyMedia variant="icon">
            <SearchX aria-hidden="true" className="size-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>
              {busqueda.trim() !== ''
                ? `No encontramos proyectos o líderes que coincidan con “${busqueda.trim()}”.`
                : 'No se encontraron proyectos con estos filtros.'}
            </EmptyTitle>
            <EmptyDescription>Prueba con otro texto o quita alguno de los filtros aplicados.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" variant="outline" size="sm" onClick={limpiarFiltros}>
              Limpiar filtros
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className={DATA_TABLE_CARD}>
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className={`${DATA_TABLE_HEAD_ROW} hover:bg-surface-container-low`}>
                <TableHead scope="col" className={TH}>
                  Proyecto
                </TableHead>
                <TableHead scope="col" className={`${TH} ${W_LIDER} hidden ${COL_LIDER}`}>
                  Líder
                </TableHead>
                <TableHead scope="col" className={`${TH} ${W_USUARIOS} hidden text-right ${COL_USUARIOS}`}>
                  Usuarios activos
                </TableHead>
                <TableHead scope="col" className={`${TH} ${W_SPRINT} hidden ${COL_SPRINT}`}>
                  Sprint actual
                </TableHead>
                <TableHead scope="col" className={`${TH} ${W_FIN}`}>
                  Finalización esperada
                </TableHead>
                <TableHead scope="col" className={`${TH} ${W_ABRIR} text-right`}>
                  <span className="sr-only">Abrir</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* ponytail: filas sin virtualizar; añadir `content-visibility: auto` si la población activa supera unos cientos. */}
              {filasVisibles.map((row) => (
                <FilaProyecto
                  key={row.project.idProyecto}
                  row={row}
                  calendarioCargando={calendarioCargando}
                  calendarioFallido={calendarioFallido}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
