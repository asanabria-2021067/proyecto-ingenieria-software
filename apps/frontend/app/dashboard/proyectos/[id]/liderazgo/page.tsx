'use client';

import { useParams } from 'next/navigation';
import { Crown } from 'lucide-react';
import { LeadershipSection } from '@/components/leadership/leadership-section';
import { LeaderOnlyNotice } from '@/components/projects/leader-only-notice';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { ProjectBackLink, ProjectPageHeader, ProjectPageShell } from '@/components/projects/detail/project-page-shell';

/**
 * S7 (VIEW-06, F008) — liderazgo del proyecto en su propia vista. Vivía dentro
 * de «Miembros», donde competía por sitio con la tabla del equipo; aquí tiene
 * la página entera y su entrada en la barra del proyecto.
 *
 * El acceso es el mismo que tenía al estar dentro de Miembros: solo el líder.
 */
export default function LiderazgoProyectoPage() {
  const { id } = useParams<{ id: string }>();
  const idProyecto = Number(id);

  const { data: proyecto, isLoading: cargandoProyecto } = useProjectDetail(idProyecto);
  const { data: currentUser, isLoading: cargandoUsuario } = useCurrentUser();
  const isLeader = !!currentUser && !!proyecto && currentUser.idUsuario === proyecto.creador.idUsuario;
  const cargandoPermisos = cargandoProyecto || cargandoUsuario;
  const volverAlProyectoHref = isLeader ? `/dashboard/projects/${id}` : `/dashboard/proyectos/${id}`;

  return (
    <ProjectPageShell>
      {!cargandoPermisos && !isLeader ? (
        <>
          <ProjectBackLink href={volverAlProyectoHref} label="Volver al proyecto" className="mb-card" />
          <LeaderOnlyNotice description="No puedes acceder al liderazgo de este proyecto." />
        </>
      ) : (
        <>
          <ProjectPageHeader
            back={{ href: volverAlProyectoHref, label: 'Volver al proyecto' }}
            icon={Crown}
            title="Liderazgo"
            description="Quién lidera el proyecto, cómo ha cambiado y el estado de las apelaciones."
          />

          <LeadershipSection
            idProyecto={idProyecto}
            isLeader={isLeader}
            idUsuarioActual={currentUser?.idUsuario ?? null}
          />
        </>
      )}
    </ProjectPageShell>
  );
}
