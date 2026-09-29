'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { useIsProjectLeader } from '@/hooks/use-is-project-leader';
import { useProjectExport } from '@/hooks/use-project-export';
import { LeaderOnlyNotice } from '@/components/projects/leader-only-notice';
import { ProjectExportButtons } from '@/components/projects/project-export-buttons';
import { ProjectExportDialog } from '@/components/projects/project-export-dialog';
import { ProjectBackLink, ProjectPageHeader, ProjectPageShell } from '@/components/projects/detail/project-page-shell';
import type { ExportOptions, FormatoExport } from '@/lib/export-options';

function mensajeDeErrorExport(error: unknown): string {
  const e = error as { statusCode?: number; message?: string } | null;
  return e?.statusCode === 400 && e.message ? e.message : 'No se pudo generar el archivo. Intenta de nuevo.';
}

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

  // Las tarjetas descriptivas de abajo lucen igual que las demas tarjetas
  // clickeables de la app (mismo card-base), asi que la gente intenta
  // hacerles click esperando que exporten — ahora tambien lo hacen, con su
  // propia instancia del mismo flujo de exportacion que los botones del
  // encabezado (ProjectExportButtons), sin duplicar su estado.
  const { exportCsv, exportPdf } = useProjectExport(idProyecto);
  const [formatoAbierto, setFormatoAbierto] = useState<FormatoExport | null>(null);
  const mutacionAbierta = formatoAbierto === 'csv' ? exportCsv : formatoAbierto === 'pdf' ? exportPdf : null;

  function confirmarExportDesdeTarjeta(opciones: ExportOptions) {
    mutacionAbierta?.mutate(opciones, { onSettled: () => setFormatoAbierto(null) });
  }

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
            <button
              type="button"
              onClick={() => setFormatoAbierto('csv')}
              disabled={exportCsv.isPending}
              className="card-base cursor-pointer text-left transition-colors hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-60"
            >
              {exportCsv.isPending ? (
                <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" aria-hidden="true" />
              ) : (
                <FileSpreadsheet className="mb-3 h-8 w-8 text-primary" aria-hidden="true" />
              )}
              <h2 className="mb-1 font-headline text-lg font-bold text-on-surface">CSV de miembros y horas</h2>
              <p className="text-sm text-tertiary">
                Un integrante por fila, con sus horas confirmadas y pendientes. Se abre correctamente en
                Excel en español, con acentos y ñ intactos.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setFormatoAbierto('pdf')}
              disabled={exportPdf.isPending}
              className="card-base cursor-pointer text-left transition-colors hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-60"
            >
              {exportPdf.isPending ? (
                <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" aria-hidden="true" />
              ) : (
                <FileText className="mb-3 h-8 w-8 text-primary" aria-hidden="true" />
              )}
              <h2 className="mb-1 font-headline text-lg font-bold text-on-surface">Reporte PDF del proyecto</h2>
              <p className="text-sm text-tertiary">
                Documento listo para entregar: datos del proyecto, líder, miembros, horas y avance por
                Sprint. Incluye el burndown de cada Sprint cerrado (disponible desde que se cierra el
                primero). Los mismos números que ves en la plataforma.
              </p>
            </button>
          </div>

          {formatoAbierto && (
            <ProjectExportDialog
              open
              onOpenChange={(abierto) => !abierto && setFormatoAbierto(null)}
              formato={formatoAbierto}
              isPending={mutacionAbierta?.isPending ?? false}
              fechaCreacionProyecto={proyecto?.fechaCreacion ?? null}
              onConfirm={confirmarExportDesdeTarjeta}
            />
          )}
          {(exportCsv.isError || exportPdf.isError) && (
            <p role="alert" className="mt-stack text-xs font-medium text-error">
              {mensajeDeErrorExport(exportCsv.isError ? exportCsv.error : exportPdf.error)}
            </p>
          )}
        </>
      )}
    </ProjectPageShell>
  );
}
