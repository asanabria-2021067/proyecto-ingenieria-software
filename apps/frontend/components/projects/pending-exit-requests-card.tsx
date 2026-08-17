'use client';

import Link from 'next/link';
import { ChevronRight, UserRoundX } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useProjectPendingExitRequests } from '@/hooks/use-exit-request';

/**
 * F14.2 — entry point de navegación desde Miembros hacia la vista dedicada de
 * solicitudes de salida, mismo patrón que `PendingPostulationsCard` (F13.1).
 * La resolución completa vive en `/miembros/solicitudes-salida`; esta card
 * solo conserva el contador independiente de F14.1.
 */
export function PendingExitRequestsCard({ idProyecto }: { idProyecto: number }) {
  const { requests, isLoading, isError } = useProjectPendingExitRequests(idProyecto);
  const contador = isError ? 'Error' : isLoading ? null : String(requests.length);

  return (
    <Link
      href={`/dashboard/proyectos/${idProyecto}/miembros/solicitudes-salida`}
      aria-label="Ver solicitudes de salida pendientes"
      className="flex w-full items-center gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest px-5 py-4 text-left transition-colors hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:w-auto"
    >
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-container">
        <UserRoundX aria-hidden="true" className="h-5 w-5 text-on-primary-container" />
      </div>
      <div className="min-w-0">
        <p className="whitespace-nowrap text-xs font-bold uppercase tracking-wide text-tertiary">
          Solicitudes de salida
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
