'use client';

import { AlertCircle, CheckCircle2, ChevronRight, Clock } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CLOSURE_BLOCKER_CODES,
  type CloseReadinessSummary,
  type ClosureBlocker,
  type ClosureBlockerCode,
} from '@/lib/types/closure';

/** Total de comprobaciones del catálogo cerrado (`CLOSURE_BLOCKER_CODES`): 16. */
export const TOTAL_CLOSURE_CHECKS = CLOSURE_BLOCKER_CODES.length;

export type ClosureGroupKey = 'SPRINTS' | 'HORAS' | 'TAREAS' | 'EQUIPO' | 'DOCUMENTOS' | 'ESTADO';

export interface ClosureGroupDefinition {
  key: ClosureGroupKey;
  titulo: string;
  descripcionOk: string;
  descripcionPendiente: string;
  codes: readonly ClosureBlockerCode[];
}

/** Los 6 grupos visuales de `10` §5.3. Cada uno de los 16 códigos pertenece a exactamente un grupo. */
export const CLOSURE_BLOCKER_GROUPS: readonly ClosureGroupDefinition[] = [
  {
    key: 'SPRINTS',
    titulo: 'Sprints',
    descripcionOk: 'Todos los sprints están cerrados.',
    descripcionPendiente: 'Hay sprints pendientes de cerrar.',
    codes: ['SIN_SPRINTS', 'SPRINTS_NO_CERRADOS'],
  },
  {
    key: 'HORAS',
    titulo: 'Horas',
    descripcionOk: 'Horas registradas y acreditadas verificadas.',
    descripcionPendiente: 'Hay horas sin consolidar o inconsistentes.',
    codes: [
      'TRAMOS_ABIERTOS',
      'TRAMOS_SIN_PARTICIPACION',
      'LEGACY_SIN_CONCILIAR',
      'HORAS_SIN_CONSOLIDAR',
      'HORAS_INCONSISTENTES',
    ],
  },
  {
    key: 'TAREAS',
    titulo: 'Tareas',
    descripcionOk: 'Todas las tareas están terminadas y trazables.',
    descripcionPendiente: 'Revisa las tareas pendientes o sin evidencia.',
    codes: ['TAREAS_SIN_TERMINAR', 'TAREAS_SIN_TRAZABILIDAD'],
  },
  {
    key: 'EQUIPO',
    titulo: 'Equipo',
    descripcionOk: 'Integrantes y liderazgo validados.',
    descripcionPendiente: 'Hay salidas o apelaciones sin resolver.',
    codes: ['SALIDAS_ABIERTAS', 'APELACION_PENDIENTE'],
  },
  {
    key: 'DOCUMENTOS',
    titulo: 'Documentos',
    descripcionOk: 'Documentación completa y vigente.',
    descripcionPendiente: 'Completa los documentos requeridos.',
    codes: ['REVISION_INVALIDA', 'INFORME_INVALIDO', 'EVIDENCIAS_INVALIDAS', 'INFORME_DESACTUALIZADO'],
  },
  {
    key: 'ESTADO',
    titulo: 'Estado',
    descripcionOk: 'El proyecto cumple con los requisitos de cierre.',
    descripcionPendiente: 'El estado del proyecto no permite cerrar.',
    codes: ['PROYECTO_ESTADO_INVALIDO'],
  },
];

export interface ClosureGroupResult {
  definition: ClosureGroupDefinition;
  blockers: ClosureBlocker[];
  superadas: number;
  total: number;
  ok: boolean;
}

/** Agrupa los blockers del backend en los 6 grupos; devuelve «n de m» por grupo. */
export function groupClosureBlockers(blockers: ClosureBlocker[]): ClosureGroupResult[] {
  return CLOSURE_BLOCKER_GROUPS.map((definition) => {
    const propios = blockers.filter((b) => (definition.codes as readonly string[]).includes(b.code));
    const codigosBloqueados = new Set(propios.map((b) => b.code));
    const total = definition.codes.length;
    const superadas = total - codigosBloqueados.size;
    return { definition, blockers: propios, superadas, total, ok: propios.length === 0 };
  });
}

/** Comprobaciones superadas en total: 16 − códigos distintos bloqueados. */
export function countPassedChecks(blockers: ClosureBlocker[]): number {
  const distintos = new Set(blockers.map((b) => b.code).filter((c) => (CLOSURE_BLOCKER_CODES as readonly string[]).includes(c)));
  return TOTAL_CLOSURE_CHECKS - distintos.size;
}

export interface ClosureReadinessPanelProps {
  summary: CloseReadinessSummary | null | undefined;
  isLoading?: boolean;
  title?: string;
  description?: string;
  /** Oculta la card de progreso (VIEW-14 la muestra en otro sitio). */
  showProgress?: boolean;
  /** Enlace profundo opcional por blocker (código + ids). */
  onNavigateToBlocker?: (blocker: ClosureBlocker) => void;
}

const CARD = 'rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-sm';

function GroupIcon({ ok, parcial }: { ok: boolean; parcial: boolean }) {
  if (ok) {
    return (
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary" aria-hidden="true">
        <CheckCircle2 className="size-5" />
      </span>
    );
  }
  if (parcial) {
    return (
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-400/20 text-amber-700 dark:text-amber-300" aria-hidden="true">
        <Clock className="size-5" />
      </span>
    );
  }
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-error/15 text-error" aria-hidden="true">
      <AlertCircle className="size-5" />
    </span>
  );
}

/**
 * VIEW-13 / VIEW-14 (F005) — «Lista de verificación» del cierre: progreso
 * «N de 16» y los 6 grupos de `10` §5.3. Cada grupo se expande para mostrar
 * el `message` del backend (nunca copy inventado) y los `ids` del
 * diagnóstico. Sin acciones de resolución in situ (06 v2 §22).
 */
export function ClosureReadinessPanel({
  summary,
  isLoading = false,
  title = 'Lista de verificación para el cierre',
  description = 'Revisa y completa todos los elementos requeridos.',
  showProgress = true,
  onNavigateToBlocker,
}: ClosureReadinessPanelProps) {
  if (isLoading || !summary) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Cargando verificación del cierre">
        {showProgress && <Skeleton className="h-24 w-full rounded-xl" />}
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  const grupos = groupClosureBlockers(summary.blockers);
  const superadas = countPassedChecks(summary.blockers);
  const porcentaje = Math.round((superadas / TOTAL_CLOSURE_CHECKS) * 100);

  return (
    <div className="space-y-4">
      {showProgress && (
        <section className={CARD} aria-labelledby="closure-progress-title">
          <h2 id="closure-progress-title" className="text-sm font-bold text-on-surface">
            Progreso
          </h2>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
            <p className="text-lg text-on-surface">
              <span className="font-bold">
                {superadas} de {TOTAL_CLOSURE_CHECKS}
              </span>{' '}
              comprobaciones superadas
            </p>
            <span className="text-sm font-semibold text-on-surface-variant">{porcentaje}%</span>
          </div>
          <Progress
            value={porcentaje}
            aria-label={`${superadas} de ${TOTAL_CLOSURE_CHECKS} comprobaciones superadas`}
            className="mt-2 h-2"
          />
          <p className="mt-2 text-xs text-tertiary">
            {summary.canSubmit
              ? 'Todas las comprobaciones están superadas: puedes enviar la solicitud de cierre.'
              : 'Completa todos los elementos para habilitar el envío de la solicitud de cierre.'}
          </p>
        </section>
      )}

      <section className={CARD} aria-labelledby="closure-checklist-title">
        <h2 id="closure-checklist-title" className="text-sm font-bold text-on-surface">
          {title}
        </h2>
        <p className="mt-0.5 text-xs text-tertiary">{description}</p>

        <Accordion type="multiple" className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {grupos.map((grupo) => {
            const parcial = !grupo.ok && grupo.superadas > 0;
            const cantidadTotal = grupo.blockers.reduce((acc, b) => acc + b.cantidad, 0);
            return (
              <AccordionItem
                key={grupo.definition.key}
                value={grupo.definition.key}
                className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 last:border-b"
              >
                <AccordionTrigger
                  className="py-3 hover:no-underline [&>svg]:hidden"
                  aria-label={`${grupo.definition.titulo}: ${grupo.superadas} de ${grupo.total}`}
                >
                  <div className="flex w-full items-center gap-3">
                    <GroupIcon ok={grupo.ok} parcial={parcial} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-black uppercase tracking-widest text-on-surface">
                        {grupo.definition.titulo}
                      </p>
                      <p className="text-xs text-tertiary">
                        {grupo.ok ? grupo.definition.descripcionOk : grupo.definition.descripcionPendiente}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-sm font-bold ${grupo.ok ? 'text-primary' : 'text-on-surface'}`}
                    >
                      {grupo.superadas} de {grupo.total}
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-tertiary" aria-hidden="true" />
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-3">
                  {grupo.ok ? (
                    <p className="text-xs text-tertiary">Sin pendientes en este grupo.</p>
                  ) : (
                    <ul className="space-y-2" aria-label={`Pendientes de ${grupo.definition.titulo}`}>
                      {grupo.blockers.map((blocker) => (
                        <li
                          key={blocker.code}
                          className="rounded-lg border border-error/20 bg-error/5 px-3 py-2 text-xs text-on-surface"
                        >
                          <p className="font-semibold">{blocker.message}</p>
                          <p className="mt-0.5 text-[11px] text-tertiary">
                            <span className="font-mono">{blocker.code}</span>
                            {blocker.cantidad > 0 && ` · ${blocker.cantidad} ${blocker.cantidad === 1 ? 'elemento' : 'elementos'}`}
                          </p>
                          {blocker.ids.length > 0 && (
                            <p className="mt-1 flex flex-wrap gap-1">
                              {blocker.ids.slice(0, 12).map((id) =>
                                onNavigateToBlocker ? (
                                  <button
                                    key={id}
                                    type="button"
                                    onClick={() => onNavigateToBlocker({ ...blocker, ids: [id] })}
                                    className="rounded bg-surface-container-high px-1.5 py-0.5 font-mono text-[11px] text-on-surface-variant underline-offset-2 hover:underline"
                                  >
                                    #{id}
                                  </button>
                                ) : (
                                  <span
                                    key={id}
                                    className="rounded bg-surface-container-high px-1.5 py-0.5 font-mono text-[11px] text-on-surface-variant"
                                  >
                                    #{id}
                                  </span>
                                ),
                              )}
                              {blocker.ids.length > 12 && (
                                <span className="text-[11px] text-tertiary">+{blocker.ids.length - 12} más</span>
                              )}
                            </p>
                          )}
                        </li>
                      ))}
                      {cantidadTotal === 0 && null}
                    </ul>
                  )}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </section>
    </div>
  );
}
