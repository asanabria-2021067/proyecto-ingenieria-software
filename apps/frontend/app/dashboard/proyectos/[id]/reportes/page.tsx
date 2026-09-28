'use client';

import { useParams } from 'next/navigation';
import { FileSpreadsheet, FileText, FolderOutput } from 'lucide-react';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { useIsProjectLeader } from '@/hooks/use-is-project-leader';
import { LeaderOnlyNotice } from '@/components/projects/leader-only-notice';
import { ProjectExportButtons } from '@/components/projects/project-export-buttons';
import { ProjectBackLink, ProjectPageHeader, ProjectPageShell } from '@/components/projects/detail/project-page-shell';

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
    <ProjectPageShell>
      {!cargandoPermisos && !isLeader ? (
        <>
          <ProjectBackLink href={`/dashboard/projects/${id}`} label="Volver al proyecto" className="mb-card" />
          <LeaderOnlyNotice description="No puedes exportar la información de este proyecto." />
        </>
      ) : (
        <>
          {/* Una sola ubicación para exportar: las acciones del encabezado. */}
          <ProjectPageHeader
            back={{ href: `/dashboard/projects/${id}`, label: 'Volver al proyecto' }}
            icon={FolderOutput}
            title="Reportes"
            description={
              <>
                Exporta la información de {proyecto ? `"${proyecto.tituloProyecto}"` : 'este proyecto'} para
                entregarla fuera de la plataforma, sin copiar datos a mano.
              </>
            }
            actions={<ProjectExportButtons idProyecto={idProyecto} />}
          />

          {/* Ancho normal del shell: sin contenedor centrado más estrecho. */}
          <div className="grid gap-grid @2xl/project:grid-cols-2">
            <div className="card-base">
              <FileSpreadsheet className="mb-3 h-8 w-8 text-primary" aria-hidden="true" />
              <h2 className="mb-1 font-headline text-lg font-bold text-on-surface">CSV de miembros y horas</h2>
              <p className="text-sm text-tertiary">
                Un integrante por fila, con sus horas confirmadas y pendientes. Se abre correctamente en
                Excel en español, con acentos y ñ intactos.
              </p>
            </div>
            <div className="card-base">
              <FileText className="mb-3 h-8 w-8 text-primary" aria-hidden="true" />
              <h2 className="mb-1 font-headline text-lg font-bold text-on-surface">Reporte PDF del proyecto</h2>
              <p className="text-sm text-tertiary">
                Documento listo para entregar: datos del proyecto, líder, miembros, horas y avance por
                Sprint. Incluye el burndown de cada Sprint cerrado (disponible desde que se cierra el
                primero). Los mismos números que ves en la plataforma.
              </p>
            </div>
          </div>
        </>
      )}
    </ProjectPageShell>
  );
}
