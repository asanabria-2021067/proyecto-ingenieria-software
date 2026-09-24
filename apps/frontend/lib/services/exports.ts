import { apiFetchBlob } from '@/lib/api/client';
import { DEFAULT_EXPORT_OPTIONS, buildExportQuery, type ExportOptions } from '@/lib/export-options';

/** T-259 — `GET /proyectos/:id/exportar/csv` → miembros y horas del proyecto en CSV (acepta rango de fechas). */
export function fetchProjectExportCsv(
  idProyecto: number,
  opciones: ExportOptions = DEFAULT_EXPORT_OPTIONS,
): Promise<Blob> {
  return apiFetchBlob(`/proyectos/${idProyecto}/exportar/csv${buildExportQuery('csv', opciones)}`, {
    headers: { Accept: 'text/csv' },
  });
}

/** T-260 — `GET /proyectos/:id/exportar/pdf` → reporte del proyecto con las opciones elegidas. */
export function fetchProjectExportPdf(
  idProyecto: number,
  opciones: ExportOptions = DEFAULT_EXPORT_OPTIONS,
): Promise<Blob> {
  return apiFetchBlob(`/proyectos/${idProyecto}/exportar/pdf${buildExportQuery('pdf', opciones)}`);
}
