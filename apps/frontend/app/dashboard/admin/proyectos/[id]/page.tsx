import { Suspense } from 'react';
import AdminProjectDetailClient from './admin-project-detail-client';

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * VIEW-16 (F013) — detalle administrativo de SOLO LECTURA
 * (`/dashboard/admin/proyectos/[id]`). El shell administrativo llega solo por
 * `app/dashboard/layout.tsx` (`isAdminOnlyRoute`).
 */
export default async function AdminProjectDetailPage({ params }: Props) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <AdminProjectDetailClient id={Number(id)} />
    </Suspense>
  );
}
