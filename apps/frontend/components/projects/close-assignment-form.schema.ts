import { z } from 'zod';
import type { CloseAssignmentInput } from '@/lib/types/tasks';

/**
 * Espejo exacto de `CloseAssignmentDto` (apps/backend/src/tasks/dto/close-assignment.dto.ts):
 * `@MinLength(200)` se aplica DESPUÉS de un `@Transform` que hace `.trim()`
 * — el backend valida (y persiste) el contenido ya recortado, nunca el
 * crudo. El frontend replica esa misma semántica de longitud, tanto en el
 * contador visible como en la validación — nunca dos criterios distintos.
 */
export const MIN_PROGRESO_CARACTERES = 200;

/** `@IsNumber` + `@Min(0)` en el DTO — decimales permitidos, sin entero forzado ni tope superior inventado. */
const HORAS_REGEX = /^\d+(\.\d+)?$/;

export const closeAssignmentFormSchema = z.object({
  horasReales: z
    .string()
    .min(1, 'Ingresa las horas reales dedicadas en este tramo.')
    .regex(HORAS_REGEX, 'Ingresa un número válido, mayor o igual a 0.'),
  contenidoAvance: z
    .string()
    .refine(
      (valor) => valor.trim().length >= MIN_PROGRESO_CARACTERES,
      `El registro de avance debe tener al menos ${MIN_PROGRESO_CARACTERES} caracteres.`,
    ),
  marcarComoHecha: z.boolean(),
});

export type CloseAssignmentFormValues = z.infer<typeof closeAssignmentFormSchema>;

export function defaultCloseAssignmentFormValues(): CloseAssignmentFormValues {
  return { horasReales: '', contenidoAvance: '', marcarComoHecha: false };
}

/** Body exacto de `POST .../asignaciones/:id/cerrar` — `contenidoAvance` recortado, igual que el `@Transform` del backend. */
export function buildCloseAssignmentPayload(values: CloseAssignmentFormValues): CloseAssignmentInput {
  return {
    horasReales: Number(values.horasReales),
    contenidoAvance: values.contenidoAvance.trim(),
    marcarComoHecha: values.marcarComoHecha,
  };
}
