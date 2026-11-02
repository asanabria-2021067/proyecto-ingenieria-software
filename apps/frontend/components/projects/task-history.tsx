'use client';

import { History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { useTaskHistory } from '@/hooks/use-task-extras';

function formatearFechaHora(iso: string): string {
  return new Intl.DateTimeFormat('es-GT', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Guatemala',
  }).format(new Date(iso));
}

interface Props {
  idProyecto: number;
  idTarea: number;
  /** Ver `useTaskHistory`: cambia cuando la tarea cambia. */
  marca?: string;
}

/** MEJ-10: quién creó, movió, reasignó o cambió la fecha de la tarea (además de la bitácora). */
export function TaskHistory({ idProyecto, idTarea, marca }: Props) {
  const { entradas, isLoading, isError, refetch } = useTaskHistory(idProyecto, idTarea, marca);

  return (
    <section
      className="rounded-[11px] border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-sm"
      aria-labelledby="historial-titulo"
    >
      <h2 id="historial-titulo" className="mb-3 flex items-center gap-2 text-sm font-bold text-on-surface">
        <History className="size-4 text-tertiary" aria-hidden="true" />
        Historial
      </h2>

      {isLoading ? (
        <SkeletonRegion label="Cargando historial" className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </SkeletonRegion>
      ) : isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
          No se pudo cargar el historial.
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
            Reintentar
          </Button>
        </div>
      ) : entradas.length === 0 ? (
        <p className="text-sm italic text-tertiary">Todavía no hay movimientos registrados para esta tarea.</p>
      ) : (
        <ol className="space-y-2.5">
          {entradas.map((entrada) => (
            <li key={entrada.idAuditoria} className="text-sm text-on-surface-variant">
              <span className="font-semibold text-on-surface">
                {entrada.actor ? `${entrada.actor.nombre} ${entrada.actor.apellido}` : 'Alguien'}
              </span>{' '}
              {entrada.descripcion}
              <time dateTime={entrada.fecha} className="block text-xs text-tertiary">
                {formatearFechaHora(entrada.fecha)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
