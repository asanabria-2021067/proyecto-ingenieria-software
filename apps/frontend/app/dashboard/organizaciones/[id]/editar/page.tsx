'use client';

import { useParams } from 'next/navigation';
import { dashboardPage } from '@/components/layout/dashboard-page';
import { OrgForm } from '@/components/organizations/org-form';
import { SkeletonDetail } from '@/components/ui/skeleton';
import { useOrganizacion } from '@/hooks/use-organizations';
import { puedeGestionar } from '@/lib/organizations/roles';

export default function EditarOrganizacionPage() {
  const id = Number(useParams<{ id: string }>().id);
  const { data: org, isLoading } = useOrganizacion(id);

  if (isLoading) {
    return <SkeletonDetail label="Cargando organización" sections={2} className={dashboardPage('pt-7 pb-10')} />;
  }
  if (!org || !puedeGestionar(org.miRol) || org.archivada) {
    return (
      <div className={dashboardPage('pt-7 pb-10')}>
        <p role="alert" className="text-sm text-on-surface-variant">
          No puedes editar esta organización.
        </p>
      </div>
    );
  }
  return <OrgForm org={org} />;
}
