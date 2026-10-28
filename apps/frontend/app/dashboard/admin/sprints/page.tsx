import { Suspense } from 'react';
import AdminSprintsClient from './admin-sprints-client';

/**
 * Calendario administrativo de Sprints y reuniones (`?vista=dia|semana|mes|lista`). El cliente lee
 * la query, por eso va dentro de un límite de Suspense (mismo patrón que la
 * bandeja de proyectos).
 */
export default function AdminSprintsPage() {
  return (
    <Suspense fallback={null}>
      <AdminSprintsClient />
    </Suspense>
  );
}
