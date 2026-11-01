'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { erroresForm, type HorasForm } from '@/lib/hours/semestre';

const CAMPOS: { campo: keyof HorasForm; pregunta: string; grupo: string }[] = [
  { campo: 'metaBeca', pregunta: '¿Cuántas horas beca debes completar este semestre?', grupo: 'Horas beca' },
  { campo: 'becaDeclarada', pregunta: '¿Cuántas llevas ya este semestre?', grupo: 'Horas beca' },
  { campo: 'metaExtension', pregunta: '¿Cuántas horas de extensión debes completar este semestre?', grupo: 'Horas de extensión' },
  { campo: 'extensionDeclarada', pregunta: '¿Cuántas llevas ya este semestre?', grupo: 'Horas de extensión' },
];

interface Props {
  value: HorasForm;
  onChange: (value: HorasForm) => void;
  /** Prefijo de ids para que dos instancias no choquen. */
  idBase?: string;
}

/** Las cuatro preguntas del registro del semestre. Todas opcionales; lo ya hecho fuera de UVGenius se declara aquí. */
export function SemestreHorasFields({ value, onChange, idBase = 'horas' }: Props) {
  const errores = erroresForm(value);
  return (
    <div className="space-y-5">
      {['Horas beca', 'Horas de extensión'].map((grupo) => (
        <fieldset key={grupo} className="space-y-3 rounded-xl border border-surface-container-highest p-3">
          <legend className="px-1 text-xs font-bold uppercase tracking-widest text-tertiary">{grupo}</legend>
          {CAMPOS.filter((c) => c.grupo === grupo).map(({ campo, pregunta }) => {
            const id = `${idBase}-${campo}`;
            return (
              <div key={campo} className="space-y-1.5">
                <Label htmlFor={id}>{pregunta}</Label>
                <Input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={2000}
                  value={value[campo]}
                  onChange={(e) => onChange({ ...value, [campo]: e.target.value })}
                  aria-invalid={errores[campo] ? true : undefined}
                  aria-describedby={errores[campo] ? `${id}-error` : undefined}
                />
                {errores[campo] && (
                  <p id={`${id}-error`} className="type-meta text-error">
                    {errores[campo]}
                  </p>
                )}
              </div>
            );
          })}
        </fieldset>
      ))}
      <p className="type-meta">
        Opcional. Cuenta lo que hiciste fuera de UVGenius; las horas acreditadas aquí se suman solas.
      </p>
    </div>
  );
}
