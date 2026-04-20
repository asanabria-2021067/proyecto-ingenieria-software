'use client';

import { TIPO_LABEL, MODALIDAD_LABEL } from '@/types';
import type { TipoProyecto, ModalidadProyecto } from '@/types';
import type { FormData } from './types';

type Props = {
  form: FormData;
  saving: boolean;
  isStep1Complete: boolean;
  isStep2Complete: boolean;
  onSubmit: (accion: 'BORRADOR' | 'EN_REVISION') => void;
};

export function Step3({ form, saving, isStep1Complete, isStep2Complete, onSubmit }: Props) {
  return (
    <div className="space-y-5">
      <p className="text-tertiary text-sm">Revisa los datos antes de guardar o enviar tu proyecto.</p>

      <div className="rounded-xl border border-outline-variant p-4 space-y-1.5">
        <h3 className="text-sm font-bold text-on-surface mb-2">Datos generales</h3>
        <p className="text-sm"><span className="text-tertiary">Título: </span>{form.tituloProyecto}</p>
        <p className="text-sm"><span className="text-tertiary">Tipo: </span>{TIPO_LABEL[form.tipoProyecto as TipoProyecto]}</p>
        <p className="text-sm"><span className="text-tertiary">Modalidad: </span>{MODALIDAD_LABEL[form.modalidadProyecto as ModalidadProyecto]}</p>
        <p className="text-sm line-clamp-2"><span className="text-tertiary">Descripción: </span>{form.descripcionProyecto}</p>
        {form.objetivosProyecto && <p className="text-sm line-clamp-2"><span className="text-tertiary">Objetivos: </span>{form.objetivosProyecto}</p>}
        {form.ubicacionProyecto && <p className="text-sm"><span className="text-tertiary">Ubicación: </span>{form.ubicacionProyecto}</p>}
        {form.fechaInicio && <p className="text-sm"><span className="text-tertiary">Inicio: </span>{form.fechaInicio}</p>}
        {form.fechaFinEstimada && <p className="text-sm"><span className="text-tertiary">Fin estimado: </span>{form.fechaFinEstimada}</p>}
      </div>

      {form.roles.length > 0 && (
        <div className="rounded-xl border border-outline-variant p-4 space-y-1.5">
          <h3 className="text-sm font-bold text-on-surface mb-2">Roles ({form.roles.length})</h3>
          {form.roles.map((rol, i) => (
            <div key={rol.id} className="text-sm">
              <p className="font-medium">
                {i + 1}. {rol.nombreRol} — {rol.cupos} cupo{Number(rol.cupos) !== 1 ? 's' : ''}
              </p>
              {rol.requisitos.length > 0 && (
                <p className="text-tertiary ml-4">
                  {rol.requisitos.length} habilidad{rol.requisitos.length !== 1 ? 'es' : ''} requerida{rol.requisitos.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 pt-2">
        <button
          disabled={saving || !isStep1Complete}
          onClick={() => onSubmit('BORRADOR')}
          className="w-full py-3 rounded-xl border-2 border-primary text-primary font-bold text-sm hover:bg-primary/5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Guardando...' : 'Guardar como borrador'}
        </button>
        <button
          disabled={saving || !isStep1Complete || !isStep2Complete}
          onClick={() => onSubmit('EN_REVISION')}
          className="w-full py-3 rounded-xl bg-primary text-on-primary font-bold text-sm hover:bg-primary/90 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Enviando...' : 'Enviar a revisión'}
        </button>
      </div>
    </div>
  );
}
