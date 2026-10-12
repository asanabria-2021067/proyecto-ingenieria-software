import type { CSSProperties } from 'react';
import type { EtiquetaTareaDTO } from '@/lib/types/tasks';

/**
 * Etiqueta libre de tarea (color configurable por proyecto). El color real
 * se usa en el punto y, muy diluido (`color-mix` al 16 %), como tinte del
 * fondo; el texto conserva el color del tema, así cualquier color almacenado
 * (incluso uno claro) mantiene contraste suficiente en claro y en oscuro.
 */
export function TaskLabelChip({ etiqueta }: { etiqueta: EtiquetaTareaDTO }) {
  return (
    <span
      className="pill pill-sm max-w-full gap-1.5 bg-[color-mix(in_srgb,var(--label-color)_16%,transparent)] text-on-surface"
      style={{ '--label-color': etiqueta.color } as CSSProperties}
    >
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full border border-outline-variant/40"
        style={{ backgroundColor: etiqueta.color }}
      />
      <span className="truncate">{etiqueta.nombreEtiqueta}</span>
    </span>
  );
}
