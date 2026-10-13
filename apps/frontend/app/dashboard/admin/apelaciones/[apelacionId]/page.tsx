import { Suspense } from 'react';
import AppealReviewClient from './appeal-review-client';

/**
 * Revisión y resolución de una apelación de liderazgo
 * (`/dashboard/admin/apelaciones/[apelacionId]`). El shell administrativo
 * llega por `app/dashboard/layout.tsx`.
 */
export default function AdminAppealReviewPage() {
  return (
    <Suspense fallback={null}>
      <AppealReviewClient />
    </Suspense>
  );
}
