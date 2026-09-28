'use client';

import { useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import {
  getApiErrorMessage,
  getApiErrorStatus,
  MENSAJE_ERROR_GENERICO,
} from '@/components/projects/api-error';

/**
 * T-221 — límite de error del dashboard: una excepción no contemplada en un
 * render nunca deja la pantalla en blanco ni muestra el error técnico. El
 * error original se conserva en consola para diagnóstico.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[dashboard] Error no controlado al renderizar', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Empty tone="danger" role="alert">
        <EmptyMedia variant="icon">
          <AlertCircle aria-hidden="true" className="h-7 w-7" />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>
            {/* Un error de render (sin status) nunca es para el usuario. */}
            {getApiErrorStatus(error) ? getApiErrorMessage(error, 'general') : MENSAJE_ERROR_GENERICO}
          </EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition-all hover:bg-primary/90"
          >
            Reintentar
          </button>
        </EmptyContent>
      </Empty>
    </div>
  );
}
