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
