import { ProjectFormContent } from '@/components/projects/ProjectFormContent';

interface EditarProyectoPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditarProyectoPage({ params }: EditarProyectoPageProps) {
  const { id } = await params;
  return <ProjectFormContent editId={Number(id)} />;
}
