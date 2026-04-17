'use client';

import { Plus, X } from 'lucide-react';
import { NIVEL_LABEL } from '@/types';
import type { Carrera, Habilidad } from '@/lib/services/catalogs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { inputClass, labelClass, type RolFormItem, type RequisitoFormItem } from './types';

type Props = {
  roles: RolFormItem[];
  carreras: Carrera[];
  habilidades: Habilidad[];
  showErrors: boolean;
  onAddRol: () => void;
  onRemoveRol: (id: string) => void;
  onUpdateRol: (id: string, field: keyof Omit<RolFormItem, 'id' | 'requisitos'>, value: unknown) => void;
  onAddRequisito: (rolId: string) => void;
  onRemoveRequisito: (rolId: string, reqId: string) => void;
  onUpdateRequisito: (rolId: string, reqId: string, field: keyof Omit<RequisitoFormItem, 'id'>, value: unknown) => void;
};

const err = (msg: string) => (
  <p className="text-xs text-error mt-1">{msg}</p>
);

export function Step2({
  roles, carreras, habilidades, showErrors,
  onAddRol, onRemoveRol, onUpdateRol,
  onAddRequisito, onRemoveRequisito, onUpdateRequisito,
}: Props) {
  return (
    <div className="space-y-4">
      <p className="text-tertiary text-sm">
        Define los roles disponibles y las habilidades requeridas para cada uno.
      </p>

      {roles.length === 0 && (
        <div className={`text-center py-10 text-sm border-2 border-dashed rounded-xl ${showErrors ? 'border-error text-error' : 'border-outline-variant text-tertiary'}`}>
          {showErrors ? 'Debes agregar al menos un rol para enviar a revisión.' : 'No hay roles definidos aún.'}
        </div>
      )}

      {roles.map((rol, rolIdx) => (
        <div key={rol.id} className="rounded-xl border border-outline-variant bg-surface-container-low p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-on-surface">Rol {rolIdx + 1}</span>
            <button onClick={() => onRemoveRol(rol.id)} className="text-tertiary hover:text-error transition-colors duration-200">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Nombre del rol <span className="text-error">*</span></label>
              <input
                className={`${inputClass} ${showErrors && rol.nombreRol.trim() === '' ? 'border-error focus:border-error focus:ring-error/20' : ''}`}
                placeholder="ej. Desarrollador Frontend"
                value={rol.nombreRol}
                onChange={(e) => onUpdateRol(rol.id, 'nombreRol', e.target.value)}
              />
              {showErrors && rol.nombreRol.trim() === '' && err('El nombre del rol es obligatorio.')}
            </div>
            <div>
              <label className={labelClass}>Cupos <span className="text-error">*</span></label>
              <input
                type="number" min={1}
                className={`${inputClass} ${showErrors && rol.cupos === '' ? 'border-error focus:border-error focus:ring-error/20' : ''}`}
                placeholder="1"
                value={rol.cupos}
                onChange={(e) => onUpdateRol(rol.id, 'cupos', e.target.value === '' ? '' : Number(e.target.value))}
              />
              {showErrors && rol.cupos === '' && err('La cantidad de cupos es obligatoria.')}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className={labelClass}>Carrera requerida</label>
              <Select value={rol.idCarreraRequerida ? String(rol.idCarreraRequerida) : '__NONE__'} onValueChange={(v) => onUpdateRol(rol.id, 'idCarreraRequerida', v === '__NONE__' ? null : Number(v))}>
                <SelectTrigger className="w-full h-auto py-3 rounded-xl border-surface-container-highest bg-white text-sm">
                  <SelectValue placeholder="Cualquier carrera" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__NONE__">Cualquier carrera</SelectItem>
                  {carreras.map((c) => (
                    <SelectItem key={c.idCarrera} value={String(c.idCarrera)}>{c.nombreCarrera}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-40">
              <label className={labelClass}>Horas semanales</label>
              <input type="number" min={1} className={inputClass} placeholder="ej. 10" value={rol.horasSemanalesEstimadas} onChange={(e) => onUpdateRol(rol.id, 'horasSemanalesEstimadas', e.target.value === '' ? '' : Number(e.target.value))} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Descripción del rol</label>
            <textarea className={`${inputClass} resize-none`} rows={2} placeholder="Responsabilidades y tareas principales" value={rol.descripcionRolProyecto} onChange={(e) => onUpdateRol(rol.id, 'descripcionRolProyecto', e.target.value)} />
          </div>

          {/* Habilidades requeridas */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={`${labelClass} mb-0`}>Habilidades requeridas</label>
              <button onClick={() => onAddRequisito(rol.id)} className="flex items-center gap-1 text-xs text-primary font-bold hover:underline">
                <Plus className="w-3 h-3" /> Agregar habilidad
              </button>
            </div>

            {rol.requisitos.length > 0 && (
              <div className="grid grid-cols-[1fr_8rem_auto_auto] gap-x-2 mb-1 px-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-tertiary">Habilidad</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-tertiary">Nivel</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-tertiary whitespace-nowrap">Obligatorio</span>
                <span />
              </div>
            )}

            <div className="space-y-2">
              {rol.requisitos.map((req) => (
                <div key={req.id} className="grid grid-cols-[1fr_8rem_auto_auto] items-center gap-2">
                  <Select value={req.idHabilidad ? String(req.idHabilidad) : '__NONE__'} onValueChange={(v) => onUpdateRequisito(rol.id, req.id, 'idHabilidad', v === '__NONE__' ? null : Number(v))}>
                    <SelectTrigger className="h-auto py-2 rounded-lg border-surface-container-highest bg-white text-sm">
                      <SelectValue placeholder="Seleccionar habilidad" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__NONE__">Seleccionar habilidad</SelectItem>
                      {habilidades.map((h) => (
                        <SelectItem key={h.idHabilidad} value={String(h.idHabilidad)}>{h.nombreHabilidad}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={req.nivelMinimo || '__NONE__'} onValueChange={(v) => onUpdateRequisito(rol.id, req.id, 'nivelMinimo', v === '__NONE__' ? '' : v)}>
                    <SelectTrigger className="h-auto py-2 rounded-lg border-surface-container-highest bg-white text-sm">
                      <SelectValue placeholder="Nivel" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(NIVEL_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <label className="flex items-center gap-1.5 text-xs text-tertiary whitespace-nowrap cursor-pointer">
                    <input type="checkbox" checked={req.obligatorio} onChange={(e) => onUpdateRequisito(rol.id, req.id, 'obligatorio', e.target.checked)} className="accent-primary" />
                    Obligatorio
                  </label>

                  <button onClick={() => onRemoveRequisito(rol.id, req.id)} className="text-tertiary hover:text-error transition-colors duration-200">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}

      <button onClick={onAddRol} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-outline-variant text-sm font-bold text-primary hover:border-primary hover:bg-primary/5 transition-all duration-200">
        <Plus className="w-4 h-4" /> Agregar rol
      </button>
    </div>
  );
}
