'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { parseFechaSolo } from '@/lib/calendar/utils';
import { tareasQueVencenEstaSemana } from '@/lib/tasks/vencen-esta-semana';
import { getMisTareas, type MiTareaDTO } from '@/lib/services/users';

const MAX_VISIBLES = 5;

function diaCorto(fecha: string): string {
  return parseFechaSolo(fecha).toLocaleDateString('es-GT', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** MEJ-9: tarjeta «Vencen esta semana». Comparte la caché 'mis-tareas' con Mis tareas y el calendario. */
export function VencenEstaSemana() {
  const { data, isLoading, isError } = useQuery<MiTareaDTO[]>({ queryKey: ['mis-tareas'], queryFn: () => getMisTareas() });
  const vencen = useMemo(() => tareasQueVencenEstaSemana(data ?? []), [data]);

  if (isLoading) return <Skeleton className="h-40 rounded-card" aria-label="Cargando tareas de la semana" />;
  if (isError) return null;

  return (
    <section aria-labelledby="vencen-semana-titulo" className="card-base space-y-stack">
      <div className="flex items-center justify-between gap-tight">
        <h4 id="vencen-semana-titulo" className="type-subtitle text-text-primary">
          Vencen esta semana
        </h4>
        <span className="pill pill-neutral" aria-label={`${vencen.length} tareas`}>
          {vencen.length}
        </span>
      </div>
      {vencen.length === 0 ? (
        <div className="space-y-tight">
          <p className="type-body text-text-secondary">No tienes tareas por vencer hasta el domingo.</p>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/mis-tareas">Ver mis tareas</Link>
          </Button>
        </div>
      ) : (
        <>
          <ul className="space-y-tight">
            {vencen.slice(0, MAX_VISIBLES).map((t) => (
              <li key={t.idTarea}>
                <Link
                  href={`/dashboard/projects/${t.proyecto.idProyecto}/kanban/tasks/${t.idTarea}`}
                  className="flex items-center gap-tight rounded-control bg-surface-container p-tight transition-colors hover:bg-surface-container-high"
                >
                  <CalendarClock className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="type-body block truncate font-medium text-text-primary">{t.tituloTarea}</span>
                    <span className="type-meta block truncate">{t.proyecto.tituloProyecto}</span>
                  </span>
                  <span className="type-meta shrink-0 tabular-nums">{diaCorto(t.fechaLimite!)}</span>
                </Link>
              </li>
            ))}
          </ul>
          {vencen.length > MAX_VISIBLES && (
            <Link href="/dashboard/mis-tareas" className="type-body block text-center font-medium text-primary hover:underline">
              Ver las {vencen.length} tareas
            </Link>
          )}
        </>
      )}
    </section>
  );
}
