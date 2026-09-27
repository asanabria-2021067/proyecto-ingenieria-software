import { ProjectDescriptionCard } from '@/components/projects/detail/project-description-card';

interface ProjectObjectivesSectionProps {
  objetivos: string[];
}

/**
 * Composición transitoria sobre ProjectDescriptionCard (solo objetivos).
 * HU-154 la retira cuando ProjectDetailClient pase al esqueleto compartido.
 */
export function ProjectObjectivesSection({ objetivos }: ProjectObjectivesSectionProps) {
  return <ProjectDescriptionCard objetivos={objetivos} />;
}
