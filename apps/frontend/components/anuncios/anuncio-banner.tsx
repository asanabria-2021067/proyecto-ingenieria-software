'use client';

import { AlertTriangle, Info, Siren, X, type LucideIcon } from 'lucide-react';
import { useAnunciosVigentes, useCerrarAnuncio } from '@/hooks/use-anuncios';
import type { NivelAnuncio } from '@/lib/services/anuncios';

/** El nivel se comunica con icono y texto, no solo con color. */
export const NIVEL_ANUNCIO: Record<
  NivelAnuncio,
  { etiqueta: string; icono: LucideIcon; role: 'alert' | 'status'; clases: string }
> = {
  INFO: {
    etiqueta: 'Información',
    icono: Info,
    role: 'status',
    clases: 'bg-surface-container-high text-text-primary',
  },
  ADVERTENCIA: {
    etiqueta: 'Advertencia',
    icono: AlertTriangle,
    role: 'alert',
    clases: 'bg-status-warning text-on-status-warning',
  },
  URGENTE: {
    etiqueta: 'Urgente',
    icono: Siren,
    role: 'alert',
    clases: 'bg-status-error text-on-status-error',
  },
};

/** T-351: banner con el anuncio vigente más importante; cerrarlo se guarda por usuario. */
export function AnuncioBanner() {
  const { data } = useAnunciosVigentes();
  const cerrar = useCerrarAnuncio();
  const anuncio = data?.[0];
  if (!anuncio) return null;

  const { etiqueta, icono: Icono, role, clases } = NIVEL_ANUNCIO[anuncio.nivel];
  return (
    <div
      role={role}
      data-testid="anuncio-banner"
      className={`flex shrink-0 items-start gap-inline border-b border-outline-variant px-stack py-tight md:px-section ${clases}`}
    >
      <Icono className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 type-body">
        <span className="font-semibold">{etiqueta}: </span>
        <span className="font-semibold">{anuncio.titulo}.</span> {anuncio.mensaje}
      </p>
      <button
        type="button"
        aria-label={`Cerrar anuncio: ${anuncio.titulo}`}
        disabled={cerrar.isPending}
        onClick={() => cerrar.mutate(anuncio.idAnuncio)}
        className="motion-icon flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 dark:hover:bg-white/10"
      >
        <X className="size-5" aria-hidden="true" />
      </button>
    </div>
  );
}
