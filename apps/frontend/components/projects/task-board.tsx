'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Filter, Plus, Tags } from 'lucide-react';
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { TaskCard } from '@/components/projects/task-card';
import { TaskFormDialog } from '@/components/projects/task-form-dialog';
import { ProjectLabelsDrawer } from '@/components/projects/project-labels-drawer';
import { TaskDragOverlayCard } from '@/components/projects/task-drag-overlay';
import { MobileTaskStatusNav } from '@/components/projects/mobile-task-status-nav';
import { getApiErrorMessage } from '@/components/projects/api-error';
import {
  columnDropId,
  columnKeyboardCoordinateGetter,
  resolveDragEndAction,
  POINTER_ACTIVATION_CONSTRAINT,
  TOUCH_ACTIVATION_CONSTRAINT,
  taskDragAnnouncements,
  type ColumnDropData,
  type TaskDragData,
} from '@/components/projects/task-board-dnd';
import {
  COLUMNAS_TABLERO,
  ESTADO_COLUMNA_STYLE,
  FILTRO_TODOS,
  derivarOpcionesHito,
  derivarOpcionesRol,
  filtrarTareas,
  ordenarTareas,
} from '@/components/projects/task-board.utils';
import type { EstadoTarea, TareaPublicaDTO } from '@/lib/types/tasks';
import type { useProjectTasks } from '@/hooks/use-project-tasks';
import type { useProjectLabels } from '@/hooks/use-project-labels';
import type { MiembroProyecto } from '@/hooks/use-project-members';

type ProjectTasksHook = ReturnType<typeof useProjectTasks>;
type ProjectLabelsHook = ReturnType<typeof useProjectLabels>;

interface RolOpcion {
  idRolProyecto: number;
  nombreRol: string;
}

interface HitoOpcion {
  idHito: number;
  tituloHito: string;
}

interface TaskBoardProps {
  idProyecto: number;
  tasks: TareaPublicaDTO[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  /** Fetch en segundo plano con datos ya visibles (refetch/invalidación). */
  isFetching?: boolean;
  isLeader: boolean;
  currentUserId: number | null;
  cambiarEstadoTarea: ProjectTasksHook['cambiarEstadoTarea'];
  eliminarTarea: ProjectTasksHook['eliminarTarea'];
  crearTarea: ProjectTasksHook['crearTarea'];
  editarTarea: ProjectTasksHook['editarTarea'];
  asignarTarea: ProjectTasksHook['asignarTarea'];
  desasignarTarea: ProjectTasksHook['desasignarTarea'];
  roles: RolOpcion[];
  milestones: HitoOpcion[];
  members: MiembroProyecto[];
  labels: ProjectLabelsHook['labels'];
  labelsLoading: boolean;
  labelsError: boolean;
  onRetryLabels: () => void;
  createLabel: ProjectLabelsHook['createLabel'];
  updateLabel: ProjectLabelsHook['updateLabel'];
  deleteLabel: ProjectLabelsHook['deleteLabel'];
  /** Tarea a enfocar/resaltar al llegar desde una notificación (Tarea 39). */
  focusTaskId?: number | null;
  filtroRolExterno?: string;
  filtroHitoExterno?: string;
  onFiltroRolChange?: (value: string) => void;
  onFiltroHitoChange?: (value: string) => void;
  mostrarToolbar?: boolean;
}

const MOBILE_BREAKPOINT = 768;
const CONTROL_CLASS =
  'h-10 min-h-10 rounded-md border-outline-variant px-3 text-xs font-semibold shadow-sm';

/**
 * Hook local y defensivo (no el `useIsMobile` compartido de `hooks/use-mobile`):
 * si `window.matchMedia` no existe (jsdom en las 27 pruebas ya aprobadas de
 * la Tarea 38, que no lo simulan) se queda en `false` — escritorio, el
 * comportamiento exacto de antes — en vez de lanzar. Solo las pruebas
 * nuevas de esta tarea que simulan `matchMedia` activan la rama móvil.
 */
function useTableroEsMovil(): boolean {
  const [esMovil, setEsMovil] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const actualizar = () => setEsMovil(mql.matches);
    actualizar();
    mql.addEventListener('change', actualizar);
    return () => mql.removeEventListener('change', actualizar);
  }, []);
  return esMovil;
}

function ColumnasSkeleton() {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <div className="grid min-w-[1120px] grid-cols-4 gap-4 xl:min-w-0">
          {COLUMNAS_TABLERO.map((columna) => (
            <div
              key={columna.estado}
              className="min-w-0 space-y-2 rounded-xl bg-surface-container-high p-3"
            >
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-20 w-full rounded-lg" />
              <Skeleton className="h-20 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex md:hidden flex-col gap-3">
        <div className="flex gap-2 overflow-x-auto">
          {COLUMNAS_TABLERO.map((columna) => (
            <Skeleton key={columna.estado} className="h-11 w-20 shrink-0 rounded-lg" />
          ))}
        </div>
        <div className="space-y-2">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      </div>
    </>
  );
}

interface KanbanColumnProps {
  estado: EstadoTarea;
  titulo: string;
  tareasColumna: TareaPublicaDTO[];
  renderCard: (tarea: TareaPublicaDTO) => ReactNode;
  hayFiltrosActivos: boolean;
}

function KanbanColumn({
  estado,
  titulo,
  tareasColumna,
  renderCard,
  hayFiltrosActivos,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnDropId(estado),
    data: { type: 'column', estado } satisfies ColumnDropData,
  });
  const estilo = ESTADO_COLUMNA_STYLE[estado];

  return (
    <section
      ref={setNodeRef}
      aria-labelledby={`columna-${estado}-heading`}
      data-column-estado={estado}
      className={`flex min-h-0 min-w-0 flex-col gap-2.5 rounded-xl border p-3 transition-all duration-150 ${
        isOver
          ? 'border-primary bg-primary/5 ring-2 ring-inset ring-primary/25'
          : 'border-outline-variant/40 bg-surface-container-low'
      }`}
    >
      {/* Encabezado: indicador circular + nombre + contador (Sección 33) */}
      <div
        className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 ${estilo.headerBg}`}
      >
        <h3
          id={`columna-${estado}-heading`}
          className={`flex items-center gap-2 text-[13px] font-bold ${estilo.headerText}`}
        >
          <span className={`inline-block size-2 rounded-full ${estilo.dot}`} aria-hidden="true" />
          {titulo}
        </h3>
        <span
          className={`inline-flex min-h-[22px] min-w-[22px] items-center justify-center rounded-full bg-surface-container-highest px-1.5 text-xs font-semibold ${estilo.headerText}`}
        >
          {tareasColumna.length}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 pr-1">
        {tareasColumna.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 py-8 text-center">
            <span className={`inline-block size-2.5 rounded-full ${estilo.dot} opacity-40`} aria-hidden="true" />
            <p className="text-xs text-tertiary">
              {hayFiltrosActivos
                ? 'Los filtros actuales no muestran tareas en esta columna.'
                : 'No hay tareas en este estado.'}
            </p>
          </div>
        ) : (
          tareasColumna.map(renderCard)
        )}
        {isOver && (
          <div
            aria-hidden="true"
            className="rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 py-3 text-center text-[11px] font-semibold text-primary"
          >
            Soltar aquí
          </div>
        )}
      </div>
    </section>
  );
}

export function TaskBoard({
  idProyecto,
  tasks,
  isLoading,
  isError,
  onRetry,
  isFetching = false,
  isLeader,
  currentUserId,
  cambiarEstadoTarea,
  eliminarTarea,
  crearTarea,
  editarTarea,
  asignarTarea,
  desasignarTarea,
  roles,
  milestones,
  members,
  labels,
  labelsLoading,
  labelsError,
  onRetryLabels,
  createLabel,
  updateLabel,
  deleteLabel,
  focusTaskId = null,
  filtroRolExterno,
  filtroHitoExterno,
  onFiltroRolChange,
  onFiltroHitoChange,
  mostrarToolbar = true,
}: TaskBoardProps) {
  const [filtroRolInterno, setFiltroRolInterno] = useState(FILTRO_TODOS);
  const [filtroHitoInterno, setFiltroHitoInterno] = useState(FILTRO_TODOS);
  const filtroRol = filtroRolExterno ?? filtroRolInterno;
  const filtroHito = filtroHitoExterno ?? filtroHitoInterno;
  const setFiltroRol = onFiltroRolChange ?? setFiltroRolInterno;
  const setFiltroHito = onFiltroHitoChange ?? setFiltroHitoInterno;
  // El detalle de la tarea ya no es un Sheet lateral: es una página dedicada
  // (/dashboard/projects/:id/kanban/tasks/:taskId). El tablero solo navega hacia
  // ella (Sección 8).
  const router = useRouter();
  const [tareaEliminar, setTareaEliminar] = useState<TareaPublicaDTO | null>(null);
  const [crearAbierto, setCrearAbierto] = useState(false);
  const [tareaEditar, setTareaEditar] = useState<TareaPublicaDTO | null>(null);
  const [etiquetasAbierto, setEtiquetasAbierto] = useState(false);
  const [filtrosMovilAbiertos, setFiltrosMovilAbiertos] = useState(false);
  const [mobileSelectedState, setMobileSelectedState] = useState<EstadoTarea>('POR_HACER');
  const [activeDrag, setActiveDrag] = useState<TaskDragData | null>(null);
  const [dndAnnouncement, setDndAnnouncement] = useState<string | null>(null);

  const esMovil = useTableroEsMovil();
  const focusAppliedRef = useRef(false);
  const cardRefs = useRef(new Map<number, HTMLElement>());
  const handleRefs = useRef(new Map<number, HTMLButtonElement>());

  const registrarCardRef = (idTarea: number, el: HTMLElement | null) => {
    if (el) cardRefs.current.set(idTarea, el);
    else cardRefs.current.delete(idTarea);
  };
  const registrarHandleRef = (idTarea: number, el: HTMLButtonElement | null) => {
    if (el) handleRefs.current.set(idTarea, el);
    else handleRefs.current.delete(idTarea);
  };

  const opcionesRol = useMemo(() => derivarOpcionesRol(tasks), [tasks]);
  const opcionesHito = useMemo(() => derivarOpcionesHito(tasks), [tasks]);
  const tareasFiltradas = useMemo(
    () => filtrarTareas(tasks, filtroRol, filtroHito),
    [tasks, filtroRol, filtroHito],
  );

  const hayFiltrosActivos = filtroRol !== FILTRO_TODOS || filtroHito !== FILTRO_TODOS;
  const sinCoincidencias = tasks.length > 0 && tareasFiltradas.length === 0 && hayFiltrosActivos;

  const limpiarFiltros = () => {
    setFiltroRol(FILTRO_TODOS);
    setFiltroHito(FILTRO_TODOS);
  };

  const esAsignadoActivo = (tarea: TareaPublicaDTO) =>
    currentUserId !== null && tarea.asignacionActiva?.idUsuario === currentUserId;

  // Navegación a la vista dedicada de la tarea (Sección 8-9). El cuerpo de la
  // tarjeta abre Detalles; el icono de comentarios abre la misma ruta con
  // `?section=comments`.
  const abrirDetalle = (tarea: TareaPublicaDTO, tab: 'detalles' | 'comentarios') => {
    const base = `/dashboard/projects/${idProyecto}/kanban/tasks/${tarea.idTarea}`;
    router.push(tab === 'comentarios' ? `${base}?section=comments` : base);
  };

  const handleConfirmarEliminar = () => {
    if (!tareaEliminar) return;
    eliminarTarea.mutate(
      { taskId: tareaEliminar.idTarea },
      { onSuccess: () => setTareaEliminar(null) },
    );
  };

  // Tarea indicada por una notificación: solo se resuelve una vez, cuando
  // la consulta de tareas ya cargó (no dispara una segunda consulta).
  useEffect(() => {
    if (focusTaskId == null || focusAppliedRef.current || isLoading || isError) return;
    focusAppliedRef.current = true;
    const encontrada = tasks.find((t) => t.idTarea === focusTaskId);
    if (!encontrada) return;
    // setState diferido fuera del cuerpo síncrono del efecto (regla
    // react-hooks/set-state-in-effect): esta rama solo corre una vez, al
    // resolver la tarea indicada. En móvil alinea la columna activa para que la
    // tarjeta resaltada sea visible; el detalle completo vive ahora en su propia
    // ruta, no en un Sheet.
    requestAnimationFrame(() => {
      setMobileSelectedState(encontrada.estadoTarea);
    });
  }, [focusTaskId, tasks, isLoading, isError]);

  const tareaEnfocadaAusente =
    focusTaskId != null && !isLoading && !isError && !tasks.some((t) => t.idTarea === focusTaskId);

  const estaBloqueadaPorMutation = (idTarea: number) =>
    cambiarEstadoTarea.isPending && cambiarEstadoTarea.variables?.taskId === idTarea;

  function renderTaskCard(tarea: TareaPublicaDTO) {
    const puedeCambiarEstado = isLeader || esAsignadoActivo(tarea);
    // No se bloquea por `activeDrag`: hacerlo desmonta el handle de arrastre
    // (puedeArrastrar en TaskCard) de la propia tarjeta que se está
    // arrastrando a mitad de gesto, cancelando el drag apenas empieza.
    const bloqueada = estaBloqueadaPorMutation(tarea.idTarea);

    return (
      <TaskCard
        key={tarea.idTarea}
        tarea={tarea}
        puedeCambiarEstado={puedeCambiarEstado}
        puedeEliminar={isLeader}
        puedeEditar={isLeader}
        estadoPending={bloqueada}
        onAbrirDetalles={() => abrirDetalle(tarea, 'detalles')}
        onAbrirComentarios={() => abrirDetalle(tarea, 'comentarios')}
        onSolicitarEliminar={() => setTareaEliminar(tarea)}
        onEditar={() => setTareaEditar(tarea)}
        resaltada={focusTaskId === tarea.idTarea}
        onRegistrarCardRef={registrarCardRef}
        onRegistrarHandleRef={registrarHandleRef}
      />
    );
  }

  // Sensores: distance evita iniciar un drag al pulsar el menú/Select;
  // delay+tolerance en touch permite hacer scroll vertical sin arrastrar
  // por accidente; el coordinateGetter de teclado es propio (§13 de la
  // auditoría) y solo navega entre las cuatro zonas droppable de columna.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: POINTER_ACTIVATION_CONSTRAINT }),
    useSensor(TouchSensor, { activationConstraint: TOUCH_ACTIVATION_CONSTRAINT }),
    useSensor(KeyboardSensor, { coordinateGetter: columnKeyboardCoordinateGetter }),
  );

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as TaskDragData | undefined;
    if (data?.type === 'task') {
      setActiveDrag(data);
      setDndAnnouncement(null);
    }
  }

  function handleDragCancel(_event: DragCancelEvent) {
    setActiveDrag(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    // resolveDragEndAction concentra la regla "mismo estado, fuera de un
    // destino válido o datos ausentes ⇒ sin mutation" (Tarea 39, §12) en una
    // función pura y exhaustivamente probada aparte (task-board-dnd.ts).
    const accion = resolveDragEndAction(event.active, event.over);
    setActiveDrag(null);
    if (!accion) return;

    cambiarEstadoTarea.mutate(
      { taskId: accion.taskId, input: { estadoTarea: accion.estadoDestino } },
      {
        onSuccess: () => {
          setMobileSelectedState((actual) =>
            actual === accion.estadoOrigen ? accion.estadoDestino : actual,
          );
        },
        onError: (error) => {
          setDndAnnouncement(
            `No se pudo mover "${accion.titulo}". Se restauró su estado anterior. ${getApiErrorMessage(error, 'task')}`,
          );
          handleRefs.current.get(accion.taskId)?.focus();
        },
      },
    );
  }

  function renderFiltroRol(idSufijo: string) {
    return (
      <Select value={filtroRol} onValueChange={setFiltroRol}>
        <SelectTrigger
          id={`filtro-rol-${idSufijo}`}
          size="sm"
          aria-label="Filtrar por rol"
          className={`${CONTROL_CLASS} w-full justify-between bg-surface-container-lowest md:w-44`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={FILTRO_TODOS}>Todos los roles</SelectItem>
          {opcionesRol.map((opcion) => (
            <SelectItem key={opcion.valor} value={opcion.valor}>
              {opcion.etiqueta}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  function renderFiltroHito(idSufijo: string) {
    return (
      <Select value={filtroHito} onValueChange={setFiltroHito}>
        <SelectTrigger
          id={`filtro-hito-${idSufijo}`}
          size="sm"
          aria-label="Filtrar por hito"
          className={`${CONTROL_CLASS} w-full justify-between bg-surface-container-lowest md:w-44`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={FILTRO_TODOS}>Todos los hitos</SelectItem>
          {opcionesHito.map((opcion) => (
            <SelectItem key={opcion.valor} value={opcion.valor}>
              {opcion.etiqueta}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-tertiary">
            Tablero de tareas
          </h2>
        </div>
        <ColumnasSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-tertiary">
          Tablero de tareas
        </h2>
        <div role="alert" className="text-center py-10 space-y-3">
          <p className="text-red-600 font-medium text-sm">
            No se pudieron cargar las tareas. Intenta nuevamente.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="rounded-lg border-primary text-primary hover:bg-primary/10 text-xs font-bold min-h-11"
          >
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  const tareasColumnaMovil = ordenarTareas(
    tareasFiltradas.filter((t) => t.estadoTarea === mobileSelectedState),
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={rectIntersection}
      accessibility={{ announcements: taskDragAnnouncements }}
      onDragStart={handleDragStart}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
    >
      <div className="min-h-0 space-y-4">
        {/* TOOLBAR (Sección 20-26) */}
        {mostrarToolbar && (
        <div className="flex flex-col gap-3 pb-1 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-xl font-bold text-on-surface md:text-[22px]">
              Tablero de tareas
            </h2>
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {tareasFiltradas.length} {tareasFiltradas.length === 1 ? 'tarea' : 'tareas'}
            </span>
            {isFetching && (
              <span aria-live="polite" className="text-[11px] text-tertiary flex items-center gap-1">
                <span className="inline-block size-1.5 rounded-full bg-primary animate-pulse" aria-hidden="true" />
                Sincronizando…
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {/* Filtros de escritorio: siempre visibles en md+ */}
            <div className="hidden flex-wrap items-center gap-2 md:flex">
              {renderFiltroRol('escritorio')}
              {renderFiltroHito('escritorio')}
              {hayFiltrosActivos && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={limpiarFiltros}
                  className={`${CONTROL_CLASS} border border-transparent text-tertiary hover:text-on-surface`}
                >
                  Limpiar filtros
                </Button>
              )}
            </div>

            {/* Filtros móviles: agrupados en un panel "Filtros" */}
            <div className="md:hidden">
              <Sheet open={filtrosMovilAbiertos} onOpenChange={setFiltrosMovilAbiertos}>
                <SheetTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={`${CONTROL_CLASS} gap-1.5`}
                  >
                    <Filter className="size-3.5" aria-hidden="true" />
                    Filtros
                    {hayFiltrosActivos && (
                      <span
                        aria-hidden="true"
                        className="ml-0.5 inline-block size-1.5 rounded-full bg-primary"
                      />
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="space-y-4">
                  <SheetHeader>
                    <SheetTitle>Filtros del tablero</SheetTitle>
                    <SheetDescription>Filtra las tareas visibles por rol o por hito.</SheetDescription>
                  </SheetHeader>
                  <div className="space-y-3 px-4 pb-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-tertiary" htmlFor="filtro-rol-movil">
                        Rol
                      </label>
                      {renderFiltroRol('movil')}
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-tertiary" htmlFor="filtro-hito-movil">
                        Hito
                      </label>
                      {renderFiltroHito('movil')}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={limpiarFiltros}
                      className={`${CONTROL_CLASS} w-full border-primary text-primary hover:bg-primary/10`}
                    >
                      Limpiar filtros
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
            </div>

            {isLeader && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEtiquetasAbierto(true)}
                  className={`${CONTROL_CLASS} w-full gap-1.5 bg-surface-container-lowest sm:w-auto md:min-w-40`}
                >
                  <Tags className="size-3.5" aria-hidden="true" />
                  Gestionar etiquetas
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setCrearAbierto(true)}
                  className={`${CONTROL_CLASS} w-full gap-1.5 border-primary bg-primary text-on-primary hover:bg-primary/90 sm:w-auto md:min-w-36`}
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                  Nueva tarea
                </Button>
              </>
            )}
          </div>
        </div>
        )}

        {tareaEnfocadaAusente && (
          <div
            role="status"
            className="rounded-lg border border-outline-variant/40 bg-surface-container-high px-4 py-3 text-sm text-on-surface-variant"
          >
            La tarea indicada ya no está disponible.
          </div>
        )}

        {tasks.length === 0 && (
          <div
            role="status"
            className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-outline-variant/50 bg-surface-container-low px-6 py-14 text-center"
          >
            <h3 className="text-base font-bold text-on-surface">Aún no hay tareas</h3>
            <p className="max-w-md text-sm text-on-surface-variant">
              {isLeader
                ? 'Crea la primera tarea con “Nueva tarea” para comenzar a organizar el trabajo del proyecto.'
                : 'Cuando el líder cree tareas, aparecerán aquí para organizar el trabajo del proyecto.'}
            </p>
          </div>
        )}

        {sinCoincidencias && (
          <div role="status" className="text-center py-6 space-y-2">
            <p className="text-sm text-tertiary">
              No hay tareas que coincidan con los filtros seleccionados.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={limpiarFiltros}
              className={`${CONTROL_CLASS} border-primary text-primary hover:bg-primary/10`}
            >
              Limpiar filtros
            </Button>
          </div>
        )}

        {tasks.length > 0 &&
          (esMovil ? (
            <div className="space-y-3">
              <MobileTaskStatusNav
                tareas={tareasFiltradas}
                estadoSeleccionado={mobileSelectedState}
                onSeleccionarEstado={setMobileSelectedState}
              />
              <div className="space-y-2.5">
                {tareasColumnaMovil.length === 0 ? (
                  <p className="py-8 text-center text-xs text-tertiary">
                    {hayFiltrosActivos
                      ? 'Los filtros actuales no muestran tareas en esta columna.'
                      : 'No hay tareas en este estado.'}
                  </p>
                ) : (
                  tareasColumnaMovil.map(renderTaskCard)
                )}
              </div>
            </div>
          ) : (
            <div className="-mx-1 overflow-x-auto px-1 pb-2">
              {/* Altura natural (como Hitos): las columnas crecen con su contenido
                  y es la página la que hace scroll (la sidebar queda fija por el
                  layout). `min-h` da un piso de ~4 tarjetas por columna. No se usa
                  una altura ligada al viewport para no reservar franja en blanco. */}
              <div className="grid min-h-105 min-w-280 grid-cols-4 gap-4 xl:min-w-0">
                {COLUMNAS_TABLERO.map((columna) => {
                  const tareasColumna = ordenarTareas(
                    tareasFiltradas.filter((t) => t.estadoTarea === columna.estado),
                  );
                  return (
                    <KanbanColumn
                      key={columna.estado}
                      estado={columna.estado}
                      titulo={columna.titulo}
                      tareasColumna={tareasColumna}
                      renderCard={renderTaskCard}
                      hayFiltrosActivos={hayFiltrosActivos}
                    />
                  );
                })}
              </div>
            </div>
          ))}

        <DragOverlay dropAnimation={null} style={{ pointerEvents: 'none' }}>
          {activeDrag ? (
            <TaskDragOverlayCard titulo={activeDrag.titulo} estadoOrigen={activeDrag.estadoOrigen} />
          ) : null}
        </DragOverlay>

        {/* Rollback/error del movimiento: la respuesta HTTP llega después del
            onDragEnd síncrono de @dnd-kit, así que se anuncia aparte. */}
        <div aria-live="assertive" role="status" className="sr-only">
          {dndAnnouncement ?? ''}
        </div>

        {/* ELIMINACIÓN: confirmación única controlada por la tarea seleccionada */}
        <AlertDialog
          open={tareaEliminar !== null}
          onOpenChange={(open) => {
            if (!open) setTareaEliminar(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar tarea</AlertDialogTitle>
              <AlertDialogDescription>
                {tareaEliminar
                  ? `Esta acción eliminará la tarea "${tareaEliminar.tituloTarea}". Esta acción no se puede deshacer.`
                  : ''}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {eliminarTarea.isError && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                {(eliminarTarea.error as Error | null)?.message ?? 'No se pudo eliminar la tarea.'}
              </p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={eliminarTarea.isPending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={eliminarTarea.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  handleConfirmarEliminar();
                }}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {eliminarTarea.isPending ? 'Eliminando...' : 'Confirmar'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* CREAR / EDITAR: única instancia reutilizada en ambos modos */}
        <TaskFormDialog
          open={crearAbierto || tareaEditar !== null}
          mode={tareaEditar !== null ? 'edit' : 'create'}
          task={tareaEditar}
          roles={roles}
          milestones={milestones}
          members={members}
          labels={labels}
          isLeader={isLeader}
          crearTarea={crearTarea}
          editarTarea={editarTarea}
          asignarTarea={asignarTarea}
          desasignarTarea={desasignarTarea}
          onOpenChange={(open) => {
            if (!open) {
              setCrearAbierto(false);
              setTareaEditar(null);
            }
          }}
          onRequestDelete={(tarea) => setTareaEliminar(tarea)}
          onManageLabels={isLeader ? () => setEtiquetasAbierto(true) : undefined}
        />

        {/* ETIQUETAS: única instancia, solo accesible para el líder */}
        {isLeader && (
          <ProjectLabelsDrawer
            open={etiquetasAbierto}
            onOpenChange={setEtiquetasAbierto}
            labels={labels}
            isLoading={labelsLoading}
            isError={labelsError}
            onRetry={onRetryLabels}
            createLabel={createLabel}
            updateLabel={updateLabel}
            deleteLabel={deleteLabel}
          />
        )}
      </div>
    </DndContext>
  );
}
