import type { EtiquetaTareaDTO } from '@/lib/types/tasks';

/**
 * Fondo neutral + texto con color del tema; `label.color` real solo se usa
 * en el punto decorativo, nunca como fondo del texto — evita el riesgo de
 * contraste insuficiente de usar un color arbitrario como fondo de texto.
 */
export function TaskLabelChip({ etiqueta }: { etiqueta: EtiquetaTareaDTO }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-surface-container-high text-on-surface-variant text-[11px] font-medium max-w-full">
      <span
        aria-hidden="true"
        className="size-2 rounded-full shrink-0 border border-outline-variant/40"
        style={{ backgroundColor: etiqueta.color }}
      />
      <span className="truncate">{etiqueta.nombreEtiqueta}</span>
    </span>
  );
}
