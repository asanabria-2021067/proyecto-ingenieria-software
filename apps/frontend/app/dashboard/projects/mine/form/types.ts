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

export const rolSchema = z.object({
  id: z.string(),
  nombreRol: z.string().trim().min(1, 'El nombre del rol es obligatorio.'),
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
    z.number().int().min(1).optional(),
  ),
  requisitos: z.array(z.any()),
});

export const step1Schema = z
  .object({
    tituloProyecto: z.string().trim()
      .min(1, 'El título del proyecto es obligatorio.')
      .min(5, 'El título debe tener al menos 5 caracteres.'),
    descripcionProyecto: z.string().trim()
      .min(1, 'La descripción del proyecto es obligatoria.')
      .min(20, 'La descripción debe tener al menos 20 caracteres.'),
    tipoProyecto: z.string().min(1, 'Debes seleccionar un tipo de proyecto.'),
    modalidadProyecto: z.string().min(1, 'Debes seleccionar una modalidad.'),
    objetivosProyecto: z.string(),
    ubicacionProyecto: z.string(),
    contextoAcademico: z.string(),
    urlRecursoExterno: z.string(),
    fechaInicio: z.string(),
    fechaFinEstimada: z.string(),
    roles: z.array(z.any()),
  })
  .refine(
    (d) => !(d.fechaInicio && d.fechaFinEstimada && d.fechaFinEstimada < d.fechaInicio),
    { message: 'La fecha de fin estimada no puede ser anterior a la fecha de inicio.', path: ['fechaFinEstimada'] },
  );

export const formSchema = step1Schema.innerType().extend({
  roles: z.array(rolSchema),
}).refine(
  (d) => !(d.fechaInicio && d.fechaFinEstimada && d.fechaFinEstimada < d.fechaInicio),
  { message: 'La fecha de fin estimada no puede ser anterior a la fecha de inicio.', path: ['fechaFinEstimada'] },
);

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
  'w-full rounded-xl border border-surface-container-highest bg-white px-4 py-3 text-sm text-on-surface placeholder:text-outline-variant focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all duration-200';

export const labelClass =
  'block text-xs font-bold uppercase tracking-widest text-tertiary mb-1.5';

export function newRol(): RolFormItem {
  return {
    id: crypto.randomUUID(),
    nombreRol: '',
    descripcionRolProyecto: '',
    idCarreraRequerida: null,
    cupos: '',
    horasSemanalesEstimadas: '',
    requisitos: [],
  };
}

export function newRequisito(): RequisitoFormItem {
  return { id: crypto.randomUUID(), idHabilidad: null, nivelMinimo: '', obligatorio: false };
}
