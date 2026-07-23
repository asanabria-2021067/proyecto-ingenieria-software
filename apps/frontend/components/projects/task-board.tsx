'use client';

import { useMemo, useState } from 'react';
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

type ProjectTasksHook = ReturnType<typeof useProjectTasks>;

interface TaskBoardProps {
  idProyecto: number;
  tasks: TareaPublicaDTO[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  isLeader: boolean;
  currentUserId: number | null;
  cambiarEstadoTarea: ProjectTasksHook['cambiarEstadoTarea'];
  eliminarTarea: ProjectTasksHook['eliminarTarea'];
}

function ColumnasSkeleton() {
  return (
    <div className="flex gap-4 overflow-x-auto -mx-1 px-1">
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
  );
}

export function TaskBoard({
  idProyecto,
  tasks,
  isLoading,
  isError,
  onRetry,
  isLeader,
  currentUserId,
  cambiarEstadoTarea,
  eliminarTarea,
}: TaskBoardProps) {
  const [filtroRol, setFiltroRol] = useState(FILTRO_TODOS);
  const [filtroHito, setFiltroHito] = useState(FILTRO_TODOS);
  const [tareaComentarios, setTareaComentarios] = useState<TareaPublicaDTO | null>(null);
  const [tareaEliminar, setTareaEliminar] = useState<TareaPublicaDTO | null>(null);

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
        <div className="text-center py-10 space-y-3">
          <p className="text-red-600 font-medium text-sm">
            No se pudieron cargar las tareas. Intenta nuevamente.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="rounded-lg border-primary text-primary hover:bg-primary/10 text-xs font-bold"
          >
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ENCABEZADO */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-tertiary">
            Tablero de tareas
          </h2>
          <span className="text-xs text-tertiary">
            {tareasFiltradas.length} {tareasFiltradas.length === 1 ? 'tarea' : 'tareas'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Select value={filtroRol} onValueChange={setFiltroRol}>
            <SelectTrigger size="sm" aria-label="Filtrar por rol" className="text-xs">
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

          <Select value={filtroHito} onValueChange={setFiltroHito}>
            <SelectTrigger size="sm" aria-label="Filtrar por hito" className="text-xs">
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
        </div>
      </div>

      {sinCoincidencias && (
        <div role="status" className="text-center py-6 space-y-2">
          <p className="text-sm text-tertiary">
            No hay tareas que coincidan con los filtros seleccionados.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={limpiarFiltros}
            className="rounded-lg border-primary text-primary hover:bg-primary/10 text-xs font-bold"
          >
            Limpiar filtros
          </Button>
        </div>
      )}

      {/* COLUMNAS */}
      <div className="flex gap-4 overflow-x-auto -mx-1 px-1">
        {COLUMNAS_TABLERO.map((columna) => {
          const tareasColumna = ordenarTareas(
            tareasFiltradas.filter((t) => t.estadoTarea === columna.estado),
          );

          return (
            <section
              key={columna.estado}
              aria-labelledby={`columna-${columna.estado}-heading`}
              className="w-72 shrink-0 bg-surface-container-high rounded-xl p-3 space-y-2"
            >
              <div className="flex items-center justify-between px-1">
                <h3
                  id={`columna-${columna.estado}-heading`}
                  className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant"
                >
                  {columna.titulo}
                </h3>
                <span className="text-xs text-tertiary">{tareasColumna.length}</span>
              </div>

              <div className="space-y-2">
                {tareasColumna.length === 0 && (
                  <p className="text-xs text-tertiary text-center py-6">Sin tareas</p>
                )}
                {tareasColumna.map((tarea) => {
                  const puedeCambiarEstado = isLeader || esAsignadoActivo(tarea);
                  const estaMutandoEstado =
                    cambiarEstadoTarea.isPending &&
                    cambiarEstadoTarea.variables?.taskId === tarea.idTarea;
                  const fallóEstado =
                    cambiarEstadoTarea.isError &&
                    cambiarEstadoTarea.variables?.taskId === tarea.idTarea;

                  return (
                    <TaskCard
                      key={tarea.idTarea}
                      tarea={tarea}
                      puedeCambiarEstado={puedeCambiarEstado}
                      puedeEliminar={isLeader}
                      estadoPending={estaMutandoEstado}
                      estadoError={
                        fallóEstado
                          ? ((cambiarEstadoTarea.error as Error | null)?.message ??
                            'No se pudo cambiar el estado.')
                          : null
                      }
                      onCambiarEstado={(nuevoEstado) => handleCambiarEstado(tarea, nuevoEstado)}
                      onAbrirComentarios={() => setTareaComentarios(tarea)}
                      onSolicitarEliminar={() => setTareaEliminar(tarea)}
                    />
                  );
                })}
              </div>
            </section>
          );
        })}
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
    </div>
  );
}
