import { apiFetchBlob } from '@/lib/api/client';

/** T-259 — `GET /proyectos/:id/exportar/csv` → miembros y horas del proyecto en CSV. */
export function fetchProjectExportCsv(idProyecto: number): Promise<Blob> {
  return apiFetchBlob(`/proyectos/${idProyecto}/exportar/csv`, {
    headers: { Accept: 'text/csv' },
  });
}

/** T-260 — `GET /proyectos/:id/exportar/pdf` → reporte del proyecto (avance, miembros, horas) en PDF. */
export function fetchProjectExportPdf(idProyecto: number): Promise<Blob> {
  return apiFetchBlob(`/proyectos/${idProyecto}/exportar/pdf`);
}
