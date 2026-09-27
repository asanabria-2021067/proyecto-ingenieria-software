'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, AlertTriangle, ClipboardList, Search, SearchX } from 'lucide-react';
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
import { getMisTareas, type MiTareaDTO } from '@/lib/services/users';
import {
  filterTasksByPriority,
  filterTasksByStatus,
  paginateTasks,
  searchTasks,
  sortTasks,
  type CriterioOrdenTarea,
  type DireccionOrden,
} from '@/lib/tasks/filters';
import type { EstadoTarea, Prioridad } from '@/lib/types/tasks';
import { parseFechaSolo } from '@/lib/calendar/utils';

const TAMANIO_PAGINA = 15;
const FILTRO_TODOS = 'TODOS';

// una tarea "próxima a vencer" si le quedan 3 días o menos
const DIAS_PROXIMA_A_VENCER = 3;

type Vencimiento = 'VENCIDA' | 'PROXIMA' | null;

function getVencimiento(tarea: MiTareaDTO): Vencimiento {
  if (!tarea.fechaLimite || tarea.estadoTarea === 'HECHO') return null;

  // fechaLimite llega como YYYY-MM-DD o como instante UTC-medianoche
  // ("2026-09-27T00:00:00.000Z"); parseFechaSolo interpreta ambos como el
  // día calendario que son, sin desplazarlo por zona horaria (mismo criterio
  // que el calendario, ver lib/calendar/agenda.ts).
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const limite = parseFechaSolo(tarea.fechaLimite);
  const diasRestantes = Math.round((limite.getTime() - hoy.getTime()) / 86_400_000);

  if (diasRestantes < 0) return 'VENCIDA';
  if (diasRestantes <= DIAS_PROXIMA_A_VENCER) return 'PROXIMA';
  return null;
}

// icono + texto en cada pastilla: el vencimiento nunca depende solo del color
const VENCIMIENTO_CONFIG: Record<
  Exclude<Vencimiento, null>,
  { label: string; icon: typeof AlertCircle; tone: string }
> = {
  VENCIDA: { label: 'Vencida', icon: AlertCircle, tone: 'pill-error' },
  PROXIMA: { label: 'Vence pronto', icon: AlertTriangle, tone: 'pill-warning' },
};

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
];

function formatFecha(fecha: string | null): string {
  if (!fecha) return 'Sin fecha';
  return parseFechaSolo(fecha).toLocaleDateString('es-GT', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function EstadoBadge({ estado }: { estado: EstadoTarea }) {
  return <span className={`pill ${ESTADO_TONE[estado]}`}>{ESTADO_LABEL[estado]}</span>;
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

export default function MisTareasPage() {
  // GET /usuarios/me/tareas — siempre las tareas del usuario de la sesión
  // (el backend resuelve el id desde el JWT, nunca desde un parámetro).
  const { data: tareas = [], isLoading, isError, refetch } = useQuery<MiTareaDTO[]>({
    queryKey: ['mis-tareas'],
    queryFn: () => getMisTareas(),
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const [busqueda, setBusqueda] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState(FILTRO_TODOS);
  const [prioridadFiltro, setPrioridadFiltro] = useState(FILTRO_TODOS);
  const [proyectoFiltro, setProyectoFiltro] = useState(FILTRO_TODOS);
  const [ordenValor, setOrdenValor] = useState(OPCIONES_ORDEN[0].value);
  const [page, setPage] = useState(1);

  const ordenActivo = OPCIONES_ORDEN.find((o) => o.value === ordenValor) ?? OPCIONES_ORDEN[0];

  // cualquier cambio de filtro/orden/búsqueda vuelve a la página 1
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
  function actualizarProyecto(valor: string) {
    setProyectoFiltro(valor);
    setPage(1);
  }
  function actualizarOrden(valor: string) {
    setOrdenValor(valor);
    setPage(1);
  }

  // opciones de proyecto derivadas de las tareas ya cargadas — MiTareaDTO
  // trae el proyecto embebido, así que no hace falta pedirlo aparte.
  const opcionesProyecto = useMemo(() => {
    const porId = new Map<number, string>();
    for (const tarea of tareas) porId.set(tarea.proyecto.idProyecto, tarea.proyecto.tituloProyecto);
    return [...porId.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  }, [tareas]);

  const tareasFiltradas = useMemo(() => {
    const porTexto = searchTasks(tareas, busqueda);
    const porEstado = filterTasksByStatus(
      porTexto,
      estadoFiltro === FILTRO_TODOS ? undefined : (estadoFiltro as EstadoTarea),
    );
    const porPrioridad = filterTasksByPriority(
      porEstado,
      prioridadFiltro === FILTRO_TODOS ? undefined : (prioridadFiltro as Prioridad),
    );
    const porProyecto =
      proyectoFiltro === FILTRO_TODOS
        ? porPrioridad
        : porPrioridad.filter((tarea) => tarea.proyecto.idProyecto === Number(proyectoFiltro));
    return sortTasks(porProyecto, ordenActivo.campo, ordenActivo.direccion);
  }, [tareas, busqueda, estadoFiltro, prioridadFiltro, proyectoFiltro, ordenActivo]);

  // clamp defensivo: paginateTasks no recorta la página fuera de rango (por
  // contrato, ver lib/tasks/filters.ts), y un refetch en foco puede reducir
  // el total mientras el usuario está en una página que dejó de existir.
  const totalPaginas = Math.max(1, Math.ceil(tareasFiltradas.length / TAMANIO_PAGINA));
  const paginaActual = Math.min(Math.max(1, page), totalPaginas);

  const paginado = useMemo(
    () => paginateTasks(tareasFiltradas, paginaActual, TAMANIO_PAGINA),
    [tareasFiltradas, paginaActual],
  );

  const hayFiltrosActivos =
    busqueda.trim() !== '' ||
    estadoFiltro !== FILTRO_TODOS ||
    prioridadFiltro !== FILTRO_TODOS ||
    proyectoFiltro !== FILTRO_TODOS;

  function limpiarFiltros() {
    setBusqueda('');
    setEstadoFiltro(FILTRO_TODOS);
    setPrioridadFiltro(FILTRO_TODOS);
    setProyectoFiltro(FILTRO_TODOS);
    setPage(1);
  }

  return (
    <div className="mx-auto w-full max-w-content px-stack py-section md:px-section">
      {/* encabezado */}
      <div className="card-base mb-stack space-y-micro">
        <h1 className="type-display">Mis Tareas</h1>
        <p className="type-body text-text-secondary">
          Todas las tareas que tienes asignadas en tus proyectos, ordenadas por lo que vence primero.
        </p>
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

          <Select value={proyectoFiltro} onValueChange={actualizarProyecto}>
            <SelectTrigger
              aria-label="Filtrar por proyecto"
              className="w-full rounded-control border-outline-variant bg-page text-body lg:w-48"
            >
              <SelectValue placeholder="Proyecto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTRO_TODOS}>Todos los proyectos</SelectItem>
              {opcionesProyecto.map(([idProyecto, tituloProyecto]) => (
                <SelectItem key={idProyecto} value={String(idProyecto)}>
                  {tituloProyecto}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

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
          {/* pill-neutral, no pill-accent: --color-accent y --color-status-warning
              comparten valor (app/global.css), y pill-warning ya se usa varias
              veces en esta misma tabla (EN_PROGRESO, prioridad MEDIA, "Vence
              pronto") — el acento debe destacar una sola cosa por bloque. */}
          <span className="pill pill-neutral">
            {tareasFiltradas.length} {tareasFiltradas.length === 1 ? 'resultado' : 'resultados'}
          </span>
          {hayFiltrosActivos && (
            <span className="type-meta">de {tareas.length} tareas en total</span>
          )}
        </div>

        {/* loading — skeleton con forma de fila, nunca spinner */}
        {isLoading && (
          <div className="space-y-inline py-inline" role="status" aria-label="Cargando tus tareas">
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
          <Empty tone="danger" className="surface-enter" role="alert">
            <EmptyMedia variant="icon">
              <AlertCircle aria-hidden="true" className="size-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No se pudieron cargar tus tareas</EmptyTitle>
              <EmptyDescription>
                Verifica que tu sesión siga activa o intenta actualizar la lista.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button type="button" size="sm" onClick={() => refetch()}>
                Reintentar
              </Button>
            </EmptyContent>
          </Empty>
        )}

        {/* vacío: no hay ninguna tarea asignada */}
        {!isLoading && !isError && tareas.length === 0 && (
          <Empty className="surface-enter" aria-live="polite">
            <EmptyMedia variant="icon">
              <ClipboardList aria-hidden="true" className="size-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No tienes tareas asignadas</EmptyTitle>
              <EmptyDescription>
                Cuando un proyecto te asigne una tarea, aparecerá aquí. Revisa tus proyectos para ver en qué estás participando.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild type="button" size="sm">
                <Link href="/dashboard/projects/mine">Ir a mis proyectos</Link>
              </Button>
            </EmptyContent>
          </Empty>
        )}

        {/* sin coincidencias con los filtros */}
        {!isLoading && !isError && tareas.length > 0 && tareasFiltradas.length === 0 && (
          <Empty className="surface-enter" aria-live="polite">
            <EmptyMedia variant="icon">
              <SearchX aria-hidden="true" className="size-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>Sin coincidencias</EmptyTitle>
              <EmptyDescription>
                Ninguna tarea coincide con el texto o los filtros aplicados.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button type="button" variant="outline" size="sm" onClick={limpiarFiltros}>
                Limpiar filtros
              </Button>
            </EmptyContent>
          </Empty>
        )}

        {!isLoading && !isError && paginado.items.length > 0 && (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Título</TableHead>
                  <TableHead scope="col">Proyecto</TableHead>
                  <TableHead scope="col">Fecha límite</TableHead>
                  <TableHead scope="col">Prioridad</TableHead>
                  <TableHead scope="col">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginado.items.map((tarea) => {
                  const vencimiento = getVencimiento(tarea);
                  const config = vencimiento ? VENCIMIENTO_CONFIG[vencimiento] : null;
                  const VencimientoIcon = config?.icon;
                  return (
                    <TableRow key={tarea.idTarea}>
                      <TableCell className="max-w-sm whitespace-normal type-subtitle">
                        <Link
                          href={`/dashboard/projects/${tarea.proyecto.idProyecto}/kanban/tasks/${tarea.idTarea}`}
                          className="hover:underline"
                        >
                          {tarea.tituloTarea}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span className="type-meta">{tarea.proyecto.tituloProyecto}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-micro">
                          <span className="type-meta">{formatFecha(tarea.fechaLimite)}</span>
                          {config && VencimientoIcon && (
                            <span className={`pill ${config.tone}`}>
                              <VencimientoIcon className="size-3.5" aria-hidden="true" />
                              {config.label}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <PrioridadBadge prioridad={tarea.prioridad} />
                      </TableCell>
                      <TableCell>
                        <EstadoBadge estado={tarea.estadoTarea} />
                      </TableCell>
                    </TableRow>
                  );
                })}
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
