import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * C127 (06 v2 §22): evaluador ÚNICO de preparación para cerrar un proyecto.
 *
 * Existe uno solo porque la consulta que la interfaz muestra y el assert que
 * bloquea la escritura deben responder exactamente lo mismo: si divergieran,
 * el líder vería «todo listo» y la operación fallaría por una regla que nadie
 * le enseñó. Lo que cambia entre fases son las PRECONDICIONES de estado, no
 * las reglas de integridad.
 *
 * Una consulta nunca cambia nada: leer la preparación es leer.
 *
 * Esqueleto en C127: los dieciséis códigos llegan con su contrato.
 */

export type ClosurePhase = 'REQUEST' | 'RESUBMIT' | 'APPROVE';

/** §22: catálogo cerrado de bloqueos. Ninguno se inventa en tiempo de ejecución. */
export const CLOSURE_BLOCKER_CODES = [
  'PROYECTO_ESTADO_INVALIDO',
  'SIN_SPRINTS',
  'SPRINTS_NO_CERRADOS',
  'TRAMOS_ABIERTOS',
  'TRAMOS_SIN_PARTICIPACION',
  'LEGACY_SIN_CONCILIAR',
  'HORAS_SIN_CONSOLIDAR',
  'HORAS_INCONSISTENTES',
  'TAREAS_SIN_TERMINAR',
  'TAREAS_SIN_TRAZABILIDAD',
  'SALIDAS_ABIERTAS',
  'APELACION_PENDIENTE',
  'REVISION_INVALIDA',
  'INFORME_INVALIDO',
  'EVIDENCIAS_INVALIDAS',
  'INFORME_DESACTUALIZADO',
] as const;
export type ClosureBlockerCode = (typeof CLOSURE_BLOCKER_CODES)[number];

/** La única advertencia: informa, no bloquea. */
export const CLOSURE_WARNING_PENDING_APPLICATIONS = 'POSTULACIONES_PENDIENTES';

export interface ClosureBlocker {
  code: ClosureBlockerCode;
  message: string;
  /** Identificadores concretos del problema: diagnóstico, no una recomendación. */
  ids: number[];
  cantidad: number;
}

export interface ClosureWarning {
  code: typeof CLOSURE_WARNING_PENDING_APPLICATIONS;
  message: string;
  ids: number[];
  cantidad: number;
}

export interface CloseReadinessSummary {
  projectId: number;
  revisionId: number | null;
  phase: ClosurePhase;
  canSubmit: boolean;
  blockers: ClosureBlocker[];
  warnings: ClosureWarning[];
  /** Huella del informe automático vinculado, cuando existe. */
  executionFingerprint: string | null;
}

export interface EvaluateReadinessInput {
  phase: ClosurePhase;
  revisionId?: number | null;
}

@Injectable()
export class ProjectCloseReadinessService {
  constructor(protected readonly prisma: PrismaService) {}

  /** Evaluación completa: devuelve TODOS los bloqueos, nunca solo el primero. */
  evaluate(
    _tx: Prisma.TransactionClient | undefined,
    _projectId: number,
    _input: EvaluateReadinessInput,
  ): Promise<CloseReadinessSummary> {
    return Promise.reject(new Error('evaluate todavía no está implementado'));
  }

  /** Mismo evaluador, usado como assert antes de una escritura. */
  assertReady(
    _tx: Prisma.TransactionClient,
    _projectId: number,
    _input: EvaluateReadinessInput,
  ): Promise<CloseReadinessSummary> {
    return Promise.reject(new Error('assertReady todavía no está implementado'));
  }
}
