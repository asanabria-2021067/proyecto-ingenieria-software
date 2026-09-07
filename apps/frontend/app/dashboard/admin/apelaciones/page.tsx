import { Suspense } from 'react';
import AppealsInboxClient from './appeals-inbox-client';

/**
 * VIEW-18 (F015) — bandeja administrativa de apelaciones de liderazgo
 * (`/dashboard/admin/apelaciones?estado=`). El shell administrativo llega
 * solo por `app/dashboard/layout.tsx`.
 */
export default function AdminAppealsPage() {
  return (
    <Suspense fallback={null}>
      <AppealsInboxClient />
    </Suspense>
  );
}
