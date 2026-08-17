import { z } from 'zod';
import type { SprintClosingSummaryDto } from '@/lib/types/sprints';

/**
 * Una fila editable del formulario de cierre (F5) — una por
 * `ParticipacionProyecto`, nunca por persona ni por tarea. `horasCalculadas`
 * viaja en el propio row (no solo como referencia externa) porque
 * `.superRefine` necesita comparar contra el valor exacto de ESA
 * participación, nunca contra un total person-centric.
 */
export interface SprintClosingParticipationFormValues {
  idParticipacion: number;
  horasCalculadas: number | null;
  horasAprobadas: string;
  justificacionAjuste: string;
}

export interface SprintClosingFormValues {
  participaciones: SprintClosingParticipationFormValues[];
}

const participationRowSchema = z.object({
  idParticipacion: z.number().int().positive(),
  horasCalculadas: z.number().nullable(),
  horasAprobadas: z.string(),
  justificacionAjuste: z.string(),
});

/**
 * Regla central (A7): por cada participación, si `horasAprobadas` (numérico,
 * nunca comparación de strings) difiere de `horasCalculadas`, la
 * justificación es obligatoria — tanto en aumento como en disminución. Una
 * justificación de solo espacios cuenta como vacía. Si `horasCalculadas` es
 * `null` (A5 no calculó nada todavía para esa participación), no hay base de
 * comparación: la fila no exige justificación porque tampoco es editable en
 * la UI (A7 rechazaría cualquier ajuste sobre un cálculo inexistente).
 */
export const sprintClosingFormSchema = z
  .object({ participaciones: z.array(participationRowSchema) })
  .superRefine((values, ctx) => {
    values.participaciones.forEach((row, index) => {
      const horasTexto = row.horasAprobadas.trim();
      if (horasTexto === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['participaciones', index, 'horasAprobadas'],
          message: 'Ingresa las horas aprobadas.',
        });
        return;
      }

      const horasAprobadas = Number(horasTexto);
      if (!Number.isFinite(horasAprobadas)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['participaciones', index, 'horasAprobadas'],
          message: 'Ingresa un número válido.',
        });
        return;
      }

      if (horasAprobadas < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['participaciones', index, 'horasAprobadas'],
          message: 'Las horas aprobadas no pueden ser negativas.',
        });
      }

      const difiere = row.horasCalculadas !== null && horasAprobadas !== row.horasCalculadas;
      if (difiere && row.justificacionAjuste.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['participaciones', index, 'justificacionAjuste'],
          message: 'La justificación es obligatoria cuando las horas aprobadas difieren de las calculadas.',
        });
      }
    });
  });

export type SprintClosingFormSchema = typeof sprintClosingFormSchema;

/**
 * Valores iniciales del formulario a partir del `SprintClosingSummary` real
 * (A8.1). Cuando `horasAprobadas` todavía es `null` (A7 nunca la ajustó),
 * se precarga con `horasCalculadas` — una decisión de UI para no dejar un
 * input numérico vacío, no una normalización del contrato: si el líder
 * envía el formulario sin tocar esa fila, el valor coincide exactamente con
 * lo calculado y no requiere justificación ni genera PATCH (ver
 * `planParticipationAdjustments`).
 */
export function defaultSprintClosingFormValues(summary: SprintClosingSummaryDto): SprintClosingFormValues {
  return {
    participaciones: summary.participantes.flatMap((participante) =>
      participante.participaciones.map((participacion) => ({
        idParticipacion: participacion.idParticipacion,
        horasCalculadas: participacion.horasCalculadas,
        horasAprobadas: String(participacion.horasAprobadas ?? participacion.horasCalculadas ?? 0),
        justificacionAjuste: participacion.justificacionAjuste ?? '',
      })),
    ),
  };
}

export interface ParticipationAdjustment {
  idParticipacion: number;
  horasAprobadas: number;
  justificacionAjuste?: string;
}

interface ParticipationBaseline {
  horasAprobadas: number;
  justificacionAjuste: string;
}

/** Misma normalización que `defaultSprintClosingFormValues`, para comparar contra el mismo punto de partida. */
export function buildParticipationBaselines(
  summary: SprintClosingSummaryDto,
): Map<number, ParticipationBaseline> {
  const baseline = new Map<number, ParticipationBaseline>();
  for (const participante of summary.participantes) {
    for (const participacion of participante.participaciones) {
      baseline.set(participacion.idParticipacion, {
        horasAprobadas: participacion.horasAprobadas ?? participacion.horasCalculadas ?? 0,
        justificacionAjuste: participacion.justificacionAjuste ?? '',
      });
    }
  }
  return baseline;
}

/**
 * Identifica qué participaciones realmente cambiaron respecto al summary
 * original — solo esas requieren `PATCH` (A7). Una participación cuyo valor
 * actual coincide exactamente con su baseline no genera ninguna llamada,
 * evitando mutaciones innecesarias (Sección 51). `justificacionAjuste` se
 * omite del payload cuando queda vacía: A7 interpreta la ausencia del campo
 * como "limpiar la justificación" (ver `AdjustRecognizedHoursDto` +
 * `SprintsService.adjustRecognizedHours`, que persiste `null` cuando el
 * campo no viaja), así que volver a la igualdad limpia correctamente una
 * justificación previa sin necesitar un valor especial.
 */
export function planParticipationAdjustments(
  values: SprintClosingFormValues,
  baseline: Map<number, ParticipationBaseline>,
): ParticipationAdjustment[] {
  const adjustments: ParticipationAdjustment[] = [];
  for (const row of values.participaciones) {
    const base = baseline.get(row.idParticipacion) ?? { horasAprobadas: 0, justificacionAjuste: '' };
    const horasAprobadas = Number(row.horasAprobadas);
    const justificacionAjuste = row.justificacionAjuste.trim();

    if (horasAprobadas === base.horasAprobadas && justificacionAjuste === base.justificacionAjuste) {
      continue;
    }

    adjustments.push({
      idParticipacion: row.idParticipacion,
      horasAprobadas,
      ...(justificacionAjuste !== '' ? { justificacionAjuste } : {}),
    });
  }
  return adjustments;
}
