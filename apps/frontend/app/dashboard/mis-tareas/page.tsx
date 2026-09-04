'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Search,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { getMisTareas, type MiTareaDTO } from '@/lib/services/users';
import {
  filterTasksByHito,
  filterTasksByPriority,
  filterTasksByStatus,
  paginateTasks,
  searchTasks,
  sortTasks,
  type CriterioOrdenTarea,
  type DireccionOrden,
} from '@/lib/tasks/filters';
import type { EstadoTarea, Prioridad } from '@/lib/types/tasks';

const ESTADO_TAREA_LABEL: Record<string, string> = {
  POR_HACER: 'Por hacer',
  EN_PROGRESO: 'En progreso',
  EN_REVISION: 'En revisión',
  HECHO: 'Hecho',
};

// mismos estilos que hitos-section.tsx, para que una tarea se vea igual en cualquier vista
const TAREA_ESTADO_STYLES: Record<string, string> = {
  POR_HACER: 'bg-surface-container-high text-on-surface-variant',
  EN_PROGRESO: 'bg-blue-500/10 text-blue-500 dark:bg-blue-500/20 dark:text-blue-300',
  EN_REVISION: 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300',
  HECHO: 'bg-secondary-container text-on-secondary-container font-semibold',
};

const PRIORIDAD_STYLES: Record<string, string> = {
  ALTA: 'text-red-600 dark:text-red-400 font-semibold',
  MEDIA: 'text-amber-600 dark:text-amber-400 font-semibold',
  BAJA: 'text-blue-500 dark:text-blue-400 font-semibold',
};

const PRIORIDAD_TAREA_LABEL: Record<string, string> = {
  ALTA: 'Alta',
  MEDIA: 'Media',
  BAJA: 'Baja',
};

// cuántas tareas (ya filtradas) se muestran por página
const TAMANIO_PAGINA = 15;

type Vencimiento = 'VENCIDA' | 'PROXIMA' | 'A_TIEMPO';

// una tarea "próxima a vencer" si le quedan 3 días o menos
const DIAS_PROXIMA_A_VENCER = 3;

function getVencimiento(tarea: MiTareaDTO): Vencimiento {
  if (!tarea.fechaLimite || tarea.estadoTarea === 'HECHO') return 'A_TIEMPO';

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const limite = new Date(tarea.fechaLimite);
  const diasRestantes = Math.ceil((limite.getTime() - hoy.getTime()) / 86_400_000);

  if (diasRestantes < 0) return 'VENCIDA';
  if (diasRestantes <= DIAS_PROXIMA_A_VENCER) return 'PROXIMA';
  return 'A_TIEMPO';
}

const VENCIMIENTO_CONFIG: Record<
  Vencimiento,
  { label: string; icon: React.ElementType; className: string }
> = {
  VENCIDA: {
    label: 'Vencida',
    icon: AlertCircle,
    className: 'bg-error-container text-error',
  },
  PROXIMA: {
    label: 'Próxima a vencer',
    icon: AlertTriangle,
    className: 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300',
  },
  A_TIEMPO: {
    label: 'A tiempo',
    icon: CheckCircle2,
    className: 'bg-secondary-container text-on-secondary-container',
  },
};

function formatFechaLimite(fecha: string): string {
  return new Date(fecha).toLocaleDateString('es-GT', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function MisTareasPage() {
  const [busqueda, setBusqueda] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('TODOS');
  const [prioridadFiltro, setPrioridadFiltro] = useState('TODAS');
  const [hitoFiltro, setHitoFiltro] = useState('TODOS');
  // valor combinado "criterio:direccion" (p. ej. "prioridad:desc")
  const [orden, setOrden] = useState('fechaLimite:asc');
  const [pagina, setPagina] = useState(1);

  // Se piden todas las tareas asignadas una sola vez al mismo endpoint
  // /usuarios/me/tareas; el filtrado, la búsqueda, el orden y la paginación
  // se resuelven en el cliente con las funciones puras de lib/tasks/filters.
  const { data: tareas = [], isLoading, isError, refetch } = useQuery<MiTareaDTO[]>({
    queryKey: ['mis-tareas'],
    queryFn: () => getMisTareas(),
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  // Opciones de hito derivadas de las tareas ya cargadas. MiTareaDTO solo
  // trae `idHito` (sin título), así que las opciones se etiquetan por id.
  const opcionesHito = useMemo(() => {
    const idsHito = new Set<number>();
    let haySinHito = false;
    for (const tarea of tareas) {
      if (tarea.idHito == null) haySinHito = true;
      else idsHito.add(tarea.idHito);
    }
    return { ids: [...idsHito].sort((a, b) => a - b), haySinHito };
  }, [tareas]);

  const tareasFiltradas = useMemo(() => {
    const buscadas = searchTasks(tareas, busqueda);
    const porEstado = filterTasksByStatus(
      buscadas,
      estadoFiltro === 'TODOS' ? undefined : (estadoFiltro as EstadoTarea),
    );
    const porPrioridad = filterTasksByPriority(
      porEstado,
      prioridadFiltro === 'TODAS' ? undefined : (prioridadFiltro as Prioridad),
    );
    const porHito = filterTasksByHito(
      porPrioridad,
      hitoFiltro === 'TODOS'
        ? undefined
        : hitoFiltro === 'SIN_HITO'
          ? null
          : Number(hitoFiltro),
    );
    const [criterio, direccion] = orden.split(':') as [CriterioOrdenTarea, DireccionOrden];
    return sortTasks(porHito, criterio, direccion);
  }, [tareas, busqueda, estadoFiltro, prioridadFiltro, hitoFiltro, orden]);

  const totalPaginas = Math.max(1, Math.ceil(tareasFiltradas.length / TAMANIO_PAGINA));
  const paginaActual = Math.min(Math.max(1, pagina), totalPaginas);
  const paginacion = useMemo(
    () => paginateTasks(tareasFiltradas, paginaActual, TAMANIO_PAGINA),
    [tareasFiltradas, paginaActual],
  );

  // cualquier cambio de filtro/orden/búsqueda vuelve a la primera página
  const cambiarBusqueda = (valor: string) => {
    setBusqueda(valor);
    setPagina(1);
  };
  const cambiarEstado = (valor: string) => {
    setEstadoFiltro(valor);
    setPagina(1);
  };
  const cambiarPrioridad = (valor: string) => {
    setPrioridadFiltro(valor);
    setPagina(1);
  };
  const cambiarHito = (valor: string) => {
    setHitoFiltro(valor);
    setPagina(1);
  };
  const cambiarOrden = (valor: string) => {
    setOrden(valor);
    setPagina(1);
  };

  // se agrupa por proyecto solo la página visible (el resto de la vista igual)
  const grupos = useMemo(() => {
    const porProyecto = new Map<number, { proyecto: MiTareaDTO['proyecto']; tareas: MiTareaDTO[] }>();
    for (const tarea of paginacion.items) {
      const grupo = porProyecto.get(tarea.proyecto.idProyecto);
      if (grupo) {
        grupo.tareas.push(tarea);
      } else {
        porProyecto.set(tarea.proyecto.idProyecto, { proyecto: tarea.proyecto, tareas: [tarea] });
      }
    }
    return Array.from(porProyecto.values());
  }, [paginacion.items]);

  const hayFiltrosActivos =
    busqueda.trim() !== '' ||
    estadoFiltro !== 'TODOS' ||
    prioridadFiltro !== 'TODAS' ||
    hitoFiltro !== 'TODOS';

  const limpiarFiltros = () => {
    setBusqueda('');
    setEstadoFiltro('TODOS');
    setPrioridadFiltro('TODAS');
    setHitoFiltro('TODOS');
    setPagina(1);
  };

  return (
      <div className="mx-auto max-w-[1400px] px-8 py-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-headline font-extrabold text-3xl text-on-surface mb-1">
              Mis Tareas
            </h1>
            <p className="text-tertiary text-sm">
              Todas las tareas que tienes asignadas, agrupadas por proyecto.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
              <Input
                value={busqueda}
                onChange={(e) => cambiarBusqueda(e.target.value)}
                placeholder="Buscar por título o descripción..."
                aria-label="Buscar tareas"
                className="w-64 pl-9 rounded-xl border-outline-variant/30 bg-surface-container-low"
              />
            </div>

            <Select value={estadoFiltro} onValueChange={cambiarEstado}>
              <SelectTrigger className="w-44 h-auto py-2 rounded-xl border-outline-variant/30 bg-surface-container-low text-sm">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos los estados</SelectItem>
                {Object.entries(ESTADO_TAREA_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={prioridadFiltro} onValueChange={cambiarPrioridad}>
              <SelectTrigger className="w-40 h-auto py-2 rounded-xl border-outline-variant/30 bg-surface-container-low text-sm">
                <SelectValue placeholder="Prioridad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODAS">Todas las prioridades</SelectItem>
                {Object.entries(PRIORIDAD_TAREA_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={hitoFiltro} onValueChange={cambiarHito}>
              <SelectTrigger className="w-40 h-auto py-2 rounded-xl border-outline-variant/30 bg-surface-container-low text-sm">
                <SelectValue placeholder="Hito" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos los hitos</SelectItem>
                {opcionesHito.haySinHito && <SelectItem value="SIN_HITO">Sin hito</SelectItem>}
                {opcionesHito.ids.map((id) => (
                  <SelectItem key={id} value={String(id)}>
                    Hito #{id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={orden} onValueChange={cambiarOrden}>
              <SelectTrigger className="w-60 h-auto py-2 rounded-xl border-outline-variant/30 bg-surface-container-low text-sm">
                <SelectValue placeholder="Ordenar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fechaLimite:asc">Fecha límite: más próxima primero</SelectItem>
                <SelectItem value="fechaLimite:desc">Fecha límite: más lejana primero</SelectItem>
                <SelectItem value="prioridad:asc">Prioridad: más alta primero</SelectItem>
                <SelectItem value="prioridad:desc">Prioridad: más baja primero</SelectItem>
                <SelectItem value="estado:asc">Estado: por hacer primero</SelectItem>
                <SelectItem value="estado:desc">Estado: completadas primero</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading && (
          <div className="text-center py-16 text-tertiary text-sm" role="status">
            Cargando tus tareas...
          </div>
        )}

        {isError && (
          <Empty tone="danger" className="surface-enter" role="alert">
            <EmptyMedia variant="icon">
              <AlertCircle aria-hidden="true" className="h-7 w-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No se pudieron cargar tus tareas</EmptyTitle>
              <EmptyDescription>
                Verifica que tu sesión siga activa o intenta actualizar la lista.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <button
                type="button"
                onClick={() => refetch()}
                className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition-all hover:bg-primary/90"
              >
                Reintentar
              </button>
            </EmptyContent>
          </Empty>
        )}

        {!isLoading && !isError && tareas.length === 0 && (
          <Empty className="surface-enter" aria-live="polite">
            <EmptyMedia variant="icon">
              <ClipboardList aria-hidden="true" className="h-7 w-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No tienes tareas asignadas</EmptyTitle>
              <EmptyDescription>
                Cuando un proyecto te asigne una tarea, aparecerá aquí sin importar el estado del proyecto.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {!isLoading && !isError && tareas.length > 0 && tareasFiltradas.length === 0 && (
          <Empty className="surface-enter" aria-live="polite">
            <EmptyMedia variant="icon">
              <Search aria-hidden="true" className="h-7 w-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>Ninguna tarea coincide con los filtros</EmptyTitle>
              <EmptyDescription>
                Prueba con otros términos de búsqueda o quita alguno de los filtros aplicados.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <button
                type="button"
                onClick={limpiarFiltros}
                className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition-all hover:bg-primary/90"
              >
                Limpiar filtros
              </button>
            </EmptyContent>
          </Empty>
        )}

        {!isLoading && !isError && tareasFiltradas.length > 0 && (
          <p className="mb-4 text-sm text-tertiary" aria-live="polite">
            {tareasFiltradas.length} {tareasFiltradas.length === 1 ? 'tarea' : 'tareas'}
            {hayFiltrosActivos ? ' encontradas' : ''}
            {totalPaginas > 1 ? ` · página ${paginacion.pagina} de ${totalPaginas}` : ''}
          </p>
        )}

        <div className="space-y-6">
          {grupos.map(({ proyecto, tareas: tareasDelProyecto }, index) => (
            <div
              key={proyecto.idProyecto}
              className="surface-enter bg-surface-container-lowest rounded-2xl border border-outline-variant p-6"
              style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
            >
              <div className="flex items-center justify-between gap-4 mb-4">
                <h2 className="font-headline font-bold text-on-surface text-lg leading-tight">
                  {proyecto.tituloProyecto}
                </h2>
                <span className="shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full bg-surface-container text-on-surface text-xs font-bold">
                  {tareasDelProyecto.length} {tareasDelProyecto.length === 1 ? 'tarea' : 'tareas'}
                </span>
              </div>

              <div className="space-y-2">
                {tareasDelProyecto.map((tarea) => {
                  const vencimiento = VENCIMIENTO_CONFIG[getVencimiento(tarea)];
                  const VencimientoIcon = vencimiento.icon;
                  return (
                    <Link
                      key={tarea.idTarea}
                      href={`/dashboard/projects/${proyecto.idProyecto}/kanban/tasks/${tarea.idTarea}`}
                      className="flex flex-wrap items-center gap-3 bg-surface-container-low rounded-xl px-4 py-3 hover:bg-surface-container transition-colors"
                    >
                      <span className="flex-1 min-w-[10rem] text-sm text-on-surface truncate">
                        {tarea.tituloTarea}
                      </span>

                      {tarea.fechaLimite && (
                        <span className="text-xs text-tertiary shrink-0">
                          Vence: {formatFechaLimite(tarea.fechaLimite)}
                        </span>
                      )}

                      <span className={`text-xs shrink-0 ${PRIORIDAD_STYLES[tarea.prioridad] ?? 'text-tertiary'}`}>
                        {tarea.prioridad}
                      </span>

                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase shrink-0 ${
                          TAREA_ESTADO_STYLES[tarea.estadoTarea] ?? 'bg-surface-container-high text-on-surface-variant'
                        }`}
                      >
                        {ESTADO_TAREA_LABEL[tarea.estadoTarea] ?? tarea.estadoTarea}
                      </span>

                      <span
                        className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${vencimiento.className}`}
                      >
                        <VencimientoIcon className="w-3 h-3" />
                        {vencimiento.label}
                      </span>

                      <ChevronRight className="w-4 h-4 text-tertiary shrink-0" />
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {!isLoading && !isError && totalPaginas > 1 && (
          <div className="mt-8 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setPagina(paginacion.pagina - 1)}
              disabled={!paginacion.hayAnterior}
              className="inline-flex items-center rounded-xl border border-outline-variant/40 px-4 py-2 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="text-sm text-tertiary">
              Página {paginacion.pagina} de {totalPaginas}
            </span>
            <button
              type="button"
              onClick={() => setPagina(paginacion.pagina + 1)}
              disabled={!paginacion.haySiguiente}
              className="inline-flex items-center rounded-xl border border-outline-variant/40 px-4 py-2 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        )}
      </div>
  );
}
