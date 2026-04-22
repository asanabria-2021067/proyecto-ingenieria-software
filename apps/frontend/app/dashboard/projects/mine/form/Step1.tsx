'use client';

import { TIPO_LABEL, MODALIDAD_LABEL } from '@/types';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { inputClass, labelClass, type FormData, type FieldErrors } from './types';

type Props = {
  form: FormData;
  update: (field: keyof Omit<FormData, 'roles'>, value: string) => void;
  errors: FieldErrors;
};

const ErrMsg = ({ field, errors }: { field: string; errors: FieldErrors }) =>
  errors[field] ? <p className="text-xs text-error mt-1">{errors[field]}</p> : null;

const hasError = (field: string, errors: FieldErrors) => !!errors[field];

export function Step1({ form, update, errors }: Props) {
  return (
    <div className="space-y-5">
      <div>
        <label className={labelClass}>Título del proyecto <span className="text-error">*</span></label>
        <input
          className={`${inputClass} ${hasError('tituloProyecto', errors) ? 'border-error focus:border-error focus:ring-error/20' : ''}`}
          placeholder="Nombre descriptivo del proyecto"
          value={form.tituloProyecto}
          onChange={(e) => update('tituloProyecto', e.target.value)}
        />
        <ErrMsg field="tituloProyecto" errors={errors} />
      </div>

      <div>
        <label className={labelClass}>Descripción <span className="text-error">*</span></label>
        <textarea
          className={`${inputClass} resize-none ${hasError('descripcionProyecto', errors) ? 'border-error focus:border-error focus:ring-error/20' : ''}`}
          rows={3}
          placeholder="¿En qué consiste el proyecto?"
          value={form.descripcionProyecto}
          onChange={(e) => update('descripcionProyecto', e.target.value)}
        />
        <ErrMsg field="descripcionProyecto" errors={errors} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Tipo <span className="text-error">*</span></label>
          <Select value={form.tipoProyecto || '__NONE__'} onValueChange={(v) => update('tipoProyecto', v === '__NONE__' ? '' : v)}>
            <SelectTrigger className={`h-auto py-3 rounded-xl border-surface-container-highest bg-white text-sm focus-visible:ring-primary/20 ${hasError('tipoProyecto', errors) ? 'border-error' : ''}`}>
              <SelectValue placeholder="Selecciona un tipo" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TIPO_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ErrMsg field="tipoProyecto" errors={errors} />
        </div>
        <div>
          <label className={labelClass}>Modalidad <span className="text-error">*</span></label>
          <Select value={form.modalidadProyecto || '__NONE__'} onValueChange={(v) => update('modalidadProyecto', v === '__NONE__' ? '' : v)}>
            <SelectTrigger className={`h-auto py-3 rounded-xl border-surface-container-highest bg-white text-sm focus-visible:ring-primary/20 ${hasError('modalidadProyecto', errors) ? 'border-error' : ''}`}>
              <SelectValue placeholder="Selecciona modalidad" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(MODALIDAD_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ErrMsg field="modalidadProyecto" errors={errors} />
        </div>
      </div>

      <div>
        <label className={labelClass}>Objetivos</label>
        <textarea className={`${inputClass} resize-none`} rows={2} placeholder="Objetivos principales del proyecto" value={form.objetivosProyecto} onChange={(e) => update('objetivosProyecto', e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Contexto académico</label>
          <input className={inputClass} placeholder="ej. Tesis, proyecto de curso..." value={form.contextoAcademico} onChange={(e) => update('contextoAcademico', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Ubicación</label>
          <input className={inputClass} placeholder="Ciudad o lugar" value={form.ubicacionProyecto} onChange={(e) => update('ubicacionProyecto', e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Fecha de inicio</label>
          <input type="date" className={inputClass} value={form.fechaInicio} onChange={(e) => update('fechaInicio', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Fecha fin estimada</label>
          <input
            type="date"
            className={`${inputClass} ${hasError('fechaFinEstimada', errors) ? 'border-error focus:border-error focus:ring-error/20' : ''}`}
            value={form.fechaFinEstimada}
            onChange={(e) => update('fechaFinEstimada', e.target.value)}
          />
          <ErrMsg field="fechaFinEstimada" errors={errors} />
        </div>
      </div>

      <div>
        <label className={labelClass}>URL recurso externo</label>
        <input className={inputClass} placeholder="https://..." value={form.urlRecursoExterno} onChange={(e) => update('urlRecursoExterno', e.target.value)} />
      </div>
    </div>
  );
}
