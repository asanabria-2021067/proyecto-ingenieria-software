'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Tag } from '@/components/ui/tag';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DATA_TABLE_CARD,
  DATA_TABLE_HEAD_ROW,
  DATA_TABLE_HEAD_TEXT,
  DATA_TABLE_ROW_BORDER,
  DATA_TABLE_ROW_HOVER,
} from '@/components/dashboard/data-table';
import { TaskAvatares, textoResponsables } from '@/components/projects/task-avatares';
import {
  ESTADO_LABEL,
  ESTADO_TAREA_TONE,
  PRIORIDAD_COLOR,
  PRIORIDAD_ICON,
  PRIORIDAD_LABEL,
  estaVencida,
  formatearFechaLimite,
  ordenarTabla,
  prioridadTextoAccesible,
  responsablesDe,
  type ColumnaOrdenTabla,
} from '@/components/projects/task-board.utils';
import type { DireccionOrden } from '@/lib/tasks/filters';
import type { TareaPublicaDTO } from '@/lib/types/tasks';

const COLUMNAS: { key: ColumnaOrdenTabla; label: string }[] = [
  { key: 'titulo', label: 'Título' },
  { key: 'estado', label: 'Estado' },
  { key: 'prioridad', label: 'Prioridad' },
  { key: 'fechaLimite', label: 'Fecha límite' },
  { key: 'responsable', label: 'Responsable' },
];

const TH = `h-auto whitespace-nowrap px-stack py-tight ${DATA_TABLE_HEAD_TEXT}`;
const TD = 'px-stack py-inline align-middle';

interface Props {
  tasks: TareaPublicaDTO[];
  /** Abre el mismo detalle de tarea que el Kanban. */
  onAbrir: (tarea: TareaPublicaDTO) => void;
}

/** MEJ-112: vista de tabla con columnas ordenables (indicador visual y `aria-sort`). */
export function TaskTableView({ tasks, onAbrir }: Props) {
  const [orden, setOrden] = useState<{ columna: ColumnaOrdenTabla; direccion: DireccionOrden }>({
    columna: 'fechaLimite',
    direccion: 'asc',
  });
  const filas = useMemo(() => ordenarTabla(tasks, orden.columna, orden.direccion), [tasks, orden]);

  const ordenarPor = (columna: ColumnaOrdenTabla) =>
    setOrden((actual) => ({
      columna,
      direccion: actual.columna === columna && actual.direccion === 'asc' ? 'desc' : 'asc',
    }));

  return (
    <div className="space-y-2">
      <p className="type-meta md:hidden">Desliza la tabla hacia los lados para ver todas las columnas.</p>
      <div className={DATA_TABLE_CARD}>
        <Table containerLabel="Tabla de tareas">
          <TableHeader>
            <TableRow className={`${DATA_TABLE_HEAD_ROW} hover:bg-surface-container-low`}>
              {COLUMNAS.map(({ key, label }) => {
                const activa = orden.columna === key;
                const Icono = activa ? (orden.direccion === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
                return (
                  <TableHead
                    key={key}
                    scope="col"
                    aria-sort={activa ? (orden.direccion === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={TH}
                  >
                    <button
                      type="button"
                      onClick={() => ordenarPor(key)}
                      className="inline-flex items-center gap-1 rounded-sm transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {label}
                      <Icono aria-hidden="true" className={`h-3 w-3 ${activa ? 'text-primary' : 'text-text-secondary/60'}`} />
                    </button>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((tarea) => {
              const PrioridadIcon = PRIORIDAD_ICON[tarea.prioridad];
              const vencida = estaVencida(tarea);
              const responsables = responsablesDe(tarea);
              return (
                <TableRow key={tarea.idTarea} className={`${DATA_TABLE_ROW_BORDER} ${DATA_TABLE_ROW_HOVER}`}>
                  <TableCell className={`${TD} min-w-56 whitespace-normal`}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => onAbrir(tarea)}
                          aria-label={`Abrir detalles de "${tarea.tituloTarea}"`}
                          className="line-clamp-2 break-words rounded-sm text-left text-sm font-semibold text-on-surface hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {tarea.tituloTarea}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs break-words">{tarea.tituloTarea}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className={TD}>
                    <Tag tone={ESTADO_TAREA_TONE[tarea.estadoTarea]} size="sm">
                      {ESTADO_LABEL[tarea.estadoTarea]}
                    </Tag>
                  </TableCell>
                  <TableCell className={TD}>
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${PRIORIDAD_COLOR[tarea.prioridad]}`}>
                      <PrioridadIcon className="size-3.5" aria-hidden="true" />
                      <span aria-hidden="true">{PRIORIDAD_LABEL[tarea.prioridad]}</span>
                      <span className="sr-only">{prioridadTextoAccesible(tarea.prioridad)}</span>
                    </span>
                  </TableCell>
                  <TableCell className={`${TD} whitespace-nowrap text-xs ${vencida ? 'font-semibold text-destructive' : 'text-tertiary'}`}>
                    <span className="inline-flex items-center gap-1">
                      {vencida && <AlertTriangle className="size-3.5" aria-label="Vencida" />}
                      {tarea.fechaLimite ? formatearFechaLimite(tarea.fechaLimite) : 'Sin fecha'}
                    </span>
                  </TableCell>
                  <TableCell className={TD}>
                    <span
                      className="flex items-center gap-1.5 text-xs text-on-surface-variant"
                      title={responsables.map((r) => `${r.nombre} ${r.apellido}`).join(', ') || undefined}
                    >
                      <TaskAvatares responsables={responsables} />
                      <span className="whitespace-nowrap">{textoResponsables(responsables)}</span>
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
