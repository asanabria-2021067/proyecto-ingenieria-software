'use client';

import { useMutation } from '@tanstack/react-query';
import { fetchProjectExportCsv, fetchProjectExportPdf } from '@/lib/services/exports';
import { downloadBlob } from '@/lib/download-file';
import type { ExportOptions } from '@/lib/export-options';

/**
 * T-259/T-260 (HU-164): dos mutaciones independientes (CSV/PDF) en vez de
 * una sola parametrizada — cada botón necesita su propio `isPending`/
 * `isError` para deshabilitarse y avisar por separado sin que exportar uno
 * bloquee el otro. Cada una recibe las opciones que el usuario eligió en el
 * diálogo de exportación.
 */
export function useProjectExport(idProyecto: number) {
  const exportCsv = useMutation({
    mutationFn: async (opciones: ExportOptions) => {
      const blob = await fetchProjectExportCsv(idProyecto, opciones);
      downloadBlob(blob, `miembros-horas-proyecto-${idProyecto}.csv`);
    },
  });

  const exportPdf = useMutation({
    mutationFn: async (opciones: ExportOptions) => {
      const blob = await fetchProjectExportPdf(idProyecto, opciones);
      downloadBlob(blob, `reporte-proyecto-${idProyecto}.pdf`);
    },
  });

  return { exportCsv, exportPdf };
}
