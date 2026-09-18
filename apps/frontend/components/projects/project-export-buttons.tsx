'use client';

import { FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { useIsProjectLeader } from '@/hooks/use-is-project-leader';
import { useIsAdmin } from '@/hooks/use-current-user';
import { useProjectExport } from '@/hooks/use-project-export';

interface ProjectExportButtonsProps {
  idProyecto: number;
}

/**
 * T-259/T-260/T-261 (HU-164): ocultar el botón NO es la restricción real
 * (el backend rechaza con 403 vía `ProjectReadPolicyService` scope
 * `exportacion`) — esto es solo la conveniencia de no ofrecer una acción que
 * el actor no puede completar. Mismo criterio que el resto de la UI
 * exclusiva de líder (`useIsProjectLeader`), sumado a `useIsAdmin` porque
 * T-261 también permite exportar a la administración.
 */
export function ProjectExportButtons({ idProyecto }: ProjectExportButtonsProps) {
  const isLeader = useIsProjectLeader(idProyecto);
  const isAdmin = useIsAdmin();
  const { exportCsv, exportPdf } = useProjectExport(idProyecto);

  if (!isLeader && !isAdmin) {
    return null;
  }

  const hayError = exportCsv.isError || exportPdf.isError;

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => exportCsv.mutate()}
          disabled={exportCsv.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-bold text-on-surface transition-colors hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-60"
        >
          {exportCsv.isPending ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <FileSpreadsheet className="size-3.5" aria-hidden="true" />
          )}
          {exportCsv.isPending ? 'Exportando…' : 'Exportar CSV'}
        </button>
        <button
          type="button"
          onClick={() => exportPdf.mutate()}
          disabled={exportPdf.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-bold text-on-surface transition-colors hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-60"
        >
          {exportPdf.isPending ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <FileText className="size-3.5" aria-hidden="true" />
          )}
          {exportPdf.isPending ? 'Generando…' : 'Exportar PDF'}
        </button>
      </div>
      {hayError && (
        <p role="alert" className="text-xs font-medium text-error">
          No se pudo generar el archivo. Intenta de nuevo.
        </p>
      )}
    </div>
  );
}
