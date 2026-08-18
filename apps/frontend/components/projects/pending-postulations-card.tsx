'use client';

import Link from 'next/link';
import { ChevronRight, UserRoundPlus } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useProjectPendingPostulations } from '@/hooks/use-project-pending-postulations';

/**
 * F13.1 — entry point de navegación desde Miembros hacia la vista dedicada.
 * La resolución/listado completo vive en `/miembros/postulaciones`; esta card
 * solo conserva el contador independiente de F13.
 */
export function PendingPostulationsCard({ idProyecto }: { idProyecto: number }) {
  const { postulaciones, isLoading, isError } = useProjectPendingPostulations(idProyecto);
  const contador = isError ? 'Error' : isLoading ? null : String(postulaciones.length);

  return (
    <Link
      href={`/dashboard/proyectos/${idProyecto}/miembros/postulaciones`}
      aria-label="Ver postulaciones pendientes"
      className="flex w-full items-center gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest px-5 py-4 text-left transition-colors hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:w-auto"
    >
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-container">
        <UserRoundPlus aria-hidden="true" className="h-5 w-5 text-on-primary-container" />
      </div>
      <div className="min-w-0">
        <p className="whitespace-nowrap text-xs font-bold uppercase tracking-wide text-tertiary">
          Postulaciones pendientes
        </p>
        {contador === null ? (
          <Skeleton className="mt-1 h-7 w-8 rounded bg-surface-container-high" />
        ) : (
          <p className={`font-headline text-2xl font-extrabold ${isError ? 'text-error' : 'text-on-surface'}`}>
            {contador}
          </p>
        )}
      </div>
      <ChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-tertiary" />
    </Link>
  );
}
