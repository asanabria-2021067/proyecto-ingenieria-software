import { notFound } from 'next/navigation';
import ClosureReviewClient from './closure-review-client';

/**
 * VIEW-14 (F016) — revisión administrativa del cierre
 * (`/dashboard/admin/proyectos/[id]/cierre`). El shell administrativo
 * completo llega por `app/dashboard/layout.tsx`.
 */
export default async function AdminClosureReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId) || projectId <= 0) notFound();
  return <ClosureReviewClient id={projectId} />;
}
