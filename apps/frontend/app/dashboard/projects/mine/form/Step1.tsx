'use client';

import { TIPO_LABEL, MODALIDAD_LABEL } from '@/types';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { inputClass, labelClass, type FormData } from './types';

type Props = {
  form: FormData;
  update: (field: keyof Omit<FormData, 'roles'>, value: string) => void;
  showErrors: boolean;
};

const err = (msg: string) => (
  <p className="text-xs text-error mt-1">{msg}</p>
);

export function Step1({ form, update, showErrors }: Props) {
  const tituloVacio = form.tituloProyecto.trim() === '';
  const tituloCorto = !tituloVacio && form.tituloProyecto.trim().length < 5;
  const descVacia = form.descripcionProyecto.trim() === '';
  const descCorta = !descVacia && form.descripcionProyecto.trim().length < 20;

  return (
    <div className="space-y-5">
      <div>
        <label className={labelClass}>Título del proyecto <span className="text-error">*</span></label>
        <input className={`${inputClass} ${showErrors && (tituloVacio || tituloCorto) ? 'border-error focus:border-error focus:ring-error/20' : ''}`} placeholder="Nombre descriptivo del proyecto" value={form.tituloProyecto} onChange={(e) => update('tituloProyecto', e.target.value)} />
        {showErrors && tituloVacio && err('El título del proyecto es obligatorio.')}
        {showErrors && tituloCorto && err('El título debe tener al menos 5 caracteres.')}
      </div>

      <div>
        <label className={labelClass}>Descripción <span className="text-error">*</span></label>
        <textarea className={`${inputClass} resize-none ${showErrors && (descVacia || descCorta) ? 'border-error focus:border-error focus:ring-error/20' : ''}`} rows={3} placeholder="¿En qué consiste el proyecto?" value={form.descripcionProyecto} onChange={(e) => update('descripcionProyecto', e.target.value)} />
        {showErrors && descVacia && err('La descripción del proyecto es obligatoria.')}
        {showErrors && descCorta && err('La descripción debe tener al menos 20 caracteres.')}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Tipo <span className="text-error">*</span></label>
          <Select value={form.tipoProyecto || '__NONE__'} onValueChange={(v) => update('tipoProyecto', v === '__NONE__' ? '' : v)}>
            <SelectTrigger className={`h-auto py-3 rounded-xl border-surface-container-highest bg-white text-sm focus-visible:ring-primary/20 ${showErrors && !form.tipoProyecto ? 'border-error' : ''}`}>
              <SelectValue placeholder="Selecciona un tipo" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TIPO_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {showErrors && !form.tipoProyecto && err('Debes seleccionar un tipo de proyecto.')}
        </div>
        <div>
          <label className={labelClass}>Modalidad <span className="text-error">*</span></label>
          <Select value={form.modalidadProyecto || '__NONE__'} onValueChange={(v) => update('modalidadProyecto', v === '__NONE__' ? '' : v)}>
            <SelectTrigger className={`h-auto py-3 rounded-xl border-surface-container-highest bg-white text-sm focus-visible:ring-primary/20 ${showErrors && !form.modalidadProyecto ? 'border-error' : ''}`}>
              <SelectValue placeholder="Selecciona modalidad" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(MODALIDAD_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {showErrors && !form.modalidadProyecto && err('Debes seleccionar una modalidad.')}
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
            className={`${inputClass} ${form.fechaInicio && form.fechaFinEstimada && form.fechaFinEstimada < form.fechaInicio ? 'border-error focus:border-error focus:ring-error/20' : ''}`}
            value={form.fechaFinEstimada}
            onChange={(e) => update('fechaFinEstimada', e.target.value)}
          />
          {form.fechaInicio && form.fechaFinEstimada && form.fechaFinEstimada < form.fechaInicio &&
            err('La fecha de fin no puede ser anterior a la fecha de inicio.')}
        </div>
      </div>

      <div>
        <label className={labelClass}>URL recurso externo</label>
        <input className={inputClass} placeholder="https://..." value={form.urlRecursoExterno} onChange={(e) => update('urlRecursoExterno', e.target.value)} />
      </div>
    </div>
  );
}
