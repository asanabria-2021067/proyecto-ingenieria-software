'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { TaskCommentsDialog } from '@/components/projects/task-comments-dialog';
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
}

const MOBILE_BREAKPOINT = 768;

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
      <div className="hidden md:flex gap-4 overflow-x-auto -mx-1 px-1">
        {COLUMNAS_TABLERO.map((columna) => (
          <div
            key={columna.estado}
            className="w-72 shrink-0 bg-surface-container-high rounded-xl p-3 space-y-2"
          >
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
        ))}
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
}

function KanbanColumn({ estado, titulo, tareasColumna, renderCard }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnDropId(estado),
    data: { type: 'column', estado } satisfies ColumnDropData,
  });

  return (
    <section
      ref={setNodeRef}
      aria-labelledby={`columna-${estado}-heading`}
      data-column-estado={estado}
      className={`w-72 shrink-0 rounded-xl p-3 space-y-2 border-2 transition-colors ${
        isOver ? 'border-primary bg-primary/5' : 'border-transparent bg-surface-container-high'
      }`}
    >
      <div className="flex items-center justify-between px-1">
        <h3
          id={`columna-${estado}-heading`}
          className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant"
        >
          {titulo}
        </h3>
        <span className="text-xs text-tertiary">{tareasColumna.length}</span>
      </div>

      <div className="space-y-2">
        {tareasColumna.length === 0 && (
          <p className="text-xs text-tertiary text-center py-6">Sin tareas</p>
        )}
        {tareasColumna.map(renderCard)}
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
}: TaskBoardProps) {
  const [filtroRol, setFiltroRol] = useState(FILTRO_TODOS);
  const [filtroHito, setFiltroHito] = useState(FILTRO_TODOS);
  const [tareaComentarios, setTareaComentarios] = useState<TareaPublicaDTO | null>(null);
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

  const handleCambiarEstado = (tarea: TareaPublicaDTO, nuevoEstado: EstadoTarea) => {
    cambiarEstadoTarea.mutate({ taskId: tarea.idTarea, input: { estadoTarea: nuevoEstado } });
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
    // resolver la tarea indicada por la notificación.
    requestAnimationFrame(() => {
      setMobileSelectedState(encontrada.estadoTarea);
      cardRefs.current.get(focusTaskId)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      handleRefs.current.get(focusTaskId)?.focus();
    });
  }, [focusTaskId, tasks, isLoading, isError]);

  const tareaEnfocadaAusente =
    focusTaskId != null && !isLoading && !isError && !tasks.some((t) => t.idTarea === focusTaskId);

  const estaBloqueadaPorMutation = (idTarea: number) =>
    cambiarEstadoTarea.isPending && cambiarEstadoTarea.variables?.taskId === idTarea;
  const estaBloqueadaPorDrag = (idTarea: number) => activeDrag?.taskId === idTarea;

  function renderTaskCard(tarea: TareaPublicaDTO) {
    const puedeCambiarEstado = isLeader || esAsignadoActivo(tarea);
    const bloqueada = estaBloqueadaPorMutation(tarea.idTarea) || estaBloqueadaPorDrag(tarea.idTarea);
    const falloEstado =
      cambiarEstadoTarea.isError && cambiarEstadoTarea.variables?.taskId === tarea.idTarea;

    return (
      <TaskCard
        key={tarea.idTarea}
        tarea={tarea}
        puedeCambiarEstado={puedeCambiarEstado}
        puedeEliminar={isLeader}
        puedeEditar={isLeader}
        estadoPending={bloqueada}
        estadoError={falloEstado ? getApiErrorMessage(cambiarEstadoTarea.error, 'task') : null}
        onCambiarEstado={(nuevoEstado) => handleCambiarEstado(tarea, nuevoEstado)}
        onAbrirComentarios={() => setTareaComentarios(tarea)}
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
          className="text-xs w-full"
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
          className="text-xs w-full"
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
      <div className="space-y-4">
        {/* ENCABEZADO */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-tertiary">
              Tablero de tareas
            </h2>
            <span className="text-xs text-tertiary">
              {tareasFiltradas.length} {tareasFiltradas.length === 1 ? 'tarea' : 'tareas'}
            </span>
            {isFetching && (
              <span aria-live="polite" className="text-[11px] text-tertiary flex items-center gap-1">
                <span className="inline-block size-1.5 rounded-full bg-primary animate-pulse" aria-hidden="true" />
                Sincronizando…
              </span>
            )}
          </div>

          <div className="flex items-center flex-wrap gap-2">
            {/* Filtros de escritorio: siempre visibles en md+ */}
            <div className="hidden md:flex items-center gap-2">
              {renderFiltroRol('escritorio')}
              {renderFiltroHito('escritorio')}
            </div>

            {/* Filtros móviles: agrupados en un panel "Filtros" */}
            <div className="md:hidden">
              <Sheet open={filtrosMovilAbiertos} onOpenChange={setFiltrosMovilAbiertos}>
                <SheetTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-lg border-outline-variant text-xs font-bold gap-1.5 min-h-11"
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
                      className="w-full rounded-lg border-primary text-primary hover:bg-primary/10 text-xs font-bold min-h-11"
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
                  className="rounded-lg border-outline-variant text-xs font-bold gap-1.5 min-h-11"
                >
                  <Tags className="size-3.5" aria-hidden="true" />
                  Gestionar etiquetas
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setCrearAbierto(true)}
                  className="rounded-lg bg-primary hover:bg-primary/90 text-on-primary text-xs font-bold gap-1.5 min-h-11"
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                  Nueva tarea
                </Button>
              </>
            )}
          </div>
        </div>

        {tareaEnfocadaAusente && (
          <div
            role="status"
            className="rounded-lg border border-outline-variant/40 bg-surface-container-high px-4 py-3 text-sm text-on-surface-variant"
          >
            La tarea indicada ya no está disponible.
          </div>
        )}

        {tasks.length === 0 && (
          <p role="status" className="text-xs text-tertiary">
            Este proyecto todavía no tiene tareas.
          </p>
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
              className="rounded-lg border-primary text-primary hover:bg-primary/10 text-xs font-bold min-h-11"
            >
              Limpiar filtros
            </Button>
          </div>
        )}

        {esMovil ? (
          <div className="space-y-3">
            <MobileTaskStatusNav
              tareas={tareasFiltradas}
              estadoSeleccionado={mobileSelectedState}
              onSeleccionarEstado={setMobileSelectedState}
            />
            <div className="space-y-2">
              {tareasColumnaMovil.length === 0 && (
                <p className="text-xs text-tertiary text-center py-6">Sin tareas</p>
              )}
              {tareasColumnaMovil.map(renderTaskCard)}
            </div>
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto -mx-1 px-1">
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
                />
              );
            })}
          </div>
        )}

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

        {/* COMENTARIOS: instancia única controlada por la tarea seleccionada */}
        <TaskCommentsDialog
          tarea={tareaComentarios}
          idProyecto={idProyecto}
          open={tareaComentarios !== null}
          onOpenChange={(open) => {
            if (!open) setTareaComentarios(null);
          }}
        />

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
