'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, ClipboardList, SearchX } from 'lucide-react';
import { DashboardSearchField, DASHBOARD_FILTER_TRIGGER_CLASS } from '@/components/dashboard/dashboard-search-field';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { useProjectTasks } from '@/hooks/use-project-tasks';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  ESTADO_LABEL,
  PRIORIDAD_ICON,
  PRIORIDAD_LABEL,
} from '@/components/projects/task-board.utils';
import {
  filterTasksByPriority,
  filterTasksByStatus,
  paginateTasks,
  searchTasks,
  sortTasks,
  type CriterioOrdenTarea,
  type DireccionOrden,
} from '@/lib/tasks/filters';
import type { EstadoTarea, Prioridad, TareaPublicaDTO } from '@/lib/types/tasks';
import { ProjectPageHeader, ProjectPageShell } from '@/components/projects/detail/project-page-shell';

interface Props {
  idProyecto: number;
}

/**
 * Barra de búsqueda y filtros como la de Mis Tareas: fuera de la tarjeta,
 * buscador ancho y selects blancos. Mide el ancho del área del proyecto:
 * una sola fila desde 64rem; antes, el buscador va en su propia fila.
 */
const BARRA_FILTROS =
  'grid grid-cols-1 gap-4 @xl/project:grid-cols-2 @3xl/project:grid-cols-3 @5xl/project:flex';
const FILTRO_TRIGGER = `w-full ${DASHBOARD_FILTER_TRIGGER_CLASS}`;

/**
 * Formato de la tabla de Mis Tareas: franja guía gris verdosa con etiquetas
 * pequeñas en seminegrita, divisores tenues (sin `border-b` casi negro) y
 * hover muy suave. Las celdas de los extremos llevan el padding de la tarjeta.
 */
const BORDE_TARJETA = 'first:pl-card last:pr-card';
const FILA_GUIA = 'border-outline-variant/50 bg-surface-container-low hover:bg-surface-container-low';
const CELDA_GUIA = `h-auto py-tight text-xs font-semibold text-text-secondary ${BORDE_TARJETA}`;
const FILA_TAREA = 'border-outline-variant/50 hover:bg-surface-container-low';
const CELDA_TAREA = BORDE_TARJETA;

const TAMANO_PAGINA = 15;
const FILTRO_TODOS = 'TODOS';
const ESTADO_TONE: Record<EstadoTarea, string> = {
  POR_HACER: 'pill-neutral',
  EN_PROGRESO: 'pill-warning',
  EN_REVISION: 'pill-neutral',
  HECHO: 'pill-success',
};
const PRIORIDAD_TONE: Record<Prioridad, string> = {
  BAJA: 'pill-neutral',
  MEDIA: 'pill-warning',
  ALTA: 'pill-error',
};

const OPCIONES_ORDEN: { value: string; label: string; campo: CriterioOrdenTarea; direccion: DireccionOrden }[] = [
  { value: 'fechaLimite:asc', label: 'Fecha límite: más próxima primero', campo: 'fechaLimite', direccion: 'asc' },
  { value: 'fechaLimite:desc', label: 'Fecha límite: más lejana primero', campo: 'fechaLimite', direccion: 'desc' },
  { value: 'prioridad:asc', label: 'Prioridad: alta primero', campo: 'prioridad', direccion: 'asc' },
  { value: 'prioridad:desc', label: 'Prioridad: baja primero', campo: 'prioridad', direccion: 'desc' },
  { value: 'estado:asc', label: 'Estado: flujo (por hacer → hecho)', campo: 'estado', direccion: 'asc' },
  { value: 'titulo:asc', label: 'Título: A-Z', campo: 'titulo', direccion: 'asc' },
  { value: 'titulo:desc', label: 'Título: Z-A', campo: 'titulo', direccion: 'desc' },
];

function formatFecha(fecha: string | null): string {
  if (!fecha) return 'Sin fecha';
  return new Date(fecha).toLocaleDateString('es-GT', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function EstadoBadge({ estado }: { estado: EstadoTarea }) {
  return (
    <span className={`pill ${ESTADO_TONE[estado]}`}>
      {ESTADO_LABEL[estado]}
    </span>
  );
}

function PrioridadBadge({ prioridad }: { prioridad: Prioridad }) {
  const Icono = PRIORIDAD_ICON[prioridad];
  return (
    <span className={`pill ${PRIORIDAD_TONE[prioridad]}`}>
      <Icono className="size-3.5" aria-hidden="true" />
      {PRIORIDAD_LABEL[prioridad]}
    </span>
  );
}

export default function TareasExplorerClient({ idProyecto }: Props) {
  const { data: proyecto, isLoading: isLoadingProyecto } = useProjectDetail(idProyecto);
  const { tasks, isLoading, isError, refetch } = useProjectTasks(idProyecto);

  const [busqueda, setBusqueda] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<string>(FILTRO_TODOS);
  const [prioridadFiltro, setPrioridadFiltro] = useState<string>(FILTRO_TODOS);
  const [ordenValor, setOrdenValor] = useState(OPCIONES_ORDEN[0].value);
  const [page, setPage] = useState(1);

  const ordenActivo = OPCIONES_ORDEN.find((o) => o.value === ordenValor) ?? OPCIONES_ORDEN[0];

  // cualquier cambio de filtro vuelve a la página 1
  function actualizarBusqueda(valor: string) {
    setBusqueda(valor);
    setPage(1);
  }
  function actualizarEstado(valor: string) {
    setEstadoFiltro(valor);
    setPage(1);
  }
  function actualizarPrioridad(valor: string) {
    setPrioridadFiltro(valor);
    setPage(1);
  }
  function actualizarOrden(valor: string) {
    setOrdenValor(valor);
    setPage(1);
  }

  const tareasFiltradas = useMemo<TareaPublicaDTO[]>(() => {
    const porTexto = searchTasks(tasks, busqueda);
    const porEstado = filterTasksByStatus(
      porTexto,
      estadoFiltro === FILTRO_TODOS ? undefined : (estadoFiltro as EstadoTarea),
    );
    const porPrioridad = filterTasksByPriority(
      porEstado,
      prioridadFiltro === FILTRO_TODOS ? undefined : (prioridadFiltro as Prioridad),
    );
    return sortTasks(porPrioridad, ordenActivo.campo, ordenActivo.direccion);
  }, [tasks, busqueda, estadoFiltro, prioridadFiltro, ordenActivo]);

  const paginado = useMemo(
    () => paginateTasks(tareasFiltradas, page, TAMANO_PAGINA),
    [tareasFiltradas, page],
  );

  const hayFiltrosActivos =
    busqueda.trim() !== '' || estadoFiltro !== FILTRO_TODOS || prioridadFiltro !== FILTRO_TODOS;

  function limpiarFiltros() {
    setBusqueda('');
    setEstadoFiltro(FILTRO_TODOS);
    setPrioridadFiltro(FILTRO_TODOS);
    setPage(1);
  }

  return (
    <ProjectPageShell>
      {/* encabezado fuera de las tarjetas; la vuelta lleva al Tablero, como el breadcrumb anterior */}
      <ProjectPageHeader
        back={{ href: `/dashboard/projects/${idProyecto}/kanban`, label: 'Volver al Tablero' }}
        title="Lista de tareas"
        description="Vista de solo lectura de todas las tareas del proyecto. Para editar, abre el Kanban."
      >
        {isLoadingProyecto ? (
          <Skeleton className="mt-tight h-4 w-48" />
        ) : (
          <p className="type-meta mt-tight">
            Proyecto: <span className="font-medium text-text-primary">{proyecto?.tituloProyecto ?? 'Proyecto'}</span>
          </p>
        )}
      </ProjectPageHeader>

      {/* resultados + limpiar, sobre la barra (mismo criterio que Mis Tareas) */}
      <div className="mb-stack flex min-h-8 flex-wrap items-center justify-between gap-inline">
        <p className="type-body text-text-secondary" aria-live="polite" role="status">
          Resultados: <span className="font-semibold tabular-nums text-text-primary">{tareasFiltradas.length}</span>
          {hayFiltrosActivos && ` de ${tasks.length} tareas en total`}
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

      {/* barra de búsqueda y filtros sobre el fondo, fuera de la tarjeta */}
      <section aria-label="Filtros de tareas" className={`mb-stack ${BARRA_FILTROS}`}>
        <DashboardSearchField
          containerClassName="@xl/project:col-span-2 @3xl/project:col-span-3 @5xl/project:flex-1"
          value={busqueda}
          onChange={(e) => actualizarBusqueda(e.target.value)}
          placeholder="Buscar por título o descripción..."
          aria-label="Buscar tareas por título o descripción"
        />

        <Select value={estadoFiltro} onValueChange={actualizarEstado}>
          <SelectTrigger aria-label="Filtrar por estado" className={`${FILTRO_TRIGGER} @5xl/project:w-44`}>
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={FILTRO_TODOS}>Todos los estados</SelectItem>
            {Object.entries(ESTADO_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={prioridadFiltro} onValueChange={actualizarPrioridad}>
          <SelectTrigger aria-label="Filtrar por prioridad" className={`${FILTRO_TRIGGER} @5xl/project:w-44`}>
            <SelectValue placeholder="Prioridad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={FILTRO_TODOS}>Todas las prioridades</SelectItem>
            {Object.entries(PRIORIDAD_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={ordenValor} onValueChange={actualizarOrden}>
          <SelectTrigger aria-label="Ordenar tareas" className={`${FILTRO_TRIGGER} @5xl/project:w-60`}>
            <SelectValue placeholder="Ordenar" />
          </SelectTrigger>
          <SelectContent>
            {OPCIONES_ORDEN.map((opcion) => (
              <SelectItem key={opcion.value} value={opcion.value}>
                {opcion.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      {/* tabla: la franja guía y las filas llegan al borde de la tarjeta, como en Mis Tareas */}
      <div className="card-base min-h-0 overflow-hidden p-0">

        {/* loading — skeleton con forma de fila (título + meta + pastillas), nunca spinner */}
        {isLoading && (
          <div className="space-y-inline p-card" role="status" aria-label="Cargando tareas">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center gap-inline rounded-card border border-outline-variant bg-card p-card shadow-card"
              >
                <div className="min-w-0 flex-1 space-y-tight">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
                <Skeleton className="h-6 w-20 shrink-0 rounded-control" />
                <Skeleton className="h-6 w-20 shrink-0 rounded-control" />
              </div>
            ))}
          </div>
        )}

        {/* error */}
        {!isLoading && isError && (
          <Empty tone="danger" className="surface-enter m-card" role="alert">
            <EmptyMedia variant="icon">
              <AlertCircle aria-hidden="true" className="size-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No se pudieron cargar las tareas</EmptyTitle>
              <EmptyDescription>
                Ocurrió un problema al obtener las tareas del proyecto. Intenta de nuevo.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button type="button" size="sm" onClick={() => refetch()}>
                Reintentar
              </Button>
            </EmptyContent>
          </Empty>
        )}

        {/* vacío o sin coincidencias */}
        {!isLoading && !isError && tareasFiltradas.length === 0 && (
          <Empty className="surface-enter m-card" aria-live="polite">
            <EmptyMedia variant="icon">
              {hayFiltrosActivos ? (
                <SearchX aria-hidden="true" className="size-7" />
              ) : (
                <ClipboardList aria-hidden="true" className="size-7" />
              )}
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>
                {hayFiltrosActivos ? 'Sin coincidencias' : 'Este proyecto todavía no tiene tareas'}
              </EmptyTitle>
              <EmptyDescription>
                {hayFiltrosActivos
                  ? 'Ninguna tarea coincide con el texto o los filtros aplicados.'
                  : 'Cuando se creen tareas en este proyecto, aparecerán aquí.'}
              </EmptyDescription>
            </EmptyHeader>
            {hayFiltrosActivos && (
              <EmptyContent>
                <Button type="button" variant="outline" size="sm" onClick={limpiarFiltros}>
                  Limpiar filtros
                </Button>
              </EmptyContent>
            )}
          </Empty>
        )}

        {!isLoading && !isError && paginado.items.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow className={FILA_GUIA}>
                  <TableHead scope="col" className={CELDA_GUIA}>Título</TableHead>
                  <TableHead scope="col" className={CELDA_GUIA}>Hito</TableHead>
                  <TableHead scope="col" className={CELDA_GUIA}>Estado</TableHead>
                  <TableHead scope="col" className={CELDA_GUIA}>Prioridad</TableHead>
                  <TableHead scope="col" className={CELDA_GUIA}>Fecha límite</TableHead>
                  <TableHead scope="col" className={CELDA_GUIA}>Asignado a</TableHead>
                  <TableHead scope="col" className={CELDA_GUIA}>Etiquetas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginado.items.map((tarea) => (
                  <TableRow key={tarea.idTarea} className={FILA_TAREA}>
                    <TableCell className={`max-w-sm whitespace-normal type-body font-semibold text-text-primary ${CELDA_TAREA}`}>
                      {tarea.tituloTarea}
                    </TableCell>
                    <TableCell className={CELDA_TAREA}>
                      <span className="type-meta">{tarea.hito?.tituloHito ?? 'Sin hito'}</span>
                    </TableCell>
                    <TableCell className={CELDA_TAREA}>
                      <EstadoBadge estado={tarea.estadoTarea} />
                    </TableCell>
                    <TableCell className={CELDA_TAREA}>
                      <PrioridadBadge prioridad={tarea.prioridad} />
                    </TableCell>
                    <TableCell className={CELDA_TAREA}>
                      <span className="type-meta tabular-nums text-text-secondary">{formatFecha(tarea.fechaLimite)}</span>
                    </TableCell>
                    <TableCell className={CELDA_TAREA}>
                      <span className="type-meta">
                        {tarea.asignacionActiva
                          ? `${tarea.asignacionActiva.usuario.nombre} ${tarea.asignacionActiva.usuario.apellido}`
                          : 'Sin asignar'}
                      </span>
                    </TableCell>
                    <TableCell className={CELDA_TAREA}>
                      {tarea.etiquetas.length === 0 ? (
                        <span className="type-meta">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-micro">
                          {tarea.etiquetas.map((etiqueta) => (
                            <span
                              key={etiqueta.idEtiqueta}
                              className="pill pill-neutral"
                            >
                              {etiqueta.nombreEtiqueta}
                            </span>
                          ))}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
        )}
      </div>

      {/* paginación en su propia tarjeta, como en Mis Tareas */}
      {!isLoading && !isError && paginado.items.length > 0 && (
        <nav
          aria-label="Paginación de tareas"
          className="card-base mt-stack flex items-center justify-between gap-inline px-card py-inline"
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={paginado.pagina <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            aria-label="Página anterior"
            className="rounded-control"
          >
            Anterior
          </Button>
          <span className="type-meta font-medium" aria-live="polite">
            Página {paginado.pagina} de {paginado.totalPaginas}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={paginado.pagina >= paginado.totalPaginas}
            onClick={() => setPage((p) => Math.min(paginado.totalPaginas, p + 1))}
            aria-label="Página siguiente"
            className="rounded-control"
          >
            Siguiente
          </Button>
        </nav>
      )}
    </ProjectPageShell>
  );
}
