'use client';

import Link from 'next/link';
import { AlertTriangle, CheckCircle2, CircleHelp, Gauge } from 'lucide-react';
import { useSeguimientoProyecto } from '@/hooks/use-seguimiento';
import { Button } from '@/components/ui/button';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { Tag, type TagTone } from '@/components/ui/tag';
import { fecha } from '@/lib/utils';
import type { ColorSemaforo, SeguimientoProyectoDTO } from '@/lib/services/seguimiento';

const SEMAFORO: Record<ColorSemaforo, { tone: TagTone; etiqueta: string; dot: string }> = {
  VERDE: { tone: 'green', etiqueta: 'En buen camino', dot: 'bg-green-600 dark:bg-green-400' },
  AMARILLO: { tone: 'amber', etiqueta: 'Requiere atención', dot: 'bg-amber-500 dark:bg-amber-400' },
  ROJO: { tone: 'red', etiqueta: 'En riesgo', dot: 'bg-red-600 dark:bg-red-400' },
};

/** Contenido de la tarjeta, separado del hook para poder probarlo sin red. */
export function ProjectHealthContent({ seguimiento, idProyecto, esLider }: { seguimiento: SeguimientoProyectoDTO; idProyecto: number; esLider: boolean }) {
  const { semaforo, hitosAtrasados } = seguimiento;
  const estilo = SEMAFORO[semaforo.color];
  const hitosHref = `/dashboard/projects/${idProyecto}/kanban?tab=hitos`;

  return (
    <>
      <div className="mt-tight flex flex-wrap items-center gap-tight">
        <Tag tone={estilo.tone} data-testid="semaforo-estado" aria-label={`Semáforo del proyecto: ${estilo.etiqueta}`}>
          <span aria-hidden="true" className={`size-2 rounded-full ${estilo.dot}`} />
          {estilo.etiqueta}
        </Tag>
        {semaforo.motivos.length === 0 && (
          <span className="type-body text-text-secondary">Sin hitos atrasados ni tareas vencidas.</span>
        )}
      </div>

      {semaforo.motivos.length > 0 && (
        <ul className="mt-tight list-disc space-y-1 pl-5 type-body text-text-secondary">
          {semaforo.motivos.map((motivo) => (
            <li key={motivo}>{motivo}</li>
          ))}
        </ul>
      )}

      {hitosAtrasados.length > 0 ? (
        <div role="alert" className="mt-stack rounded-control border border-error/30 bg-error-container/20 p-stack">
          <p className="flex items-center gap-tight text-sm font-semibold text-error">
            <AlertTriangle className="size-4" aria-hidden="true" />
            {esLider
              ? hitosAtrasados.length === 1
                ? 'Tienes un hito atrasado'
                : `Tienes ${hitosAtrasados.length} hitos atrasados`
              : hitosAtrasados.length === 1
                ? 'Hay un hito atrasado'
                : `Hay ${hitosAtrasados.length} hitos atrasados`}
          </p>
          <ul className="mt-tight space-y-1">
            {hitosAtrasados.map((hito) => (
              <li key={hito.idHito} className="flex flex-wrap items-center justify-between gap-tight type-body">
                <span className="min-w-0 font-medium text-text-primary">{hito.tituloHito}</span>
                <span className="text-text-secondary">
                  Venció el {fecha(hito.fechaLimite)} ({hito.diasAtraso} {hito.diasAtraso === 1 ? 'día' : 'días'} de atraso)
                </span>
              </li>
            ))}
          </ul>
          <Button asChild variant="outline" size="sm" className="mt-tight">
            <Link href={hitosHref}>Ver hitos</Link>
          </Button>
        </div>
      ) : (
        <p className="mt-stack flex items-center gap-tight type-body text-text-secondary">
          <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
          Ningún hito está atrasado.
          <Link href={hitosHref} className="font-semibold text-primary hover:underline">
            Ver hitos
          </Link>
        </p>
      )}

      <details className="mt-stack group">
        <summary className="inline-flex cursor-pointer items-center gap-tight text-sm font-semibold text-primary">
          <CircleHelp className="size-4" aria-hidden="true" />
          ¿Cómo se calcula el semáforo?
        </summary>
        <dl className="mt-tight space-y-2 type-body text-text-secondary">
          {(['VERDE', 'AMARILLO', 'ROJO'] as const).map((color) => (
            <div key={color} className="flex gap-tight">
              <dt className="flex shrink-0 items-center gap-1.5 font-semibold text-text-primary">
                <span aria-hidden="true" className={`size-2 rounded-full ${SEMAFORO[color].dot}`} />
                {SEMAFORO[color].etiqueta}
              </dt>
              <dd>{semaforo.ayuda[color]}</dd>
            </div>
          ))}
        </dl>
      </details>
    </>
  );
}

/**
 * MEJ-54/55: salud del proyecto para su equipo (semáforo + hitos atrasados). Quien no es del
 * equipo recibe 403 del backend y la tarjeta simplemente no aparece.
 */
export function ProjectHealthCard({ idProyecto, esLider = false }: { idProyecto: number; esLider?: boolean }) {
  const { data, isLoading, isError, refetch } = useSeguimientoProyecto(idProyecto);

  if (isLoading) {
    return (
      <SkeletonRegion label="Cargando la salud del proyecto" className="card-base">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-tight h-6 w-32 rounded-tag" />
        <Skeleton className="mt-stack h-16 w-full" />
      </SkeletonRegion>
    );
  }
  if (isError || !data) {
    return null;
  }

  return (
    <section aria-labelledby="salud-proyecto-titulo" className="card-base" data-slot="project-health-card">
      <div className="flex items-center justify-between gap-tight">
        <h2 id="salud-proyecto-titulo" className="type-subtitle flex items-center gap-tight">
          <Gauge className="size-4 text-text-secondary" aria-hidden="true" />
          Salud del proyecto
        </h2>
        <button
          type="button"
          onClick={() => void refetch()}
          className="text-xs font-semibold text-text-secondary hover:text-primary"
        >
          Actualizar
        </button>
      </div>
      <ProjectHealthContent seguimiento={data} idProyecto={idProyecto} esLider={esLider} />
    </section>
  );
}
