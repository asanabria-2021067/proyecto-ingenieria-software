import { tipoBadgeLabel, tipoBadgeStyle } from '@/components/projects/available-project-card';
import { tagShape, type TagSize } from '@/components/ui/tag';

/** Etiqueta de categoría del proyecto (Horas Beca, Extensión, Experiencia): forma `.pill` estándar. */
export function TipoBadge({ tipo, size = 'md' }: { tipo: string; size?: TagSize }) {
  return <span className={tagShape(size, tipoBadgeStyle(tipo))}>{tipoBadgeLabel(tipo)}</span>;
}
