import type * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Tonos semánticos de etiqueta. Cada uno es un par `--color-tag-*` /
 * `--color-on-tag-*` de `app/global.css`, con variante propia en `.dark`.
 * `accent`, `warning` y `error` son los nombres históricos de `lime`,
 * `amber` y `red` (mismas clases); se aceptan para no romper a quien los usa.
 */
export const TAG_TONES = [
  'neutral',
  'subtle',
  'sage',
  'green',
  'success',
  'lime',
  'forest',
  'closed',
  'blue',
  'violet',
  'turquoise',
  'amber',
  'orange',
  'red',
  'slate',
] as const;

export type TagTone = (typeof TAG_TONES)[number] | 'accent' | 'warning' | 'error';

/** `sm`: tablas compactas, calendarios y listas. `md`: tarjetas y estados. `lg`: solo cabeceras que lo justifiquen. */
export type TagSize = 'sm' | 'md' | 'lg';

/** Forma de una etiqueta estándar (`.pill` y su tamaño), sin tono: para mapas de dominio que ya traen la clase `pill-<tono>`. */
export function tagShape(size: TagSize = 'md', className?: string): string {
  return cn('pill', size !== 'md' && `pill-${size}`, className);
}

/** Clases de una etiqueta estándar: forma `.pill`, tono y tamaño. */
export function tagClass(tone: TagTone, size: TagSize = 'md', className?: string): string {
  return tagShape(size, cn(`pill-${tone}`, className));
}

export interface TagProps extends React.ComponentProps<'span'> {
  tone?: TagTone;
  size?: TagSize;
}

/**
 * Etiqueta estándar de UVGenius (estado, categoría, prioridad…): la misma
 * forma en vistas de estudiante y de administrador. Un icono hijo (`<svg>`)
 * se dimensiona solo.
 */
export function Tag({ tone = 'neutral', size = 'md', className, ...props }: TagProps) {
  return <span data-slot="tag" className={tagClass(tone, size, className)} {...props} />;
}
