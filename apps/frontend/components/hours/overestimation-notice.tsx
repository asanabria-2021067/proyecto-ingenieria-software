'use client';

import { AlertTriangle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export const JUSTIFICACION_EXCESO_MAX = 5000;

export interface OverestimationNoticeProps {
  /** Id único del campo (para `htmlFor`/`aria-describedby`). */
  id: string;
  /** Estimación de la tarea en horas (nunca `null` cuando se muestra este aviso). */
  estimacion: number;
  /** Total que quedaría reportado tras la operación en curso. */
  despues: number;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  disabled?: boolean;
}

function formatHoras(value: number): string {
  return value.toLocaleString('es-GT', { maximumFractionDigits: 2 });
}

/**
 * VIEW-04 / VIEW-03 — aviso ámbar + justificación obligatoria. Solo se monta
 * cuando la operación en curso CRUZA la estimación (06 v2 §10): el
 * contenedor decide; este componente no evalúa el umbral. Reducir o revocar
 * nunca lo muestran, aunque el total siga por encima de la estimación.
 */
export function OverestimationNotice({
  id,
  estimacion,
  despues,
  value,
  onChange,
  error,
  disabled,
}: OverestimationNoticeProps) {
  const exceso = despues - estimacion;
  const errorId = `${id}-error`;

  return (
    <div
      role="group"
      aria-labelledby={`${id}-titulo`}
      className="space-y-2 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3"
    >
      <p
        id={`${id}-titulo`}
        className="flex items-start gap-2 text-xs font-semibold text-amber-800 dark:text-amber-200"
      >
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <span>
          Esta operación supera la estimación de la tarea ({formatHoras(estimacion)} h) por{' '}
          {formatHoras(exceso)} h. Justifica el exceso para continuar.
        </span>
      </p>
      <div>
        <Label htmlFor={id} className="text-xs font-semibold text-on-surface">
          Justificación del exceso <span aria-hidden="true">*</span>
        </Label>
        <Textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          required
          maxLength={JUSTIFICACION_EXCESO_MAX}
          disabled={disabled}
          aria-required="true"
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errorId : undefined}
          placeholder="Explica por qué se necesitaron más horas de las estimadas"
          className="mt-1 bg-surface-container-lowest text-sm"
        />
        <div className="mt-1 flex items-center justify-between gap-2">
          {error ? (
            <p id={errorId} role="alert" className="text-xs text-error">
              {error}
            </p>
          ) : (
            <span />
          )}
          <span className="text-[11px] text-tertiary" aria-live="polite">
            {value.length}/{JUSTIFICACION_EXCESO_MAX}
          </span>
        </div>
      </div>
    </div>
  );
}
