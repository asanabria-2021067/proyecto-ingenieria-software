'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowLeft } from 'lucide-react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getTareasByProyecto, updateEstadoTarea } from '@/lib/services/tasks';
import uvgSwal from '@/lib/swal';
import { EstadoTarea, PrioridadTarea, Tarea } from '@/types';

const COLUMNS: { key: EstadoTarea; label: string }[] = [
  { key: 'POR_HACER', label: 'Por hacer' },
  { key: 'EN_PROGRESO', label: 'En progreso' },
  { key: 'EN_REVISION', label: 'En revision' },
  { key: 'HECHO', label: 'Hecho' },
];

const PRIORIDAD_CONFIG: Record<PrioridadTarea, { label: string; className: string }> = {
  BAJA: { label: 'Baja', className: 'bg-surface-container text-tertiary' },
  MEDIA: { label: 'Media', className: 'bg-amber-100 text-amber-800' },
  ALTA: { label: 'Alta', className: 'bg-error-container text-error' },
};

function getFechaLimiteColor(fechaLimite: string | null): string {
  if (!fechaLimite) return 'bg-surface-container text-tertiary';
  const dias = Math.ceil((new Date(fechaLimite).getTime() - Date.now()) / 86400000);
  if (dias < 2) return 'bg-error-container text-error';
  if (dias <= 5) return 'bg-amber-100 text-amber-800';
  return 'bg-secondary-container text-on-secondary-container';
}

function groupByEstado(tareas: Tarea[]): Record<EstadoTarea, Tarea[]> {
  const grouped: Record<EstadoTarea, Tarea[]> = {
    POR_HACER: [],
    EN_PROGRESO: [],
    EN_REVISION: [],
    HECHO: [],
  };
  [...tareas]
    .sort((a, b) => a.orden - b.orden)
    .forEach((t) => grouped[t.estadoTarea].push(t));
  return grouped;
}

function TaskCard({ tarea }: { tarea: Tarea }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `task-${tarea.idTarea}`,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const asignado = tarea.asignaciones[0]?.usuario;
  const prioridadConfig = PRIORIDAD_CONFIG[tarea.prioridad];
  const fechaColor = getFechaLimiteColor(tarea.fechaLimite);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="bg-surface-container-lowest rounded-xl border border-outline-variant p-4 cursor-grab touch-none select-none hover:shadow-md transition-shadow active:cursor-grabbing"
    >
      <p className="font-semibold text-sm text-on-surface mb-3 leading-tight">
        {tarea.tituloTarea}
      </p>

      <div className="flex items-center flex-wrap gap-2 mb-3">
        <span
          className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${prioridadConfig.className}`}
        >
          {prioridadConfig.label}
        </span>
        {tarea.fechaLimite && (
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${fechaColor}`}
          >
            {new Date(tarea.fechaLimite).toLocaleDateString('es-GT', {
              day: 'numeric',
              month: 'short',
            })}
          </span>
        )}
      </div>

      {asignado && (
        <div className="flex items-center gap-2">
          <Avatar className="size-6">
            {asignado.fotoUrl && (
              <AvatarImage src={asignado.fotoUrl} alt={asignado.nombre} />
            )}
            <AvatarFallback className="text-[10px] font-bold">
              {asignado.nombre[0]}
              {asignado.apellido[0]}
            </AvatarFallback>
          </Avatar>
          <span className="text-xs text-tertiary">
            {asignado.nombre} {asignado.apellido}
          </span>
        </div>
      )}
    </div>
  );
}

function Column({
  estado,
  label,
  tareas,
}: {
  estado: EstadoTarea;
  label: string;
  tareas: Tarea[];
}) {
  const { setNodeRef } = useDroppable({ id: `col-${estado}` });

  return (
    <div className="flex-1 min-w-[260px] bg-surface-container rounded-2xl p-4">
      <h3 className="font-headline font-bold text-sm text-on-surface mb-4 flex items-center justify-between">
        {label}
        <span className="text-xs font-normal text-tertiary bg-surface-container-lowest rounded-full px-2 py-0.5">
          {tareas.length}
        </span>
      </h3>
      <div ref={setNodeRef} className="space-y-3 min-h-[120px]">
        <SortableContext
          items={tareas.map((t) => `task-${t.idTarea}`)}
          strategy={verticalListSortingStrategy}
        >
          {tareas.map((t) => (
            <TaskCard key={t.idTarea} tarea={t} />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

export default function TableroPage() {
  const { id } = useParams<{ id: string }>();
  const idProyecto = Number(id);
  const queryClient = useQueryClient();

  const { data: tareas = [], isLoading, isError } = useQuery<Tarea[]>({
    queryKey: ['tareas', idProyecto],
    queryFn: () => getTareasByProyecto(idProyecto),
  });

  const [columns, setColumns] = useState<Record<EstadoTarea, Tarea[]>>(() =>
    groupByEstado([]),
  );

  useEffect(() => {
    setColumns(groupByEstado(tareas));
  }, [tareas]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  type MoveTaskVars = {
    id: number;
    estadoTarea: EstadoTarea;
    orden: number;
    prevColumns: Record<EstadoTarea, Tarea[]>;
  };

  const mutation = useMutation({
    mutationFn: (vars: MoveTaskVars) =>
      updateEstadoTarea(vars.id, { estadoTarea: vars.estadoTarea, orden: vars.orden }),
    onError: (_error, vars) => {
      setColumns(vars.prevColumns);
      uvgSwal.fire({
        icon: 'error',
        title: 'No se pudo mover la tarea',
        text: 'El cambio fue revertido. Intenta de nuevo.',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tareas', idProyecto] });
    },
  });

  function findContainer(domId: string): EstadoTarea | undefined {
    for (const col of COLUMNS) {
      if (columns[col.key].some((t) => `task-${t.idTarea}` === domId)) {
        return col.key;
      }
    }
    return undefined;
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeDomId = String(active.id);
    const overDomId = String(over.id);
    if (activeDomId === overDomId) return;

    const taskId = Number(activeDomId.replace('task-', ''));
    const sourceCol = findContainer(activeDomId);
    if (!sourceCol) return;

    const task = columns[sourceCol].find((t) => t.idTarea === taskId);
    if (!task) return;

    let destCol: EstadoTarea;
    let destIndex: number;

    if (overDomId.startsWith('col-')) {
      destCol = overDomId.replace('col-', '') as EstadoTarea;
      destIndex = columns[destCol].length;
    } else {
      const maybeDest = findContainer(overDomId);
      if (!maybeDest) return;
      destCol = maybeDest;
      destIndex = columns[destCol].findIndex((t) => `task-${t.idTarea}` === overDomId);
      if (destIndex === -1) destIndex = columns[destCol].length;
    }

    if (sourceCol === destCol && task === columns[destCol][destIndex]) return;

    const prevColumns = columns;

    const sourceList = columns[sourceCol].filter((t) => t.idTarea !== taskId);
    const destList =
      sourceCol === destCol ? sourceList : [...columns[destCol]];
    destList.splice(destIndex, 0, { ...task, estadoTarea: destCol });

    setColumns((prev) => ({
      ...prev,
      [sourceCol]: sourceCol === destCol ? destList : sourceList,
      [destCol]: destList,
    }));

    mutation.mutate({ id: taskId, estadoTarea: destCol, orden: destIndex, prevColumns });
  }

  return (
    <DashboardLayout allowAdmin>
      <div className="px-8 py-8 max-w-6xl mx-auto">
        <Link
          href={`/dashboard/proyectos/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-tertiary hover:text-primary mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver al proyecto
        </Link>

        <h1 className="font-headline font-extrabold text-3xl text-on-surface mb-6">
          Tablero de tareas
        </h1>

        {isLoading && (
          <div className="text-center py-16 text-tertiary text-sm">Cargando tablero...</div>
        )}
        {isError && (
          <div className="text-center py-16 text-error text-sm">
            No se pudo cargar el tablero de tareas.
          </div>
        )}

        {!isLoading && !isError && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-4 overflow-x-auto pb-4">
              {COLUMNS.map((col) => (
                <Column
                  key={col.key}
                  estado={col.key}
                  label={col.label}
                  tareas={columns[col.key]}
                />
              ))}
            </div>
          </DndContext>
        )}
      </div>
    </DashboardLayout>
  );
}
