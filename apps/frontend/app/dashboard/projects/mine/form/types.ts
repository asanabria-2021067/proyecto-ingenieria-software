import { z } from 'zod';
import type { TipoProyecto, ModalidadProyecto, NivelHabilidad } from '@/types';

export type RequisitoFormItem = {
  id: string;
  idHabilidad: number | null;
  nivelMinimo: NivelHabilidad | '';
  obligatorio: boolean;
};

export type RolFormItem = {
  id: string;
  nombreRol: string;
  descripcionRolProyecto: string;
  idCarreraRequerida: number | null;
  cupos: number | '';
  horasSemanalesEstimadas: number | '';
  requisitos: RequisitoFormItem[];
};

export type FormData = {
  tituloProyecto: string;
  descripcionProyecto: string;
  tipoProyecto: TipoProyecto | '';
  modalidadProyecto: ModalidadProyecto | '';
  objetivosProyecto: string;
  ubicacionProyecto: string;
  contextoAcademico: string;
  urlRecursoExterno: string;
  fechaInicio: string;
  fechaFinEstimada: string;
  roles: RolFormItem[];
};

export type FieldErrors = Record<string, string>;

// ─── Schemas ──────────────────────────────────────────────────────────────────

function fechaOpcionalValida(value: string): boolean {
  if (value === '') return true;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const anio = Number(match[1]);
  const mes = Number(match[2]);
  const dia = Number(match[3]);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia
  );
}

export const requisitoSchema = z.object({
  id: z.string(),
  idHabilidad: z.number({
    required_error: 'Debes seleccionar una habilidad.',
    invalid_type_error: 'Debes seleccionar una habilidad.',
  }).int('La habilidad seleccionada no es válida.'),
  nivelMinimo: z.enum(['BASICO', 'INTERMEDIO', 'AVANZADO'], {
    errorMap: () => ({ message: 'Debes seleccionar un nivel válido.' }),
  }),
  obligatorio: z.boolean(),
});

export const rolSchema = z.object({
  id: z.string(),
  nombreRol: z.string()
    .min(1, 'El nombre del rol es obligatorio.')
    .max(255, 'El nombre del rol no puede superar 255 caracteres.'),
  descripcionRolProyecto: z.string(),
  idCarreraRequerida: z.number().nullable(),
  cupos: z.preprocess(
    (v) => (v === '' ? undefined : Number(v)),
    z.number({
      required_error: 'La cantidad de cupos es obligatoria.',
      invalid_type_error: 'La cantidad de cupos es obligatoria.',
    }).int('Los cupos deben ser un número entero.').min(1, 'Los cupos deben ser al menos 1.'),
  ),
  horasSemanalesEstimadas: z.preprocess(
    (v) => (v === '' ? undefined : Number(v)),
    z.number({ invalid_type_error: 'Las horas semanales deben ser un número.' })
      .int('Las horas semanales deben ser un número entero.')
      .min(1, 'Las horas semanales deben ser al menos 1.')
      .optional(),
  ),
  requisitos: z.array(requisitoSchema),
});

export const step1Schema = z
  .object({
    tituloProyecto: z.string()
      .min(5, 'El título debe tener al menos 5 caracteres.')
      .max(200, 'El título no puede superar 200 caracteres.'),
    descripcionProyecto: z.string()
      .min(20, 'La descripción debe tener al menos 20 caracteres.'),
    tipoProyecto: z
      .enum(['ACADEMICO_HORAS_BECA', 'ACADEMICO_EXPERIENCIA', 'EXTRACURRICULAR_EXTENSION'], {
        errorMap: () => ({ message: 'Debes seleccionar un tipo de proyecto válido.' }),
      })
      .or(z.literal('').refine(() => false, 'Debes seleccionar un tipo de proyecto.')),
    modalidadProyecto: z
      .enum(['PRESENCIAL', 'VIRTUAL', 'MIXTA'], {
        errorMap: () => ({ message: 'Debes seleccionar una modalidad válida.' }),
      })
      .or(z.literal('').refine(() => false, 'Debes seleccionar una modalidad.')),
    objetivosProyecto: z.string(),
    ubicacionProyecto: z.string().max(255, 'La ubicación no puede superar 255 caracteres.'),
    contextoAcademico: z.string().max(255, 'El contexto académico no puede superar 255 caracteres.'),
    urlRecursoExterno: z.string().max(255, 'La URL no puede superar 255 caracteres.'),
    fechaInicio: z.string().refine(fechaOpcionalValida, 'Selecciona una fecha de inicio válida.'),
    fechaFinEstimada: z.string().refine(fechaOpcionalValida, 'Selecciona una fecha de fin válida.'),
    roles: z.array(z.any()),
  });

export const formSchema = step1Schema.extend({
  roles: z.array(rolSchema),
});

export const partialProjectSchema = step1Schema.pick({
  tituloProyecto: true,
  descripcionProyecto: true,
  objetivosProyecto: true,
  ubicacionProyecto: true,
  contextoAcademico: true,
  urlRecursoExterno: true,
  fechaFinEstimada: true,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function zodToFieldErrors(result: z.SafeParseReturnType<unknown, unknown>): FieldErrors {
  if (result.success) return {};
  const map: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.');
    if (!map[key]) map[key] = issue.message;
  }
  return map;
}

export const STEPS = ['Datos generales', 'Roles y habilidades', 'Resumen'];

export const inputClass =
  'w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm text-on-surface placeholder:text-outline-variant focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all duration-200';

export const labelClass =
  'block text-xs font-black uppercase tracking-widest text-tertiary mb-1.5';

// `crypto.randomUUID()` solo existe en contextos seguros (HTTPS/localhost);
// en despliegues servidos por HTTP plano (ej. IP sin TLS) es `undefined` y
// lanza un TypeError. Estos IDs son solo claves locales de React, así que un
// fallback simple es suficiente cuando la API no está disponible.
export function safeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function newRol(): RolFormItem {
  return {
    id: safeId(),
    nombreRol: '',
    descripcionRolProyecto: '',
    idCarreraRequerida: null,
    cupos: '',
    horasSemanalesEstimadas: '',
    requisitos: [],
  };
}

export function newRequisito(): RequisitoFormItem {
  return { id: safeId(), idHabilidad: null, nivelMinimo: '', obligatorio: false };
}
