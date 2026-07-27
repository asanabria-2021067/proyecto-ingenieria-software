import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function LegacyProjectBoardPage({ params }: Props) {
  const { id } = await params;
  redirect(`/dashboard/projects/${id}/kanban`);
}
