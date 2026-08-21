import ExitPreparationWorkspaceClient from './exit-preparation-workspace-client';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ExitPreparationWorkspacePage({ params }: Props) {
  const { id } = await params;
  return <ExitPreparationWorkspaceClient id={Number(id)} />;
}
