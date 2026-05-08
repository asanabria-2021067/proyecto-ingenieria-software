'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function EditarProyectoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/dashboard/projects/mine/form?id=${id}`);
  }, [id, router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-tertiary">Redirigiendo al editor...</p>
    </div>
  );
}
