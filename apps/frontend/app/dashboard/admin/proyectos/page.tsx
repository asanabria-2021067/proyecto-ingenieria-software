import { Suspense } from 'react';
import AdminProjectsClient from './admin-projects-client';

/**
 * VIEW-15 (F012) — bandeja administrativa de proyectos por grupo
 * (`?grupo=activos|revision|cierres|cerrados`). El cliente lee la query, por
 * eso va dentro de un límite de Suspense (mismo patrón que `projects/mine/form`).
 */
export default function AdminProjectsPage() {
  return (
    <Suspense fallback={null}>
      <AdminProjectsClient />
    </Suspense>
  );
}
