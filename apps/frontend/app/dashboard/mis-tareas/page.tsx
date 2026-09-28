'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, AlertTriangle, ClipboardList, SearchX } from 'lucide-react';
import { DashboardSearchField } from '@/components/dashboard/dashboard-search-field';
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
import { dashboardPage } from '@/components/layout/dashboard-page';

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

function formatFecha(fecha: string): string {
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

function contarTareas(n: number): string {
  return n === 1 ? '1 tarea' : `${n} tareas`;
}

/**
 * Agrupación de PRESENTACIÓN de la página visible. No es una regla nueva:
 * «Vencidas» es exactamente `getVencimiento() === 'VENCIDA'`, «Completadas»
 * es el estado HECHO y el resto se separa por tener o no fecha límite.
 */
type GrupoTarea = 'VENCIDAS' | 'PROXIMAS' | 'SIN_FECHA' | 'COMPLETADAS';

function grupoDe(tarea: MiTareaDTO): GrupoTarea {
  if (tarea.estadoTarea === 'HECHO') return 'COMPLETADAS';
  if (getVencimiento(tarea) === 'VENCIDA') return 'VENCIDAS';
  return tarea.fechaLimite ? 'PROXIMAS' : 'SIN_FECHA';
}

// El punto de color distingue el grupo sin otro icono; el nombre siempre lo acompaña.
const GRUPOS: { id: GrupoTarea; label: string; punto: string }[] = [
  { id: 'VENCIDAS', label: 'Vencidas', punto: 'bg-error' },
  { id: 'PROXIMAS', label: 'Próximas', punto: 'bg-status-warning' },
  { id: 'SIN_FECHA', label: 'Sin fecha', punto: 'bg-outline' },
  { id: 'COMPLETADAS', label: 'Completadas', punto: 'bg-primary' },
];

/** Con más completadas que esto en la página, su grupo empieza plegado. */
const UMBRAL_COMPLETADAS_PLEGADAS = 5;

/**
 * Columnas de la lista. Desde 42rem de tarjeta: Tarea | Proyecto | Fecha
 * límite | Prioridad | Estado, compartidas por la guía y cada fila. Entre
 * 28rem y 42rem, Tarea y Proyecto ocupan todo el ancho y las tres columnas
 * cortas conservan su ancho fijo debajo; por debajo, las celdas fluyen.
 * Anchos fijos = las pastillas caen siempre sobre la misma guía vertical.
 */
const COLUMNAS_LISTA = '@2xl/grupo:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_7.5rem_6rem_7rem]';
const COLUMNAS_CORTAS = '@md/grupo:grid-cols-[7.5rem_6rem_7rem]';
const CELDA_ANCHA = 'basis-full @md/grupo:col-span-3 @2xl/grupo:col-span-1';
const CELDA_CORTA = 'mt-micro @2xl/grupo:mt-0';

const CONTROL_FILTRO = 'h-10 w-full rounded-control border-outline-variant bg-page text-body';

function PuntoGrupo({ className }: { className: string }) {
  return <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${className}`} />;
}

function ResumenKpi({
  label,
  valor,
  punto,
  tonoValor = 'text-text-primary',
}: {
  label: string;
  valor: number;
  punto: string;
  tonoValor?: string;
}) {
  return (
    <div role="group" aria-label={label} className="card-base px-card py-stack">
      <p className="flex items-center gap-tight text-xs font-semibold uppercase tracking-wide text-text-secondary">
        <PuntoGrupo className={punto} />
        {label}
      </p>
      <p className={`mt-tight font-headline text-3xl font-bold tabular-nums ${tonoValor}`}>{valor}</p>
    </div>
  );
}

function FilaTarea({ tarea }: { tarea: MiTareaDTO }) {
  const vencimiento = getVencimiento(tarea);
  const config = vencimiento ? VENCIMIENTO_CONFIG[vencimiento] : null;
  const VencimientoIcon = config?.icon;
  return (
    <li
      className={`relative flex flex-wrap items-center gap-x-inline gap-y-micro px-card py-inline transition-colors hover:bg-surface-container-low @md/grupo:grid ${COLUMNAS_CORTAS} ${COLUMNAS_LISTA}`}
    >
      <div className={`min-w-0 ${CELDA_ANCHA}`}>
        {/* El enlace del título se estira sobre toda la fila (after:inset-0):
            misma navegación de siempre, sin botón «Ver» por fila. */}
        <Link
          href={`/dashboard/projects/${tarea.proyecto.idProyecto}/kanban/tasks/${tarea.idTarea}`}
          className="type-body font-semibold text-text-primary outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-primary/40"
        >
          {tarea.tituloTarea}
        </Link>
      </div>
      <p className={`type-meta min-w-0 line-clamp-2 ${CELDA_ANCHA}`}>{tarea.proyecto.tituloProyecto}</p>
      {/* Sin fecha la celda queda vacía (el grupo ya lo dice) pero conserva su columna. */}
      <div className={`flex min-w-0 flex-col items-start gap-micro ${CELDA_CORTA}`}>
        {tarea.fechaLimite && (
          <span className="type-meta tabular-nums text-text-secondary">{formatFecha(tarea.fechaLimite)}</span>
        )}
        {config && VencimientoIcon && (
          <span className={`pill ${config.tone}`}>
            <VencimientoIcon className="size-3.5" aria-hidden="true" />
            {config.label}
          </span>
        )}
      </div>
      <div className={CELDA_CORTA}>
        <PrioridadBadge prioridad={tarea.prioridad} />
      </div>
      <div className={CELDA_CORTA}>
        <EstadoBadge estado={tarea.estadoTarea} />
      </div>
    </li>
  );
}

function GrupoTareas({
  grupo,
  tareas,
}: {
  grupo: (typeof GRUPOS)[number];
  tareas: MiTareaDTO[];
}) {
  const plegable = grupo.id === 'COMPLETADAS' && tareas.length > UMBRAL_COMPLETADAS_PLEGADAS;
  const [expandido, setExpandido] = useState(false);
  const visible = !plegable || expandido;
  const idTitulo = `mis-tareas-grupo-${grupo.id}`;
  const idLista = `${idTitulo}-lista`;

  return (
    <section aria-labelledby={idTitulo} className="card-base @container/grupo overflow-hidden p-0">
      <header
        className={`flex items-center justify-between gap-inline px-card py-stack ${
          visible ? 'border-b border-outline-variant/50' : ''
        }`}
      >
        <h2 id={idTitulo} className="flex items-center gap-tight type-subtitle font-semibold">
          <PuntoGrupo className={grupo.punto} />
          {grupo.label}
        </h2>
        <div className="flex items-center gap-inline">
          <span className="type-meta">{contarTareas(tareas.length)}</span>
          {plegable && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={expandido}
              aria-controls={idLista}
              onClick={() => setExpandido((v) => !v)}
              className="font-medium text-primary"
            >
              {expandido ? 'Ocultar' : 'Mostrar'}
            </Button>
          )}
        </div>
      </header>
      {visible && (
        <>
          {/* Guía de columnas: solo cuando las filas van en columnas; es
              visual (cada pastilla ya dice qué es), por eso aria-hidden. */}
          <div
            aria-hidden="true"
            className={`hidden gap-x-inline border-b border-outline-variant/50 bg-surface-container-low px-card py-tight text-xs font-semibold text-text-secondary @2xl/grupo:grid ${COLUMNAS_LISTA}`}
          >
            <span>Tarea</span>
            <span>Proyecto</span>
            <span>Fecha límite</span>
            <span>Prioridad</span>
            <span>Estado</span>
          </div>
          <ul id={idLista} className="divide-y divide-outline-variant/50">
            {tareas.map((tarea) => (
              <FilaTarea key={tarea.idTarea} tarea={tarea} />
            ))}
          </ul>
        </>
      )}
    </section>
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

  // Resumen sobre TODAS las tareas cargadas (no solo la página ni el filtro):
  // conteos directos de estado y la misma regla de vencimiento de la lista.
  const resumen = useMemo(
    () => ({
      pendientes: tareas.filter((t) => t.estadoTarea === 'POR_HACER').length,
      vencidas: tareas.filter((t) => getVencimiento(t) === 'VENCIDA').length,
      enProgreso: tareas.filter((t) => t.estadoTarea === 'EN_PROGRESO').length,
      completadas: tareas.filter((t) => t.estadoTarea === 'HECHO').length,
    }),
    [tareas],
  );

  // Agrupa la página ya filtrada, ordenada y paginada: dentro de cada grupo
  // se conserva el orden elegido y la paginación sigue siendo la misma.
  const grupos = useMemo(
    () =>
      GRUPOS.map((grupo) => ({
        grupo,
        tareas: paginado.items.filter((tarea) => grupoDe(tarea) === grupo.id),
      })).filter(({ tareas: delGrupo }) => delGrupo.length > 0),
    [paginado.items],
  );

  function limpiarFiltros() {
    setBusqueda('');
    setEstadoFiltro(FILTRO_TODOS);
    setPrioridadFiltro(FILTRO_TODOS);
    setProyectoFiltro(FILTRO_TODOS);
    setPage(1);
  }

  return (
    <div className={dashboardPage('@container/mis-tareas flex flex-col gap-section py-section lg:py-page')}>
      <header>
        <h1 className="type-display">Mis Tareas</h1>
        <p className="type-body mt-micro text-text-secondary">
          Todas las tareas asignadas en tus proyectos, ordenadas por lo que requiere atención primero.
        </p>
      </header>

      {/* resumen: 4 en fila si el contenido mide ≥ 42rem; si no, 2 × 2 */}
      {!isLoading && !isError && tareas.length > 0 && (
        <section aria-label="Resumen de tareas" className="grid grid-cols-1 gap-stack @sm/mis-tareas:grid-cols-2 @2xl/mis-tareas:grid-cols-4">
          <ResumenKpi label="Pendientes" valor={resumen.pendientes} punto="bg-outline" />
          <ResumenKpi
            label="Vencidas"
            valor={resumen.vencidas}
            punto="bg-error"
            tonoValor={resumen.vencidas > 0 ? 'text-error' : undefined}
          />
          <ResumenKpi label="En progreso" valor={resumen.enProgreso} punto="bg-status-warning" />
          <ResumenKpi label="Completadas" valor={resumen.completadas} punto="bg-primary" tonoValor="text-primary" />
        </section>
      )}

      <div className="flex flex-col gap-stack">
        {/* total real de tareas (+ cuántas pasan los filtros) y limpiar, sobre la tarjeta de filtros */}
        {!isLoading && !isError && (
          <div className="flex min-h-8 flex-wrap items-center justify-between gap-inline">
            <p className="type-body text-text-secondary" aria-live="polite" role="status">
              Total de tareas: <span className="font-semibold text-text-primary tabular-nums">{tareas.length}</span>
              {hayFiltrosActivos &&
                ` · ${tareasFiltradas.length} ${tareasFiltradas.length === 1 ? 'coincide' : 'coinciden'} con los filtros`}
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

        {/* filtros */}
        <section aria-label="Filtros de tareas" className="card-base @container/filtros">
          <div className="grid grid-cols-1 gap-inline @xl/filtros:grid-cols-2 @4xl/filtros:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))_minmax(0,1.4fr)]">
            <DashboardSearchField
              containerClassName="@xl/filtros:col-span-2 @4xl/filtros:col-span-1"
              value={busqueda}
              onChange={(e) => actualizarBusqueda(e.target.value)}
              placeholder="Buscar tarea..."
              aria-label="Buscar tareas por título o descripción"
            />

            <Select value={proyectoFiltro} onValueChange={actualizarProyecto}>
              <SelectTrigger aria-label="Filtrar por proyecto" className={`${CONTROL_FILTRO} data-[size=default]:h-10`}>
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
              <SelectTrigger aria-label="Filtrar por estado" className={`${CONTROL_FILTRO} data-[size=default]:h-10`}>
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
              <SelectTrigger aria-label="Filtrar por prioridad" className={`${CONTROL_FILTRO} data-[size=default]:h-10`}>
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
              <SelectTrigger aria-label="Ordenar tareas" className={`${CONTROL_FILTRO} data-[size=default]:h-10`}>
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
          </div>
        </section>

        {/* loading — skeleton con forma de grupo y filas, nunca spinner */}
        {isLoading && (
          <div className="card-base overflow-hidden p-0" role="status" aria-label="Cargando tus tareas">
            <div className="border-b border-outline-variant/50 px-card py-stack">
              <Skeleton className="h-5 w-32" />
            </div>
            <div className="divide-y divide-outline-variant/50">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-inline px-card py-inline">
                  <div className="min-w-0 flex-1 space-y-tight">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                  <Skeleton className="h-6 w-20 shrink-0 rounded-pill" />
                  <Skeleton className="h-6 w-20 shrink-0 rounded-pill" />
                </div>
              ))}
            </div>
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
            {grupos.map(({ grupo, tareas: delGrupo }) => (
              <GrupoTareas key={grupo.id} grupo={grupo} tareas={delGrupo} />
            ))}

            {/* paginación */}
            <nav
              aria-label="Paginación de tareas"
              className="card-base flex items-center justify-between gap-inline px-card py-inline"
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
          </>
        )}
      </div>
    </div>
  );
}
