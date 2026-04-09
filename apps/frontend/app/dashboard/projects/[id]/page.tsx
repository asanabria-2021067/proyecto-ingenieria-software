import ProjectDetailClient from './project-detail-client';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({ params }: Props) {
  const { id } = await params;
  return <ProjectDetailClient id={Number(id)} />;
}
