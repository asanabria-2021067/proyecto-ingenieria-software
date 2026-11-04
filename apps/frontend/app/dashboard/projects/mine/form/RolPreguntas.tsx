'use client';

import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { ENUNCIADO_MAX, PREGUNTAS_MAX } from '@/lib/forms/postulacion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { inputClass, labelClass, safeId, type FieldErrors, type PreguntaFormItem } from './types';

type Props = {
  preguntas: PreguntaFormItem[];
  errors: FieldErrors;
  onChange: (preguntas: PreguntaFormItem[]) => void;
};

const BOTON_ICONO = 'text-tertiary hover:text-error transition-colors duration-200 disabled:opacity-30 disabled:hover:text-tertiary';

/** MEJ-97: hasta 5 preguntas propias del rol, que el estudiante responde al postularse. */
export function RolPreguntas({ preguntas, errors, onChange }: Props) {
  const cambiar = (id: string, cambio: Partial<PreguntaFormItem>) =>
    onChange(preguntas.map((q) => (q.id === id ? { ...q, ...cambio } : q)));
  const mover = (indice: number, destino: number) => {
    const copia = [...preguntas];
    [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
    onChange(copia);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className={`${labelClass} mb-0`}>Preguntas para quien se postula</span>
        <button
          type="button"
          onClick={() => onChange([...preguntas, { id: safeId(), enunciado: '', tipo: 'CORTA', obligatoria: false }])}
          disabled={preguntas.length >= PREGUNTAS_MAX}
          className="flex items-center gap-1 text-xs text-primary font-bold motion-link disabled:opacity-50"
        >
          <Plus className="w-3 h-3" aria-hidden="true" /> Agregar pregunta
        </button>
      </div>
      <p className="text-xs text-tertiary mb-2">
        Además de «¿Por qué te gustaría participar?», que siempre se pregunta. Máximo {PREGUNTAS_MAX} por rol.
      </p>

      <ul className="space-y-2">
        {preguntas.map((q, i) => {
          const error = errors[`preguntas.${i}.enunciado`];
          return (
            <li key={q.id} className="grid grid-cols-1 items-start gap-2 sm:grid-cols-[1fr_8rem_auto_auto]">
              <div>
                <input
                  aria-label={`Pregunta ${i + 1}`}
                  maxLength={ENUNCIADO_MAX}
                  className={`${inputClass} ${error ? 'border-error focus:border-error focus:ring-error/20' : ''}`}
                  placeholder="ej. ¿Qué experiencia tienes con React?"
                  value={q.enunciado}
                  onChange={(e) => cambiar(q.id, { enunciado: e.target.value })}
                />
                {error && <p className="text-xs text-error mt-1">{error}</p>}
              </div>

              <Select value={q.tipo} onValueChange={(v) => cambiar(q.id, { tipo: v as PreguntaFormItem['tipo'] })}>
                <SelectTrigger aria-label={`Tipo de la pregunta ${i + 1}`} className="w-full h-auto py-3 rounded-xl border-outline-variant/30 bg-surface-container-low text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CORTA">Texto corto</SelectItem>
                  <SelectItem value="LARGA">Texto largo</SelectItem>
                </SelectContent>
              </Select>

              <label className="flex items-center gap-1.5 py-3 text-xs text-tertiary whitespace-nowrap cursor-pointer">
                <input
                  type="checkbox"
                  checked={q.obligatoria}
                  onChange={(e) => cambiar(q.id, { obligatoria: e.target.checked })}
                  className="accent-primary"
                />
                Obligatoria
              </label>

              <div className="flex items-center gap-1 py-2.5">
                <button type="button" aria-label={`Subir la pregunta ${i + 1}`} disabled={i === 0} onClick={() => mover(i, i - 1)} className={BOTON_ICONO}>
                  <ArrowUp className="w-4 h-4" aria-hidden="true" />
                </button>
                <button type="button" aria-label={`Bajar la pregunta ${i + 1}`} disabled={i === preguntas.length - 1} onClick={() => mover(i, i + 1)} className={BOTON_ICONO}>
                  <ArrowDown className="w-4 h-4" aria-hidden="true" />
                </button>
                <button type="button" aria-label={`Quitar la pregunta ${i + 1}`} onClick={() => onChange(preguntas.filter((x) => x.id !== q.id))} className={BOTON_ICONO}>
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
