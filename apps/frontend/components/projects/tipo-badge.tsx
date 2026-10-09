import { tipoBadgeLabel, tipoBadgeStyle } from '@/components/projects/available-project-card';

/** Forma única de la etiqueta de categoría: la misma de la tarjeta de proyecto. */
export const TIPO_BADGE_SHAPE = 'inline-flex h-6.25 items-center rounded-[7px] px-3 text-[12px] font-semibold whitespace-nowrap';

/** Etiqueta de categoría del proyecto (Horas Beca, Extensión, Experiencia). */
export function TipoBadge({ tipo }: { tipo: string }) {
  return <span className={`${TIPO_BADGE_SHAPE} ${tipoBadgeStyle(tipo)}`}>{tipoBadgeLabel(tipo)}</span>;
}
