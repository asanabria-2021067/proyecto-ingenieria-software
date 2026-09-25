'use client';

import { useState } from 'react';
import { FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { useIsProjectLeader } from '@/hooks/use-is-project-leader';
import { useIsAdmin } from '@/hooks/use-current-user';
import { useProjectExport } from '@/hooks/use-project-export';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { ProjectExportDialog } from '@/components/projects/project-export-dialog';
import type { ExportOptions, FormatoExport } from '@/lib/export-options';

interface ProjectExportButtonsProps {
  idProyecto: number;
}

/**
 * Un 400 del backend trae la regla concreta incumplida (fecha anterior a la
 * creación del proyecto, fecha futura...): se muestra tal cual. Cualquier
 * otro fallo (red, 500) no le dice nada útil al usuario y queda genérico.
 */
function mensajeDeError(error: unknown): string {
  const e = error as { statusCode?: number; message?: string } | null;
  return e?.statusCode === 400 && e.message ? e.message : 'No se pudo generar el archivo. Intenta de nuevo.';
}

/** Monta el diálogo solo abierto: así `useProjectDetail` no se consulta hasta que hace falta. */
function DialogoConectado(props: {
  idProyecto: number;
  formato: FormatoExport;
  isPending: boolean;
  onOpenChange: (abierto: boolean) => void;
  onConfirm: (opciones: ExportOptions) => void;
}) {
  const { data: proyecto } = useProjectDetail(props.idProyecto);
  return (
    <ProjectExportDialog
      open
      onOpenChange={props.onOpenChange}
      formato={props.formato}
      isPending={props.isPending}
      fechaCreacionProyecto={proyecto?.fechaCreacion ?? null}
      onConfirm={props.onConfirm}
    />
  );
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
  const [formatoAbierto, setFormatoAbierto] = useState<FormatoExport | null>(null);

  if (!isLeader && !isAdmin) {
    return null;
  }

  const hayError = exportCsv.isError || exportPdf.isError;

  // Un solo diálogo, según el formato pedido; se cierra al terminar (bien o
  // mal — el error se muestra bajo los botones).
  function confirmar(opciones: ExportOptions) {
    const mutation = formatoAbierto === 'csv' ? exportCsv : exportPdf;
    mutation.mutate(opciones, { onSettled: () => setFormatoAbierto(null) });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFormatoAbierto('csv')}
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
          onClick={() => setFormatoAbierto('pdf')}
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
      {formatoAbierto && (
        <DialogoConectado
          idProyecto={idProyecto}
          formato={formatoAbierto}
          isPending={(formatoAbierto === 'csv' ? exportCsv : exportPdf).isPending}
          onOpenChange={(abierto) => !abierto && setFormatoAbierto(null)}
          onConfirm={confirmar}
        />
      )}
      {hayError && (
        <p role="alert" className="text-xs font-medium text-error">
          {mensajeDeError(exportCsv.isError ? exportCsv.error : exportPdf.error)}
        </p>
      )}
    </div>
  );
}
