import TaskDetailClient from './task-detail-client';

interface Props {
  params: Promise<{ id: string; taskId: string }>;
}

export default async function TaskDetailPage({ params }: Props) {
  const { id, taskId } = await params;
  return <TaskDetailClient idProyecto={Number(id)} idTarea={Number(taskId)} />;
}
