'use client';

import Link from 'next/link';
import { Check, Circle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useCerrarPrimerosPasos, usePrimerosPasos } from '@/hooks/use-ayuda';
import type { ClavePaso } from '@/lib/services/ayuda';

const PASOS: Record<ClavePaso, { texto: string; href: string }> = {
  perfil: { texto: 'Completa tu perfil', href: '/dashboard/perfil/editar' },
  horas: { texto: 'Declara las horas del semestre', href: '/dashboard/mis-horas' },
  postulacion: { texto: 'Postúlate a un proyecto', href: '/dashboard/proyectos' },
  organizacion: { texto: 'Únete a una organización', href: '/dashboard/organizaciones' },
  mensaje: { texto: 'Manda tu primer mensaje', href: '/dashboard/mensajes' },
};

/** MEJ-88: tarjeta «Primeros pasos»; el backend dice si sigue visible (no cerrada y sin completar). */
export function PrimerosPasos() {
  const { data } = usePrimerosPasos();
  const cerrar = useCerrarPrimerosPasos();
  if (!data?.visible) return null;

  return (
    <section aria-labelledby="primeros-pasos-titulo" className="card-base mb-section space-y-stack">
      <div className="flex items-start justify-between gap-tight">
        <div>
          <h2 id="primeros-pasos-titulo" className="type-subtitle text-text-primary">
            Primeros pasos
          </h2>
          <p className="type-meta">
            {data.completados} de {data.total} completados
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Cerrar Primeros pasos"
          disabled={cerrar.isPending}
          onClick={() => cerrar.mutate()}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
      <Progress
        value={Math.round((data.completados / data.total) * 100)}
        aria-label="Avance de Primeros pasos"
        className="h-1.5 max-w-sm"
      />
      <ul className="grid gap-tight sm:grid-cols-2 lg:grid-cols-3">
        {data.pasos.map(({ clave, completado }) => (
          <li key={clave}>
            <Link
              href={PASOS[clave].href}
              className="flex items-center gap-tight rounded-control bg-surface-container p-tight transition-colors hover:bg-surface-container-high"
            >
              {completado ? (
                <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
              ) : (
                <Circle className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
              )}
              <span className={`type-body ${completado ? 'text-text-secondary line-through' : 'font-medium text-text-primary'}`}>
                {PASOS[clave].texto}
              </span>
              {completado && <span className="sr-only">(completado)</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
