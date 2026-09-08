'use client';

import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ReadOnlyProjectBannerProps {
  /** Fecha de cierre ISO (`fechaActualizacion` o la fecha del histórico), si se conoce. */
  fechaCierre?: string | null;
  /** Acción opcional a la derecha (p. ej. «Ver informe oficial» en VIEW-02). */
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  className?: string;
}

function formatearFecha(iso: string): string | null {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;
  return fecha.toLocaleDateString('es-GT', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * VIEW-01 (F006), compartido con VIEW-02/VIEW-09/VIEW-10 — banner de proyecto
 * `CERRADO`: la superficie es histórica y de solo lectura. No ofrece ninguna
 * escritura; la única acción posible es de lectura (ver el informe oficial).
 */
export function ReadOnlyProjectBanner({
  fechaCierre,
  actionLabel,
  onAction,
  actionDisabled = false,
  className = '',
}: ReadOnlyProjectBannerProps) {
  const fecha = fechaCierre ? formatearFecha(fechaCierre) : null;
  return (
    <div
      role="status"
      aria-label="Proyecto cerrado: vista histórica de solo lectura"
      className={`flex flex-col gap-3 rounded-xl border border-outline-variant/40 bg-surface-container-low px-4 py-3 text-sm text-on-surface sm:flex-row sm:items-center ${className}`}
    >
      <Lock className="size-5 shrink-0 text-primary" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Proyecto cerrado{fecha ? ` el ${fecha}` : ''}.</span> Esta es la vista
        histórica de solo lectura.
      </p>
      {actionLabel && onAction && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAction}
          disabled={actionDisabled}
          className="h-9 rounded-md border-primary/40 text-xs font-semibold text-primary hover:bg-primary/5 hover:text-primary"
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
