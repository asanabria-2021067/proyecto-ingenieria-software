'use client';

import { useId, useState } from 'react';
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
  /**
   * A quién le habla la nota del progreso. `lider` (por defecto) prepara y
   * envía la solicitud; `revisor` (administrador) solo revisa: no se le dan
   * instrucciones de completar ni de enviar.
   */
  audiencia?: 'lider' | 'revisor';
  /** Enlace profundo opcional por blocker (código + ids). */
  onNavigateToBlocker?: (blocker: ClosureBlocker) => void;
}

function notaProgreso(audiencia: 'lider' | 'revisor', listo: boolean): string {
  if (audiencia === 'revisor') {
    return listo
      ? 'Todas las comprobaciones están superadas.'
      : 'La entrega tiene comprobaciones pendientes; revísalas antes de emitir el veredicto.';
  }
  return listo
    ? 'Todas las comprobaciones están superadas: puedes enviar la solicitud de cierre.'
    : 'Completa todos los elementos para habilitar el envío de la solicitud de cierre.';
}

/**
 * VIEW-13 / VIEW-14 (F005) — «Lista de verificación» del cierre: progreso
 * «N de 16» y los 6 grupos de `10` §5.3. Cada grupo se expande para mostrar
 * el `message` del backend (nunca copy inventado) y los `ids` del
 * diagnóstico. Sin acciones de resolución in situ (06 v2 §22).
 *
 * Solo lo incompleto se destaca (ámbar): los grupos superados quedan neutros.
 * Con pendientes, el progreso ofrece un acceso directo a cada categoría.
 */
export function ClosureReadinessPanel({
  summary,
  isLoading = false,
  title = 'Lista de verificación para el cierre',
  description = 'Revisa y completa todos los elementos requeridos.',
  showProgress = true,
  audiencia = 'lider',
  onNavigateToBlocker,
}: ClosureReadinessPanelProps) {
  const baseId = useId();
  const [abiertos, setAbiertos] = useState<string[]>([]);

  if (isLoading || !summary) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Cargando verificación del cierre">
        {showProgress && <Skeleton className="h-24 w-full rounded-card" />}
        <Skeleton className="h-56 w-full rounded-card" />
      </div>
    );
  }

  const grupos = groupClosureBlockers(summary.blockers);
  const superadas = countPassedChecks(summary.blockers);
  const pendientes = TOTAL_CLOSURE_CHECKS - superadas;
  const porcentaje = Math.round((superadas / TOTAL_CLOSURE_CHECKS) * 100);
  const gruposPendientes = grupos.filter((grupo) => !grupo.ok);
  const triggerId = (key: ClosureGroupKey) => `${baseId}-grupo-${key}`;

  /** Abre la categoría y lleva el foco a su cabecera. */
  const irAGrupo = (key: ClosureGroupKey) => {
    setAbiertos((prev) => (prev.includes(key) ? prev : [...prev, key]));
    const cabecera = document.getElementById(triggerId(key));
    cabecera?.scrollIntoView?.({ block: 'center' });
    cabecera?.focus({ preventScroll: true });
  };

  return (
    <div className="space-y-4">
      {showProgress && (
        <section className="card-base" aria-labelledby="closure-progress-title">
          <div className="flex flex-wrap items-baseline justify-between gap-inline">
            <h2 id="closure-progress-title" className="type-section text-text-primary">
              Progreso
            </h2>
            <span className="type-meta font-semibold tabular-nums">{porcentaje}%</span>
          </div>
          <p className="type-body mt-micro text-text-primary">
            <span className="font-semibold tabular-nums">
              {superadas} de {TOTAL_CLOSURE_CHECKS}
            </span>{' '}
            comprobaciones superadas
          </p>
          <Progress
            value={porcentaje}
            aria-label={`${superadas} de ${TOTAL_CLOSURE_CHECKS} comprobaciones superadas`}
            className="mt-tight h-2"
          />
          {pendientes > 0 && (
            <div className="mt-inline flex flex-wrap items-center gap-x-inline gap-y-tight" data-slot="closure-pendientes">
              <span className="pill pill-sm pill-amber tabular-nums">
                {pendientes === 1 ? '1 pendiente' : `${pendientes} pendientes`}
              </span>
              <span className="type-meta">Ir a:</span>
              {gruposPendientes.map((grupo) => (
                <button
                  key={grupo.definition.key}
                  type="button"
                  onClick={() => irAGrupo(grupo.definition.key)}
                  aria-label={`Ver pendientes de ${grupo.definition.titulo}`}
                  className="type-meta rounded-control font-semibold text-text-primary underline underline-offset-2 outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  {grupo.definition.titulo}
                </button>
              ))}
            </div>
          )}
          <p className="type-meta mt-tight">{notaProgreso(audiencia, summary.canSubmit)}</p>
        </section>
      )}

      <section className="card-base" aria-labelledby="closure-checklist-title">
        <h2 id="closure-checklist-title" className="type-section text-text-primary">
          {title}
        </h2>
        <p className="type-meta mt-micro">{description}</p>

        <Accordion
          type="multiple"
          value={abiertos}
          onValueChange={setAbiertos}
          className="mt-stack grid grid-cols-1 items-start gap-tight lg:grid-cols-2"
        >
          {grupos.map((grupo) => (
            <AccordionItem
              key={grupo.definition.key}
              value={grupo.definition.key}
              className="rounded-control border border-outline-variant/50 px-3 last:border-b"
            >
              <AccordionTrigger
                id={triggerId(grupo.definition.key)}
                className="items-center gap-3 py-2 hover:no-underline"
                aria-label={`${grupo.definition.titulo}: ${grupo.superadas} de ${grupo.total}`}
              >
                <span
                  aria-hidden="true"
                  className={`size-2 shrink-0 rounded-full ${grupo.ok ? 'bg-primary' : 'bg-attention'}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="type-body block font-semibold text-text-primary">{grupo.definition.titulo}</span>
                  <span className="type-meta block">
                    {grupo.ok ? grupo.definition.descripcionOk : grupo.definition.descripcionPendiente}
                  </span>
                </span>
                {grupo.ok ? (
                  <span className="type-meta shrink-0 tabular-nums">
                    {grupo.superadas} de {grupo.total}
                  </span>
                ) : (
                  <span className="pill pill-sm pill-amber shrink-0 tabular-nums">
                    {grupo.superadas} de {grupo.total}
                  </span>
                )}
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                {grupo.ok ? (
                  <p className="type-meta">Sin pendientes en este grupo.</p>
                ) : (
                  <ul className="space-y-tight" aria-label={`Pendientes de ${grupo.definition.titulo}`}>
                    {grupo.blockers.map((blocker) => (
                      <li key={blocker.code} className="rounded-control bg-surface-container-low px-3 py-2">
                        <p className="type-body font-medium text-text-primary">{blocker.message}</p>
                        <p className="type-meta mt-micro">
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
                              <span className="type-meta">+{blocker.ids.length - 12} más</span>
                            )}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </div>
  );
}
