import KanbanWorkspaceClient from './kanban-workspace-client';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function KanbanWorkspacePage({ params }: Props) {
  const { id } = await params;
  return <KanbanWorkspaceClient id={Number(id)} />;
}
