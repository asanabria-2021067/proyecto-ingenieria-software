'use client';

import { useParams } from 'next/navigation';
import { ProjectSidebar } from '@/components/projects/project-sidebar';
import { ProjectMobileNav } from '@/components/projects/navigation/project-mobile-nav';

export default function ProyectoLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const idProyecto = Number(id);

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-0">
      <ProjectSidebar idProyecto={idProyecto} />
      <div className="@container/project min-w-0 flex-1 overflow-y-auto">
        {/* HU-154: sin sidebar del proyecto por debajo de lg; esta barra la sustituye.
            @container/project: la rejilla del detalle (ProjectContentGrid) mide este
            ancho, no el de la ventana. */}
        <ProjectMobileNav idProyecto={idProyecto} />
        {children}
      </div>
    </div>
  );
}
