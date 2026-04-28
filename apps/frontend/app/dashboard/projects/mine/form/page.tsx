'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { ProjectFormContent } from '@/components/projects/ProjectFormContent';

function NewProjectFormContent() {
  const searchParams = useSearchParams();
  const editId = searchParams.get('id') ? Number(searchParams.get('id')) : null;
  return <ProjectFormContent editId={editId} />;
}

export default function NewProjectFormPage() {
  return (
    <Suspense
      fallback={
        <DashboardLayout>
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]" />
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="bg-surface rounded-2xl border border-outline-variant shadow-2xl px-12 py-10 text-tertiary text-sm">
              Cargando formulario...
            </div>
          </div>
        </DashboardLayout>
      }
    >
      <NewProjectFormContent />
    </Suspense>
  );
}
