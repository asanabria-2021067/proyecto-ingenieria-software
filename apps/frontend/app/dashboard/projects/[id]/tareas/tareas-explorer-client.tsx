'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, ClipboardList, Search, SearchX } from 'lucide-react';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { useProjectTasks } from '@/hooks/use-project-tasks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
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

interface Props {
  idProyecto: number;
}

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
    <div className="mx-auto w-full max-w-content px-stack py-section md:px-section">
      {/* breadcrumb */}
      <Breadcrumb className="mb-stack">
        <BreadcrumbList className="type-meta">
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/dashboard/projects/mine" className="text-text-secondary hover:text-text-primary">
                Mis proyectos
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link
                href={`/dashboard/projects/${idProyecto}/kanban`}
                className="max-w-64 truncate text-text-secondary hover:text-text-primary"
              >
                {proyecto?.tituloProyecto ?? 'Proyecto'}
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-medium text-text-primary">Lista de tareas</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* encabezado */}
      <div className="card-base mb-stack flex flex-col gap-stack md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-micro">
          {isLoadingProyecto ? (
            <Skeleton className="h-8 w-64" />
          ) : (
            <h1 className="type-display line-clamp-2 text-text-primary">
              {proyecto?.tituloProyecto ?? 'Proyecto'}
            </h1>
          )}
          <p className="type-body text-text-secondary">
            Vista de solo lectura de todas las tareas del proyecto. Para editar, abre el Kanban.
          </p>
        </div>

        <Button
          asChild
          variant="outline"
          size="sm"
          className="shrink-0 border-outline-variant"
        >
          <Link href={`/dashboard/projects/${idProyecto}/kanban`}>
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Ir al Kanban
          </Link>
        </Button>
      </div>

      {/* toolbar + tabla + paginación */}
      <div className="card-base min-h-0">
        <div className="mb-stack flex flex-col gap-inline lg:flex-row lg:flex-wrap lg:items-center">
          <div className="relative w-full lg:max-w-xs">
            <Search
              className="pointer-events-none absolute left-inline top-1/2 size-4 -translate-y-1/2 text-text-secondary"
              aria-hidden="true"
            />
            <Input
              value={busqueda}
              onChange={(e) => actualizarBusqueda(e.target.value)}
              placeholder="Buscar por título o descripción..."
              aria-label="Buscar tareas por título o descripción"
              className="rounded-control border-outline-variant bg-page pl-9 text-body"
            />
          </div>

          <Select value={estadoFiltro} onValueChange={actualizarEstado}>
            <SelectTrigger
              aria-label="Filtrar por estado"
              className="w-full rounded-control border-outline-variant bg-page text-body lg:w-44"
            >
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
            <SelectTrigger
              aria-label="Filtrar por prioridad"
              className="w-full rounded-control border-outline-variant bg-page text-body lg:w-44"
            >
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
            <SelectTrigger
              aria-label="Ordenar tareas"
              className="w-full rounded-control border-outline-variant bg-page text-body lg:w-64"
            >
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

          {hayFiltrosActivos && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={limpiarFiltros}
              className="font-medium text-primary lg:ml-auto"
            >
              Limpiar filtros
            </Button>
          )}
        </div>

        {/* contador de resultados */}
        <div className="mb-inline flex items-center gap-tight" aria-live="polite" role="status">
          <span className="pill pill-accent">
            {tareasFiltradas.length} {tareasFiltradas.length === 1 ? 'resultado' : 'resultados'}
          </span>
          {hayFiltrosActivos && (
            <span className="type-meta">de {tasks.length} tareas en total</span>
          )}
        </div>

        {/* loading */}
        {isLoading && (
          <div className="space-y-2 py-4" role="status" aria-label="Cargando tareas">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {/* error */}
        {!isLoading && isError && (
          <Empty tone="danger" className="surface-enter" role="alert">
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
          <Empty className="surface-enter" aria-live="polite">
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
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Título</TableHead>
                  <TableHead scope="col">Estado</TableHead>
                  <TableHead scope="col">Prioridad</TableHead>
                  <TableHead scope="col">Fecha límite</TableHead>
                  <TableHead scope="col">Asignado a</TableHead>
                  <TableHead scope="col">Etiquetas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginado.items.map((tarea) => (
                  <TableRow key={tarea.idTarea}>
                    <TableCell className="max-w-sm whitespace-normal font-medium text-text-primary">
                      {tarea.tituloTarea}
                    </TableCell>
                    <TableCell>
                      <EstadoBadge estado={tarea.estadoTarea} />
                    </TableCell>
                    <TableCell>
                      <PrioridadBadge prioridad={tarea.prioridad} />
                    </TableCell>
                    <TableCell className="text-text-secondary">{formatFecha(tarea.fechaLimite)}</TableCell>
                    <TableCell className="text-text-secondary">
                      {tarea.asignacionActiva
                        ? `${tarea.asignacionActiva.usuario.nombre} ${tarea.asignacionActiva.usuario.apellido}`
                        : 'Sin asignar'}
                    </TableCell>
                    <TableCell>
                      {tarea.etiquetas.length === 0 ? (
                        <span className="text-text-secondary">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
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

            {/* paginación */}
            <nav
              aria-label="Paginación de tareas"
              className="mt-stack flex items-center justify-between gap-inline border-t border-outline-variant pt-inline"
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={paginado.pagina <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Página anterior"
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
              >
                Siguiente
              </Button>
            </nav>
          </>
        )}
      </div>
    </div>
  );
}
