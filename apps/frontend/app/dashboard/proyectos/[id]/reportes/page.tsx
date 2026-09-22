'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, FileSpreadsheet, FileText, FolderOutput } from 'lucide-react';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { useIsProjectLeader } from '@/hooks/use-is-project-leader';
import { LeaderOnlyNotice } from '@/components/projects/leader-only-notice';
import { ProjectExportButtons } from '@/components/projects/project-export-buttons';

/**
 * T-259/T-260 (HU-164): punto de entrada dedicado a exportar, aparte de los
 * botones ya integrados en Miembros y Analítica — para un líder que llega
 * directo desde el sidebar a "sacar los datos del proyecto" sin pasar por
 * otra pantalla primero. Mismo criterio de acceso que Miembros/Sprints
 * (exclusivo del líder actual); la administración exporta desde su propia
 * vista de solo lectura en `/dashboard/admin/proyectos/[id]`.
 */
export default function ReportesProyectoPage() {
  const { id } = useParams<{ id: string }>();
  const idProyecto = Number(id);

  const { data: proyecto, isLoading: cargandoProyecto } = useProjectDetail(idProyecto);
  const { data: currentUser, isLoading: cargandoUsuario } = useCurrentUser();
  const isLeader = useIsProjectLeader(idProyecto);
  const cargandoPermisos = cargandoProyecto || cargandoUsuario || !currentUser || !proyecto;

  return (
    <div className="mx-auto max-w-[900px] px-4 pb-12 pt-8 md:px-8">
      <Link
        href={`/dashboard/projects/${id}`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-tertiary transition-colors hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al proyecto
      </Link>

      {!cargandoPermisos && !isLeader ? (
        <LeaderOnlyNotice description="No puedes exportar la información de este proyecto." />
      ) : (
        <>
          <div className="mb-8 flex items-center gap-2">
            <FolderOutput className="h-6 w-6 text-primary" aria-hidden="true" />
            <h1 className="font-headline text-3xl font-extrabold text-on-surface">Reportes</h1>
          </div>
          <p className="-mt-6 mb-8 text-sm text-tertiary">
            Exporta la información de {proyecto ? `"${proyecto.tituloProyecto}"` : 'este proyecto'} para
            entregarla fuera de la plataforma, sin copiar datos a mano.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-6">
              <FileSpreadsheet className="mb-3 h-8 w-8 text-primary" aria-hidden="true" />
              <h2 className="mb-1 font-headline text-lg font-bold text-on-surface">CSV de miembros y horas</h2>
              <p className="text-sm text-tertiary">
                Un integrante por fila, con sus horas confirmadas y pendientes. Se abre correctamente en
                Excel en español, con acentos y ñ intactos.
              </p>
            </div>
            <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-6">
              <FileText className="mb-3 h-8 w-8 text-primary" aria-hidden="true" />
              <h2 className="mb-1 font-headline text-lg font-bold text-on-surface">Reporte PDF del proyecto</h2>
              <p className="text-sm text-tertiary">
                Documento listo para entregar: datos del proyecto, líder, miembros, horas y avance por
                Sprint. Incluye el burndown de cada Sprint cerrado (disponible desde que se cierra el
                primero). Los mismos números que ves en la plataforma.
              </p>
            </div>
          </div>

          <div className="mt-8 flex justify-end">
            <ProjectExportButtons idProyecto={idProyecto} />
          </div>
        </>
      )}
    </div>
  );
}
