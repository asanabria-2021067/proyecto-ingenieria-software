'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Crown } from 'lucide-react';
import { LeadershipSection } from '@/components/leadership/leadership-section';
import { LeaderOnlyNotice } from '@/components/projects/leader-only-notice';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useProjectDetail } from '@/hooks/use-project-detail';

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
    <div className="mx-auto max-w-[1400px] px-4 pb-12 pt-8 md:px-8">
      <Link
        href={volverAlProyectoHref}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-tertiary transition-colors hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al proyecto
      </Link>

      {!cargandoPermisos && !isLeader ? (
        <LeaderOnlyNotice description="No puedes acceder al liderazgo de este proyecto." />
      ) : (
        <>
          <div className="mb-8">
            <div className="mb-2 flex items-center gap-2">
              <Crown className="h-6 w-6 text-primary" />
              <h1 className="font-headline text-3xl font-extrabold text-on-surface">Liderazgo</h1>
            </div>
            <p className="text-sm text-tertiary">
              Quién lidera el proyecto, cómo ha cambiado y el estado de las apelaciones.
            </p>
          </div>

          <LeadershipSection
            idProyecto={idProyecto}
            isLeader={isLeader}
            idUsuarioActual={currentUser?.idUsuario ?? null}
          />
        </>
      )}
    </div>
  );
}
