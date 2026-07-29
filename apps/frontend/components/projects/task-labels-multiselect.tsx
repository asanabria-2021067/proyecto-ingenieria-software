'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown, Tag, X } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { LabelDTO } from '@/lib/services/labels';

/**
 * Cantidad de chips que se muestran antes de resumir el resto en "+N"
 * (Sección 29): evita que el control crezca sin límite. Las etiquetas ocultas
 * siguen siendo consultables — el listado del popover muestra TODAS las
 * seleccionadas con su marca de verificación, y el "+N" lleva un `title` con
 * los nombres restantes.
 */
const MAX_VISIBLE_CHIPS = 6;

export interface TaskLabelsMultiSelectProps {
  labels: LabelDTO[];
  value: number[];
  onChange: (ids: number[]) => void;
  /** Id del control, para enlazar `label`/`aria-describedby` desde el formulario. */
  id?: string;
  ariaInvalid?: boolean;
  ariaDescribedBy?: string;
  disabled?: boolean;
}

function ColorDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-2.5 shrink-0 rounded-full border border-outline-variant/40"
      style={{ backgroundColor: color }}
    />
  );
}

/**
 * Selector múltiple de etiquetas (Secciones 27-29). Reemplaza la antigua
 * cuadrícula permanente de checkboxes por un control compacto con chips y un
 * popover de opciones. Deliberadamente NO usa `cmdk`: un popover con una lista
 * de opciones conmutables da control total sobre roles/aria y evita las
 * peculiaridades de medición de `cmdk` en jsdom. El control es un `div`
 * (no un `button`) para poder anidar los botones "quitar" de cada chip sin
 * incurrir en botones interactivos anidados (Sección 66).
 */
export function TaskLabelsMultiSelect({
  labels,
  value,
  onChange,
  id,
  ariaInvalid,
  ariaDescribedBy,
  disabled = false,
}: TaskLabelsMultiSelectProps) {
  const [open, setOpen] = useState(false);

  const seleccionadas = useMemo(
    () => value.map((idEtiqueta) => labels.find((l) => l.idEtiqueta === idEtiqueta)).filter(Boolean) as LabelDTO[],
    [value, labels],
  );

  const visibles = seleccionadas.slice(0, MAX_VISIBLE_CHIPS);
  const ocultas = seleccionadas.slice(MAX_VISIBLE_CHIPS);

  const toggle = (idEtiqueta: number) => {
    onChange(
      value.includes(idEtiqueta)
        ? value.filter((id) => id !== idEtiqueta)
        : [...value, idEtiqueta],
    );
  };

  const quitar = (idEtiqueta: number) => onChange(value.filter((id) => id !== idEtiqueta));

  if (labels.length === 0) {
    return (
      <p className="text-xs text-tertiary">
        Este proyecto todavía no tiene etiquetas. Usa “Gestionar etiquetas” para crear la primera.
      </p>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          'flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border border-outline-variant bg-surface-container-lowest px-2 py-1.5 text-sm transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20',
          ariaInvalid && 'border-red-500 focus-within:border-red-500 focus-within:ring-red-500/20',
          disabled && 'opacity-60',
        )}
      >
        {visibles.map((etiqueta) => (
          <span
            key={etiqueta.idEtiqueta}
            className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-surface-container-high py-0.5 pl-2 pr-1 text-[11px] font-medium text-on-surface-variant"
          >
            <ColorDot color={etiqueta.color} />
            <span className="truncate">{etiqueta.nombreEtiqueta}</span>
            <button
              type="button"
              disabled={disabled}
              aria-label={`Quitar etiqueta ${etiqueta.nombreEtiqueta}`}
              onClick={() => quitar(etiqueta.idEtiqueta)}
              className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-tertiary transition-colors hover:bg-surface-container-highest hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </span>
        ))}

        {ocultas.length > 0 && (
          <span
            title={ocultas.map((e) => e.nombreEtiqueta).join(', ')}
            className="inline-flex items-center rounded-md bg-surface-container-high px-2 py-0.5 text-[11px] font-semibold text-on-surface-variant"
          >
            +{ocultas.length}
          </span>
        )}

        <PopoverTrigger asChild>
          <button
            type="button"
            id={id}
            disabled={disabled}
            aria-label="Seleccionar etiquetas"
            aria-describedby={ariaDescribedBy}
            aria-expanded={open}
            className="inline-flex min-w-0 flex-1 items-center justify-between gap-2 rounded-sm px-1 py-1 text-left text-sm text-on-surface-variant focus-visible:outline-none"
          >
            <span className={cn('truncate', seleccionadas.length > 0 && 'sr-only')}>
              Selecciona etiquetas
            </span>
            <ChevronDown className="size-4 shrink-0 text-tertiary" aria-hidden="true" />
          </button>
        </PopoverTrigger>
      </div>

      <PopoverContent
        align="start"
        className="w-[--radix-popover-trigger-width] min-w-56 rounded-lg border-outline-variant bg-surface-container-lowest p-1.5"
      >
        <div role="listbox" aria-multiselectable="true" aria-label="Etiquetas del proyecto" className="max-h-64 space-y-0.5 overflow-y-auto">
          {labels.map((etiqueta) => {
            const marcada = value.includes(etiqueta.idEtiqueta);
            return (
              <button
                key={etiqueta.idEtiqueta}
                type="button"
                role="option"
                aria-selected={marcada}
                onClick={() => toggle(etiqueta.idEtiqueta)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35',
                  marcada && 'bg-surface-container-high/60',
                )}
              >
                <ColorDot color={etiqueta.color} />
                <span className="min-w-0 flex-1 truncate text-on-surface">{etiqueta.nombreEtiqueta}</span>
                {marcada ? (
                  <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                ) : (
                  <Tag className="size-4 shrink-0 text-tertiary/50" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
