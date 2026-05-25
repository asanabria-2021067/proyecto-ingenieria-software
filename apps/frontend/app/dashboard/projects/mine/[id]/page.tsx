import { Suspense } from 'react';
import MyProjectViewClient from './my-project-view-client';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function MyProjectViewPage({ params }: Props) {
  const { id } = await params;
  return (
    <Suspense>
      <MyProjectViewClient id={Number(id)} />
    </Suspense>
  );
}
